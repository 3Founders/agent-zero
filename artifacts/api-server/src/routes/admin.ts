/**
 * Admin API routes for the trial coordinator dashboard.
 *
 * GET /admin/status — full system status snapshot
 *
 * Protected by HTTP Basic auth. ADMIN_PASSWORD is read from the config store
 * (env var or data/config.json). If not set, the endpoint is open (dev/setup).
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { peekResults } from "../lib/extractionStore.js";
import { getDrivePollerStatus } from "../lib/drivePoller.js";
import { getSchedulerStatus } from "../lib/scheduler.js";
import { requireAdminAuth } from "../lib/adminAuth.js";

const router: IRouter = Router();

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
