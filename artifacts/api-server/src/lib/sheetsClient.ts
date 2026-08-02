/**
 * Authenticated Google API client factory using a service-account credential.
 *
 * Credential sources (highest priority first):
 *   1. GOOGLE_SERVICE_ACCOUNT_JSON env var (Replit Secrets)
 *   2. data/config.json written by the in-app setup wizard
 *
 * Scopes:
 *   - spreadsheets (read + write) — for Sheets upsert
 *   - drive.readonly              — for Drive folder polling
 */

import { google } from "googleapis";
import { logger } from "./logger.js";
import { getConfigValue } from "./configStore.js";

// ─── Credential helpers ───────────────────────────────────────────────────────

export function getServiceAccountJson(): object {
  const raw = getConfigValue("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!raw) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON is not set. " +
        "Use the setup wizard or provide the base64-encoded service-account JSON key.",
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
  const id = getConfigValue("GOOGLE_SHEET_ID");
  if (!id) throw new Error("GOOGLE_SHEET_ID is not set");
  return id;
}

// ─── Shared auth (both scopes so one credential covers Sheets + Drive) ────────

let _auth: InstanceType<typeof google.auth.GoogleAuth> | null = null;

function getAuth(): InstanceType<typeof google.auth.GoogleAuth> {
  if (_auth) return _auth;
  const credentials = getServiceAccountJson();
  _auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  });
  return _auth;
}

// ─── Sheets client ────────────────────────────────────────────────────────────

let _sheets: ReturnType<typeof google.sheets> | null = null;

export function getSheetsClient(): ReturnType<typeof google.sheets> {
  if (_sheets) return _sheets;
  _sheets = google.sheets({ version: "v4", auth: getAuth() });
  logger.info("Google Sheets client initialised");
  return _sheets;
}

// ─── Drive client ─────────────────────────────────────────────────────────────

let _drive: ReturnType<typeof google.drive> | null = null;

export function getDriveClient(): ReturnType<typeof google.drive> {
  if (_drive) return _drive;
  _drive = google.drive({ version: "v3", auth: getAuth() });
  logger.info("Google Drive client initialised");
  return _drive;
}

// ─── Hot-reload ───────────────────────────────────────────────────────────────

/**
 * Clear all cached Google API clients so they are recreated on next access
 * with whatever credentials are now in the config store. Called by the
 * setup wizard after saving new Google credentials.
 */
export function resetGoogleClients(): void {
  _auth = null;
  _sheets = null;
  _drive = null;
  logger.info("Google API clients reset — will reinitialise on next use");
}
