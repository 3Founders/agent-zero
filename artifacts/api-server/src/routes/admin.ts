/**
 * Admin API routes for the trial coordinator dashboard.
 *
 * GET /admin/status — full system status snapshot
 *
 * Protected by HTTP Basic auth. Set ADMIN_PASSWORD to a shared password.
 * If ADMIN_PASSWORD is not set, the endpoint is open (dev convenience).
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { peekResults } from "../lib/extractionStore.js";
import { getDrivePollerStatus } from "../lib/drivePoller.js";
import { getSchedulerStatus } from "../lib/scheduler.js";

const router: IRouter = Router();

// ─── Basic-auth middleware ────────────────────────────────────────────────────

function requireAdminAuth(req: Request, res: Response, next: () => void): void {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    // No password set — open in dev
    next();
    return;
  }

  const auth = req.headers.authorization ?? "";
  if (!auth.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Trial Dashboard"');
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const credentials = Buffer.from(auth.slice(6), "base64").toString("utf8");
  const colonIdx = credentials.indexOf(":");
  const suppliedPassword = colonIdx >= 0 ? credentials.slice(colonIdx + 1) : credentials;

  if (suppliedPassword !== password) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Trial Dashboard"');
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}

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
