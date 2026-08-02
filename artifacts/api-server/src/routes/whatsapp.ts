/**
 * WhatsApp Cloud API webhook routes.
 *
 * GET  /webhook/whatsapp  — Meta hub-challenge verification
 * POST /webhook/whatsapp  — Inbound message handler (async PDF pipeline)
 *
 * Full pipeline per message:
 *   download PDF → extract text → LLM extraction → upsert Sheets → WhatsApp reply
 *
 * Security: POST requests are validated with X-Hub-Signature-256 before processing.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "crypto";
import type { Logger } from "pino";
import {
  downloadWhatsAppMedia,
  normalisePhone,
  sendWhatsAppMessage,
} from "../lib/whatsappClient.js";
import { extractTextFromPdf } from "../lib/extractPdf.js";
import { extractLabResultsFromText } from "../lib/extractLabResults.js";
import { saveExtractionResult } from "../lib/extractionStore.js";
import { upsertLabResults } from "../lib/sheetsSync.js";
import { getSheetId } from "../lib/sheetsClient.js";
import {
  composeSuccessReply,
  composeErrorReply,
  composeEmptyReply,
} from "../lib/replyComposer.js";

const router: IRouter = Router();

// ─── GET: Meta webhook verification ────────────────────────────────────────

router.get("/webhook/whatsapp", (req: Request, res: Response): void => {
  const mode = req.query["hub.mode"];
  const challenge = req.query["hub.challenge"];
  const token = req.query["hub.verify_token"];

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!verifyToken) {
    req.log.error("WHATSAPP_VERIFY_TOKEN not set");
    res.status(500).json({ error: "Server misconfiguration" });
    return;
  }

  if (mode === "subscribe" && token === verifyToken) {
    req.log.info("WhatsApp webhook verified");
    res.status(200).send(String(challenge));
    return;
  }

  req.log.warn({ mode, token }, "Webhook verification failed");
  res.status(403).json({ error: "Forbidden" });
});

// ─── POST: Inbound message handler ─────────────────────────────────────────

router.post(
  "/webhook/whatsapp",
  async (req: Request, res: Response): Promise<void> => {
    // 1. Verify X-Hub-Signature-256
    if (!verifySignature(req)) {
      req.log.warn("Invalid X-Hub-Signature-256 — rejecting request");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Respond 200 immediately so Meta doesn't retry (pipeline runs async).
    res.status(200).json({ status: "ok" });

    const body = req.body as WhatsAppWebhookPayload;
    const entries = body?.entry ?? [];
    const log = req.log as Logger;

    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const messages = change.value?.messages ?? [];

        for (const message of messages) {
          const receivedAt = new Date().toISOString();
          const rawPhone = message.from ?? "";
          const participantId = normalisePhone(rawPhone);
          const messageId = message.id ?? `msg_${Date.now()}`;

          log.info(
            { participantId, messageId, type: message.type },
            "Inbound WhatsApp message",
          );

          if (message.type !== "document") {
            log.info({ type: message.type }, "Ignoring non-document message");
            continue;
          }

          const mediaId = message.document?.id;
          const mimeType = message.document?.mime_type ?? "";

          if (!mediaId) {
            log.warn({ messageId }, "Document message missing media id");
            continue;
          }

          if (
            !mimeType.includes("pdf") &&
            !mimeType.includes("octet-stream")
          ) {
            log.info({ mimeType }, "Non-PDF document, skipping");
            continue;
          }

          // Fire-and-forget — errors must not crash the process
          processPdf({
            mediaId,
            participantId,
            messageId,
            receivedAt,
            log,
          }).catch((err: unknown) => {
            log.error({ err, messageId }, "Unhandled error in PDF pipeline");
          });
        }
      }
    }
  },
);

// ─── Core pipeline ───────────────────────────────────────────────────────────

interface ProcessPdfArgs {
  mediaId: string;
  participantId: string;
  messageId: string;
  receivedAt: string;
  log: Logger;
}

async function processPdf({
  mediaId,
  participantId,
  messageId,
  receivedAt,
  log,
}: ProcessPdfArgs): Promise<void> {
  // ── Step 1: download PDF ────────────────────────────────────────────────
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await downloadWhatsAppMedia(mediaId);
    log.info({ messageId, bytes: pdfBuffer.length }, "PDF downloaded");
  } catch (err) {
    log.error({ err, messageId }, "PDF download failed");
    saveExtractionResult({
      status: "error",
      participantId,
      messageId,
      timestamp: receivedAt,
      reason: `PDF download failed: ${String(err)}`,
      source: "whatsapp",
    });
    await trySendReply(
      participantId,
      composeErrorReply("Could not download your PDF"),
      log,
    );
    return;
  }

  // ── Step 2: extract text ────────────────────────────────────────────────
  let rawText: string;
  try {
    rawText = await extractTextFromPdf(pdfBuffer);
    log.info({ messageId, chars: rawText.length }, "PDF text extracted");
  } catch (err) {
    log.error({ err, messageId }, "PDF text extraction failed");
    saveExtractionResult({
      status: "error",
      participantId,
      messageId,
      timestamp: new Date().toISOString(),
      reason: `Text extraction failed: ${String(err)}`,
      source: "whatsapp",
    });
    await trySendReply(
      participantId,
      composeErrorReply("Could not read text from your PDF"),
      log,
    );
    return;
  }

  // ── Step 3: LLM structured extraction ──────────────────────────────────
  const llmResult = await extractLabResultsFromText(rawText);

  if ("kind" in llmResult) {
    // Extraction error
    log.warn({ messageId, reason: llmResult.reason }, "LLM extraction failed");
    saveExtractionResult({
      status: "error",
      participantId,
      messageId,
      timestamp: new Date().toISOString(),
      reason: llmResult.reason,
      source: "whatsapp",
    });
    await trySendReply(participantId, composeErrorReply(), log);
    return;
  }

  // Save to in-memory store (used by Task 3 Drive watcher for monitoring)
  saveExtractionResult({
    status: "success",
    participantId,
    messageId,
    timestamp: new Date().toISOString(),
    rows: llmResult,
    source: "whatsapp",
  });

  log.info({ messageId, rows: llmResult.length }, "Lab results extracted");

  // ── Step 4: upsert into Google Sheets ──────────────────────────────────
  let sheetWriteOk = false;
  try {
    if (llmResult.length > 0) {
      await upsertLabResults(participantId, llmResult, messageId, "whatsapp");
      sheetWriteOk = true;
      log.info({ messageId }, "Sheets upsert complete");
    }
  } catch (err) {
    log.error({ err, messageId }, "Sheets upsert failed — will still reply");
  }

  // ── Step 5: WhatsApp reply ──────────────────────────────────────────────
  let replyText: string;
  try {
    const sheetId = getSheetId();
    if (llmResult.length === 0) {
      replyText = composeEmptyReply(sheetId);
    } else if (sheetWriteOk) {
      replyText = composeSuccessReply(llmResult, sheetId);
    } else {
      // Extraction worked but sheet write failed — still tell them what was found
      replyText =
        composeSuccessReply(llmResult, sheetId) +
        "\n\n⚠️ Note: there was a problem saving to the sheet. The study team has been notified.";
    }
  } catch {
    // GOOGLE_SHEET_ID not set — give a partial reply without the link
    const count = llmResult.length;
    replyText =
      count > 0
        ? `✅ Extracted ${count} markers from your report.`
        : composeErrorReply();
  }

  await trySendReply(participantId, replyText, log);
}

// ─── Reply helper ─────────────────────────────────────────────────────────────

/**
 * Send a WhatsApp reply, eating errors so they never suppress the main pipeline.
 */
async function trySendReply(
  to: string,
  text: string,
  log: Logger,
): Promise<void> {
  try {
    await sendWhatsAppMessage(to, text);
    log.info({ to }, "WhatsApp reply sent");
  } catch (err) {
    log.error({ err, to }, "WhatsApp reply failed");
  }
}

// ─── Signature verification ──────────────────────────────────────────────────

type RequestWithRawBody = Request & { rawBody?: Buffer };

function verifySignature(req: RequestWithRawBody): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    req.log.warn("WHATSAPP_APP_SECRET not set — skipping signature check");
    return true;
  }

  const signature = req.headers["x-hub-signature-256"];
  if (!signature || typeof signature !== "string") return false;

  if (!req.rawBody) {
    req.log.warn("rawBody unavailable for signature verification");
    return false;
  }

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(req.rawBody).digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    );
  } catch {
    return false;
  }
}

// ─── WhatsApp payload types ──────────────────────────────────────────────────

interface WhatsAppWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      value?: {
        messages?: Array<{
          id?: string;
          from?: string;
          type?: string;
          timestamp?: string;
          document?: {
            id?: string;
            mime_type?: string;
            sha256?: string;
            filename?: string;
          };
          text?: { body?: string };
        }>;
      };
      field?: string;
    }>;
  }>;
}

export default router;
