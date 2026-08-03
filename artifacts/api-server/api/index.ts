/**
 * Vercel serverless entrypoint.
 *
 * Unlike `src/index.ts` (used for local/Replit long-running dev via
 * `app.listen`), Vercel wraps this module's default export (the Express
 * app) as a request handler and manages the HTTP server itself. No
 * `app.listen` call here — Vercel will error if you try.
 *
 * One-time init (config load + Sheet header bootstrap) is fired once per
 * cold start below. Background polling/scheduling that used to run via
 * setInterval/setTimeout now happens on a schedule via Vercel Cron hitting
 * `/api/cron/tick` (see ../src/routes/cron.ts and vercel.json).
 */

import app from "../src/app.js";
import { logger } from "../src/lib/logger.js";
import { loadConfig, getConfigValue } from "../src/lib/configStore.js";
import { ensureHeaderRow } from "../src/lib/sheetsSync.js";
import {
  ensureDemographicsSheets,
  loadParticipantsFromSheet,
} from "../src/lib/demographicsSheet.js";

let initialized = false;

async function initOnce(): Promise<void> {
  if (initialized) return;
  initialized = true;

  await loadConfig();

  const hasGoogleCreds =
    !!getConfigValue("GOOGLE_SERVICE_ACCOUNT_JSON") &&
    !!getConfigValue("GOOGLE_SHEET_ID");

  if (hasGoogleCreds) {
    Promise.all([ensureHeaderRow(), ensureDemographicsSheets()]).catch(
      (err: unknown) => {
        logger.warn({ err }, "Could not initialise Sheet header rows");
      },
    );
    loadParticipantsFromSheet().catch((err: unknown) => {
      logger.warn({ err }, "Could not load participant list from sheet");
    });
  } else {
    logger.info(
      "Google credentials not configured — set GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_SHEET_ID env vars in Vercel.",
    );
  }
}

// Fire-and-forget init on cold start; don't block the first request on it.
initOnce().catch((err: unknown) => {
  logger.error({ err }, "Cold-start init failed");
});

export default app;
