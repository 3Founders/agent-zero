import app from "./app.js";
import { logger } from "./lib/logger.js";
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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  const hasGoogleCreds =
    !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON &&
    !!process.env.GOOGLE_SHEET_ID;

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
      "GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SHEET_ID not set — skipping Sheet init and Drive poller",
    );
  }

  // Start dose-reminder scheduler (fires even without Google creds — sends WhatsApp messages)
  if (process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
    startReminderScheduler();
  } else {
    logger.info(
      "WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID not set — skipping reminder scheduler",
    );
  }
});
