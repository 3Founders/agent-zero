/**
 * Admin API routes for the trial coordinator dashboard.
 *
 * GET /admin/extractions  — extraction results + Drive poller state (task-5 frontend)
 * GET /admin/status       — full system status snapshot (scheduler + poller + extractions)
 *
 * Both routes are protected by requireAdminAuth (reads ADMIN_PASSWORD from the
 * config store so the setup wizard can set it without a server restart).
 * When ADMIN_PASSWORD is not yet configured the middleware is open — this is
 * intentional for the initial setup wizard flow.
 */

import { randomUUID } from "crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { peekResults, saveExtractionResult, type LabResultRow } from "../lib/extractionStore.js";
import {
  getPollerState,
  getDrivePollerStatus,
  DRIVE_POLL_INTERVAL_OPTIONS,
  restartDrivePoller,
} from "../lib/drivePoller.js";
import { getSchedulerStatus } from "../lib/scheduler.js";
import { requireAdminAuth } from "../lib/adminAuth.js";
import { extractTextFromPdf } from "../lib/extractPdf.js";
import { extractLabResultsFromText } from "../lib/extractLabResults.js";
import { upsertLabResults } from "../lib/sheetsSync.js";
import { saveConfig } from "../lib/configStore.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// ─── GET /admin/extractions ───────────────────────────────────────────────────

router.get("/admin/extractions", requireAdminAuth, (_req: Request, res: Response): void => {
  res.json({
    extractions: peekResults(),
    poller: getPollerState(),
    retrievedAt: new Date().toISOString(),
  });
});

// ─── GET /admin/status ────────────────────────────────────────────────────────

router.get("/admin/status", requireAdminAuth, (_req: Request, res: Response): void => {
  const rawExtractions = peekResults();

  const extractions = rawExtractions.map((r) => ({
    messageId: r.messageId,
    participantId: r.participantId,
    timestamp: r.timestamp,
    source: r.source,
    status: r.status,
    rowCount: r.status === "success" ? r.rows.length : null,
    reason: r.status === "error" ? r.reason : null,
  }));

  // Most recent first
  extractions.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  res.json({
    extractions,
    drivePoller: getDrivePollerStatus(),
    scheduler: getSchedulerStatus(),
    serverTime: new Date().toISOString(),
  });
});

// ─── POST /admin/test-upload ──────────────────────────────────────────────────

const MAX_TEST_PDF_BYTES = 10 * 1024 * 1024;

router.post("/admin/test-upload", requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  const { participantId, filename, pdfBase64 } = req.body as {
    participantId?: unknown;
    filename?: unknown;
    pdfBase64?: unknown;
  };

  if (typeof participantId !== "string" || participantId.trim().length === 0) {
    res.status(400).json({ error: "Enter a participant phone number or participant ID." });
    return;
  }
  if (typeof filename !== "string" || !filename.toLowerCase().endsWith(".pdf")) {
    res.status(400).json({ error: "Upload a PDF file." });
    return;
  }
  if (typeof pdfBase64 !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(pdfBase64)) {
    res.status(400).json({ error: "The PDF upload could not be read. Please choose the file again." });
    return;
  }

  const pdfBuffer = Buffer.from(pdfBase64, "base64");
  if (pdfBuffer.length === 0 || pdfBuffer.length > MAX_TEST_PDF_BYTES || !pdfBuffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    res.status(400).json({ error: "Use a valid PDF file smaller than 10 MB." });
    return;
  }

  const safeParticipantId = participantId.trim();
  const messageId = `manual_${randomUUID()}`;
  const timestamp = new Date().toISOString();

  try {
    const text = await extractTextFromPdf(pdfBuffer);
    const extraction = await extractLabResultsFromText(text);
    if ("kind" in extraction) {
      saveExtractionResult({
        status: "error",
        participantId: safeParticipantId,
        messageId,
        timestamp,
        reason: extraction.reason,
        source: "manual",
      });
      res.status(422).json({ error: extraction.reason, messageId });
      return;
    }

    const rows: LabResultRow[] = extraction;
    if (rows.length > 0) {
      await upsertLabResults(safeParticipantId, rows, messageId, "manual");
    }

    saveExtractionResult({
      status: "success",
      participantId: safeParticipantId,
      messageId,
      timestamp,
      rows,
      source: "manual",
    });

    res.status(200).json({
      messageId,
      participantId: safeParticipantId,
      rowCount: rows.length,
      rows,
      sheetsSynced: true,
    });
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : "Unexpected processing error";
    logger.error({ err, messageId }, "Manual PDF test upload failed");
    saveExtractionResult({
      status: "error",
      participantId: safeParticipantId,
      messageId,
      timestamp,
      reason,
      source: "manual",
    });
    res.status(500).json({ error: "The PDF could not be processed or saved to Google Sheets.", messageId });
  }
});

// ─── PUT /admin/drive-poller/interval ─────────────────────────────────────────

router.put("/admin/drive-poller/interval", requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  const intervalMs = Number((req.body as { intervalMs?: unknown }).intervalMs);
  if (!DRIVE_POLL_INTERVAL_OPTIONS.includes(intervalMs as (typeof DRIVE_POLL_INTERVAL_OPTIONS)[number])) {
    res.status(400).json({
      error: "Choose one of the supported scan intervals: 15 minutes, hourly, or daily.",
    });
    return;
  }

  await saveConfig({ DRIVE_POLL_INTERVAL_MS: String(intervalMs) });
  await restartDrivePoller(intervalMs);
  res.json({ drivePoller: getDrivePollerStatus() });
});

export default router;
