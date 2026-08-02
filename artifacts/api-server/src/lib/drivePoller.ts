/**
 * Google Drive folder poller.
 *
 * Polls a shared Drive folder every DRIVE_POLL_INTERVAL_MS (default 60s)
 * for new or updated PDF files. Each file is run through the same
 * extraction → Sheets upsert → WhatsApp reply pipeline as the webhook path.
 *
 * Reliability guarantees:
 *  - Only one tick runs at a time (recursive setTimeout prevents overlap).
 *  - Files are marked as processed ONLY after the full pipeline succeeds.
 *  - Transient failures (download errors, Sheets API errors) are queued in a
 *    pendingRetry map and re-attempted on every subsequent tick.
 *  - Permanent failures (bad PDF, garbled text, LLM refusal) are marked
 *    processed to prevent infinite retry loops on unfixable files.
 *
 * Processed-file state is kept in memory and flushed to a JSON sidecar
 * (processed-files.json in the process CWD) to survive restarts.
 *
 * Required env vars:
 *   GOOGLE_DRIVE_FOLDER_ID     — Drive folder to watch
 *   GOOGLE_SERVICE_ACCOUNT_JSON + GOOGLE_SHEET_ID — from Task 2
 *
 * Optional:
 *   DRIVE_POLL_INTERVAL_MS     — polling interval in ms (default: 60000)
 */

import { readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { logger } from "./logger.js";
import { getDriveClient } from "./sheetsClient.js";
import { extractTextFromPdf } from "./extractPdf.js";
import { extractLabResultsFromText } from "./extractLabResults.js";
import { saveExtractionResult } from "./extractionStore.js";
import { upsertLabResults } from "./sheetsSync.js";
import { getSheetId } from "./sheetsClient.js";
import { sendWhatsAppMessage } from "./whatsappClient.js";
import {
  composeSuccessReply,
  composeErrorReply,
  composeEmptyReply,
} from "./replyComposer.js";

/** Minimal log interface satisfied by both the singleton logger and child loggers. */
type Log = Pick<typeof logger, "info" | "error" | "warn" | "debug">;

// ─── Processed-file tracker ───────────────────────────────────────────────────

interface TrackedFile {
  fileId: string;
  modifiedTime: string; // ISO string — re-process if changed
  processedAt: string;
}

const TRACKER_PATH = join(process.cwd(), "processed-files.json");

/** In-memory map: fileId → modifiedTime at last successful process */
const processed = new Map<string, string>();

/**
 * Files that encountered transient errors (download/Sheets API).
 * Re-attempted on every subsequent tick until they succeed or permanently fail.
 */
const pendingRetry = new Map<string, DriveFile>();

async function loadTracker(): Promise<void> {
  try {
    const raw = await readFile(TRACKER_PATH, "utf8");
    const entries: TrackedFile[] = JSON.parse(raw);
    for (const e of entries) {
      processed.set(e.fileId, e.modifiedTime);
    }
    logger.info({ count: processed.size }, "Drive tracker loaded from disk");
  } catch {
    logger.info("No Drive tracker found, starting fresh");
  }
}

async function saveTracker(): Promise<void> {
  const entries: TrackedFile[] = Array.from(processed.entries()).map(
    ([fileId, modifiedTime]) => ({
      fileId,
      modifiedTime,
      processedAt: new Date().toISOString(),
    }),
  );
  try {
    await writeFile(TRACKER_PATH, JSON.stringify(entries, null, 2), "utf8");
  } catch (err) {
    logger.warn({ err }, "Could not save Drive tracker to disk");
  }
}

// ─── Phone number extraction ──────────────────────────────────────────────────

/**
 * Try to extract an E.164 phone number from a filename.
 * Handles both:
 *   +919876543210_day30.pdf
 *   919876543210_report.pdf  (without leading +)
 *   +44 7700 900123.pdf      (with spaces — stripped)
 */
const PHONE_RE = /(\+?\d[\d\s\-]{9,14}\d)/;

export function parsePhoneFromFilename(filename: string): string | null {
  const withoutExt = filename.replace(/\.pdf$/i, "").replace(/[_\-]/g, " ");
  const match = withoutExt.match(PHONE_RE);
  if (!match) return null;

  const digits = match[1].replace(/[\s\-]/g, "");
  const digitOnly = digits.replace(/\D/g, "");
  if (digitOnly.length < 10 || digitOnly.length > 15) return null;

  return digits.startsWith("+") ? digits : `+${digits}`;
}

// ─── Drive file listing ───────────────────────────────────────────────────────

interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
}

async function listNewOrUpdatedPdfs(
  folderId: string,
  since: string,
): Promise<DriveFile[]> {
  const drive = getDriveClient();

  const query = [
    `'${folderId}' in parents`,
    `mimeType='application/pdf'`,
    `modifiedTime > '${since}'`,
    `trashed = false`,
  ].join(" and ");

  const res = await drive.files.list({
    q: query,
    fields: "files(id, name, modifiedTime)",
    orderBy: "modifiedTime asc",
    pageSize: 100,
  });

  return (res.data.files ?? []) as DriveFile[];
}

// ─── Drive file download ──────────────────────────────────────────────────────

async function downloadDriveFile(fileId: string): Promise<Buffer> {
  const drive = getDriveClient();

  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" },
  );

  return Buffer.from(res.data as ArrayBuffer);
}

// ─── Per-file pipeline ────────────────────────────────────────────────────────

/**
 * Pipeline result categories:
 *  - "ok"                → success; mark file as processed and do not retry.
 *  - "permanent_failure" → corrupted PDF / LLM can't parse; mark processed,
 *                          send error reply, do not retry.
 *  - "transient_failure" → network/API error; do NOT mark processed; add to
 *                          pendingRetry so the next tick retries automatically.
 */
type ProcessResult = "ok" | "permanent_failure" | "transient_failure";

async function processFile(file: DriveFile): Promise<ProcessResult> {
  const { id: fileId, name: filename } = file;
  const log = logger.child({ fileId, filename, source: "drive" }) as Log;

  log.info("Processing Drive PDF");

  // ── Download ────────────────────────────────────────────────────────────
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await downloadDriveFile(fileId);
    log.info({ bytes: pdfBuffer.length }, "Drive PDF downloaded");
  } catch (err) {
    log.error({ err }, "Drive PDF download failed — will retry");
    return "transient_failure";
  }

  // ── Resolve participant ─────────────────────────────────────────────────
  const phone = parsePhoneFromFilename(filename);
  const participantId = phone ?? `drive:${fileId}`;
  const messageId = `drive_${fileId}`;

  // ── Extract text ────────────────────────────────────────────────────────
  let rawText: string;
  try {
    rawText = await extractTextFromPdf(pdfBuffer);
    log.info({ chars: rawText.length }, "Drive PDF text extracted");
  } catch (err) {
    log.error({ err }, "Drive PDF text extraction failed — permanent failure");
    saveExtractionResult({
      status: "error",
      participantId,
      messageId,
      timestamp: new Date().toISOString(),
      reason: `Text extraction failed: ${String(err)}`,
      source: "drive",
    });
    if (phone) await trySendDriveReply(phone, composeErrorReply(), log);
    return "permanent_failure"; // Corrupted PDF — no point retrying
  }

  // ── LLM extraction ──────────────────────────────────────────────────────
  const llmResult = await extractLabResultsFromText(rawText);

  if ("kind" in llmResult) {
    if (llmResult.retryable) {
      // Transient LLM failure (API error, rate limit, JSON instability) — retry next tick
      log.warn(
        { reason: llmResult.reason },
        "LLM extraction failed (transient) — will retry",
      );
      return "transient_failure";
    }

    // Permanent failure — text too short / unreadable; retrying won't help
    log.warn(
      { reason: llmResult.reason },
      "LLM extraction failed (permanent) — marking done",
    );
    saveExtractionResult({
      status: "error",
      participantId,
      messageId,
      timestamp: new Date().toISOString(),
      reason: llmResult.reason,
      source: "drive",
    });
    if (phone) await trySendDriveReply(phone, composeErrorReply(), log);
    return "permanent_failure";
  }

  log.info({ rows: llmResult.length }, "Drive lab results extracted");

  saveExtractionResult({
    status: "success",
    participantId,
    messageId,
    timestamp: new Date().toISOString(),
    rows: llmResult,
    source: "drive",
  });

  // ── Sheets upsert ───────────────────────────────────────────────────────
  // If this fails, return transient_failure so the next tick retries the
  // full file (extraction is fast enough to redo; Sheets errors are transient).
  let sheetWriteOk = false;
  try {
    if (llmResult.length > 0) {
      await upsertLabResults(participantId, llmResult, messageId, "drive");
      sheetWriteOk = true;
      log.info("Drive Sheets upsert complete");
    } else {
      sheetWriteOk = true; // Nothing to write — counts as success
    }
  } catch (err) {
    log.error(
      { err },
      "Drive Sheets upsert failed — will retry on next tick",
    );
    return "transient_failure";
  }

  // ── WhatsApp reply (only if phone resolved) ─────────────────────────────
  if (!phone) {
    log.info("No phone in filename — skipping WhatsApp reply");
  } else {
    let replyText: string;
    try {
      const sheetId = getSheetId();
      replyText =
        llmResult.length === 0
          ? composeEmptyReply(sheetId)
          : composeSuccessReply(llmResult, sheetId);
    } catch {
      replyText =
        llmResult.length > 0
          ? `✅ Extracted ${llmResult.length} markers from your report.`
          : composeErrorReply();
    }
    await trySendDriveReply(phone, replyText, log);
  }

  return sheetWriteOk ? "ok" : "transient_failure";
}

async function trySendDriveReply(
  to: string,
  text: string,
  log: Log,
): Promise<void> {
  try {
    await sendWhatsAppMessage(to, text);
    log.info({ to }, "Drive WhatsApp reply sent");
  } catch (err) {
    log.error({ err, to }, "Drive WhatsApp reply failed");
  }
}

// ─── Main poller ──────────────────────────────────────────────────────────────

let _pollerStarted = false;

/**
 * Start the Drive folder poller. Safe to call multiple times — only starts once.
 * Uses a recursive setTimeout so ticks never overlap — the next tick is only
 * scheduled after the current one fully completes.
 */
export async function startDrivePoller(
  intervalMs = Number(process.env.DRIVE_POLL_INTERVAL_MS ?? 60_000),
): Promise<void> {
  if (_pollerStarted) return;
  _pollerStarted = true;

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) {
    logger.warn("GOOGLE_DRIVE_FOLDER_ID not set — Drive poller disabled");
    return;
  }

  await loadTracker();

  // Look back one interval so files added just before server start are caught.
  let lastPollTime = new Date(Date.now() - intervalMs).toISOString();

  logger.info({ folderId, intervalMs }, "Drive poller started");

  const tick = async (): Promise<void> => {
    const tickStart = new Date().toISOString();
    logger.debug({ since: lastPollTime }, "Drive poll tick");

    // ── 1. Collect files to process this tick ──────────────────────────────
    // a) New/updated files since last successful poll
    let newFiles: DriveFile[] = [];
    try {
      newFiles = await listNewOrUpdatedPdfs(folderId, lastPollTime);
    } catch (err) {
      logger.error({ err }, "Drive file listing failed — skipping tick");
      return; // Do not advance lastPollTime; retry next tick
    }

    // b) Files queued for retry from previous ticks
    const retryFiles = Array.from(pendingRetry.values());

    // Deduplicate: if a retry file also appears in newFiles (re-upload), use
    // the newFiles version (fresher modifiedTime) and drop the retry entry.
    const newFileIds = new Set(newFiles.map((f) => f.id));
    const filteredRetry = retryFiles.filter((f) => {
      if (newFileIds.has(f.id)) {
        pendingRetry.delete(f.id); // Will be handled via newFiles
        return false;
      }
      return true;
    });

    const allFiles = [...newFiles, ...filteredRetry];
    logger.info(
      { new: newFiles.length, retry: filteredRetry.length },
      "Drive files this tick",
    );

    // ── 2. Process each file ───────────────────────────────────────────────
    for (const file of allFiles) {
      // Skip if already processed with same modifiedTime
      const alreadyDone = processed.get(file.id);
      if (alreadyDone && alreadyDone === file.modifiedTime) {
        pendingRetry.delete(file.id); // Clean up stale retry entry
        logger.debug({ fileId: file.id }, "Drive file already processed, skipping");
        continue;
      }

      let result: ProcessResult;
      try {
        result = await processFile(file);
      } catch (err) {
        logger.error({ err, fileId: file.id }, "Unexpected error processing Drive file");
        result = "transient_failure";
      }

      if (result === "ok" || result === "permanent_failure") {
        // Mark as done — will not be re-processed unless modifiedTime changes
        processed.set(file.id, file.modifiedTime);
        pendingRetry.delete(file.id);
        await saveTracker();
      } else {
        // Transient failure — queue for retry on next tick
        pendingRetry.set(file.id, file);
        logger.warn(
          { fileId: file.id, name: file.name },
          "Drive file queued for retry",
        );
      }
    }

    // Advance the time window only after a successful tick
    lastPollTime = tickStart;
  };

  // Recursive setTimeout: next tick only fires after current tick finishes.
  const scheduleNext = (): void => {
    setTimeout(() => {
      tick()
        .catch((err: unknown) =>
          logger.error({ err }, "Drive poll tick failed"),
        )
        .finally(scheduleNext);
    }, intervalMs);
  };

  // Run first tick immediately, then schedule recurring ticks.
  tick()
    .catch((err: unknown) =>
      logger.error({ err }, "Drive poll first tick failed"),
    )
    .finally(scheduleNext);
}
