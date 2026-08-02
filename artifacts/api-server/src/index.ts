import app from "./app.js";
import { logger } from "./lib/logger.js";
import { ensureHeaderRow } from "./lib/sheetsSync.js";

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

  // Initialise Google Sheet header row in the background.
  // Skips gracefully if credentials are not yet configured.
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_SHEET_ID) {
    ensureHeaderRow().catch((initErr: unknown) => {
      logger.warn({ err: initErr }, "Could not initialise Sheet header row");
    });
  } else {
    logger.info(
      "GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SHEET_ID not set — skipping Sheet init",
    );
  }
});
