/**
 * Authenticated Google Sheets client using a service-account credential.
 *
 * Required env vars:
 *   GOOGLE_SERVICE_ACCOUNT_JSON  — base64-encoded service-account JSON key file
 *   GOOGLE_SHEET_ID              — target spreadsheet ID
 *
 * Scope: spreadsheets (read + write). No per-user OAuth needed.
 */

import { google } from "googleapis";
import { logger } from "./logger.js";

function getServiceAccountJson(): object {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON is not set. " +
        "Provide the base64-encoded service-account JSON key.",
    );
  }
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON is not valid base64-encoded JSON.",
    );
  }
}

export function getSheetId(): string {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("GOOGLE_SHEET_ID is not set");
  return id;
}

/** Lazily initialised authenticated sheets client. */
let _sheets: ReturnType<typeof google.sheets> | null = null;

export function getSheetsClient(): ReturnType<typeof google.sheets> {
  if (_sheets) return _sheets;

  const credentials = getServiceAccountJson();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  _sheets = google.sheets({ version: "v4", auth });
  logger.info("Google Sheets client initialised");
  return _sheets;
}
