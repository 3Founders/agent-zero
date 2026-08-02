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

import { Router, type IRouter, type Request, type Response } from "express";
import { peekResults } from "../lib/extractionStore.js";
import { getPollerState, getDrivePollerStatus } from "../lib/drivePoller.js";
import { getSchedulerStatus } from "../lib/scheduler.js";
import { requireAdminAuth } from "../lib/adminAuth.js";

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

export default router;
