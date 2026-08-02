import app from "./app.js";
import { logger } from "./lib/logger.js";
import { loadConfig, getConfigValue } from "./lib/configStore.js";
import { ensureHeaderRow } from "./lib/sheetsSync.js";
import { ensureDemographicsSheets, loadParticipantsFromSheet } from "./lib/demographicsSheet.js";
import { startDrivePoller } from "./lib/drivePoller.js";
import { startReminderScheduler } from "./lib/scheduler.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Load persisted config from data/config.json before starting the server.
// This allows the in-app setup wizard to configure the app without Replit Secrets.
await loadConfig();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  const hasGoogleCreds =
    !!getConfigValue("GOOGLE_SERVICE_ACCOUNT_JSON") &&
    !!getConfigValue("GOOGLE_SHEET_ID");

  if (hasGoogleCreds) {
    // Initialise Google Sheet header rows (lab results + demographics + dose log)
    Promise.all([
      ensureHeaderRow(),
      ensureDemographicsSheets(),
    ]).catch((initErr: unknown) => {
      logger.warn({ err: initErr }, "Could not initialise Sheet header rows");
    });

    // Load existing participant list so the scheduler can reach them after a restart
    loadParticipantsFromSheet().catch((initErr: unknown) => {
      logger.warn({ err: initErr }, "Could not load participant list from sheet");
    });

    // Start Drive folder poller (skips gracefully if GOOGLE_DRIVE_FOLDER_ID not set)
    startDrivePoller().catch((initErr: unknown) => {
      logger.warn({ err: initErr }, "Could not start Drive poller");
    });
  } else {
    logger.info(
      "Google credentials not configured — skipping Sheet init and Drive poller. Use the setup wizard to configure.",
    );
  }

  // Start dose-reminder scheduler (fires even without Google creds — sends WhatsApp messages)
  if (getConfigValue("WHATSAPP_ACCESS_TOKEN") && getConfigValue("WHATSAPP_PHONE_NUMBER_ID")) {
    startReminderScheduler();
  } else {
    logger.info(
      "WhatsApp credentials not configured — skipping reminder scheduler. Use the setup wizard to configure.",
    );
  }
});
