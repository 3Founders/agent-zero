/**
 * WhatsApp Cloud API webhook routes.
 *
 * GET  /webhook/whatsapp  — Meta hub-challenge verification
 * POST /webhook/whatsapp  — Inbound message handler (async PDF pipeline)
 *
 * Security: POST requests are validated with X-Hub-Signature-256 before processing.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "crypto";
import type { Logger } from "pino";
import {
  downloadWhatsAppMedia,
  normalisePhone,
} from "../lib/whatsappClient.js";
import { extractTextFromPdf } from "../lib/extractPdf.js";
import { extractLabResultsFromText } from "../lib/extractLabResults.js";
import {
  saveExtractionResult,
  type ExtractionResult,
} from "../lib/extractionStore.js";

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

    // 2. Extract messages from the payload
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

          // Only handle document (PDF) messages
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
  // Step 1 — download PDF from WhatsApp
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
    return;
  }

  // Step 2 — extract text (pdf-parse + OCR fallback)
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
    return;
  }

  // Step 3 — LLM structured extraction
  const llmResult = await extractLabResultsFromText(rawText);

  if ("kind" in llmResult) {
    log.warn({ messageId, reason: llmResult.reason }, "LLM extraction failed");
    const result: ExtractionResult = {
      status: "error",
      participantId,
      messageId,
      timestamp: new Date().toISOString(),
      reason: llmResult.reason,
      source: "whatsapp",
    };
    saveExtractionResult(result);
    return;
  }

  log.info({ messageId, rows: llmResult.length }, "Lab results extracted");

  saveExtractionResult({
    status: "success",
    participantId,
    messageId,
    timestamp: new Date().toISOString(),
    rows: llmResult,
    source: "whatsapp",
  });
}

// ─── Signature verification ──────────────────────────────────────────────────

type RequestWithRawBody = Request & { rawBody?: Buffer };

function verifySignature(req: RequestWithRawBody): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    // Dev mode: skip verification if no secret is configured.
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
