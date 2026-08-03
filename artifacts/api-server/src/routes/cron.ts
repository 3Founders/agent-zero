/**
 * Cron-driven tick endpoint.
 *
 * Vercel (and other serverless platforms) can't run long-lived
 * setInterval/setTimeout loops between requests, so the Drive poller and
 * dose-reminder scheduler are instead triggered on a schedule via
 * Vercel Cron (see vercel.json) hitting this endpoint.
 *
 * Protected by a shared secret so it can't be triggered by randoms:
 *   - Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically
 *     when CRON_SECRET is set as an env var (Vercel convention).
 *   - Falls back to checking `x-cron-secret` header for other schedulers
 *     (e.g. cron-job.org, GitHub Actions schedule).
 */

import { Router, type IRouter } from "express";
import { logger } from "../lib/logger.js";
import { getConfigValue } from "../lib/configStore.js";
import { resetDrivePoller, startDrivePoller } from "../lib/drivePoller.js";
import { tick as reminderTick } from "../lib/scheduler.js";

const router: IRouter = Router();

function isAuthorized(req: import("express").Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured — allow (dev convenience)

  const auth = req.header("authorization");
  if (auth === `Bearer ${secret}`) return true;

  const headerSecret = req.header("x-cron-secret");
  return headerSecret === secret;
}

router.get("/cron/tick", async (req, res) => {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const results: Record<string, string> = {};

  try {
    if (getConfigValue("GOOGLE_SERVICE_ACCOUNT_JSON") && getConfigValue("GOOGLE_DRIVE_FOLDER_ID")) {
      resetDrivePoller();
      await startDrivePoller();
      results.drivePoller = "ran";
    } else {
      results.drivePoller = "skipped (not configured)";
    }
  } catch (err) {
    logger.error({ err }, "Cron: drive poller tick failed");
    results.drivePoller = "error";
  }

  try {
    if (getConfigValue("WHATSAPP_ACCESS_TOKEN") && getConfigValue("WHATSAPP_PHONE_NUMBER_ID")) {
      reminderTick();
      results.reminderScheduler = "ran";
    } else {
      results.reminderScheduler = "skipped (not configured)";
    }
  } catch (err) {
    logger.error({ err }, "Cron: reminder tick failed");
    results.reminderScheduler = "error";
  }

  res.json({ ok: true, results, timestamp: new Date().toISOString() });
});

export default router;
