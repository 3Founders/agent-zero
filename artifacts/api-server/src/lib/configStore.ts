/**
 * Runtime configuration store.
 *
 * Merges two sources — highest priority first:
 *   1. Environment variables (process.env)
 *   2. data/config.json written by the in-app setup wizard
 *
 * This lets the setup wizard configure the app without requiring the
 * coordinator to touch Replit Secrets. Any value set in Replit Secrets
 * always takes precedence (env wins).
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { logger } from "./logger.js";

// ─── Config key registry ──────────────────────────────────────────────────────

export type ConfigKey =
  | "GOOGLE_SERVICE_ACCOUNT_JSON"
  | "GOOGLE_SHEET_ID"
  | "GOOGLE_DRIVE_FOLDER_ID"
  | "WHATSAPP_ACCESS_TOKEN"
  | "WHATSAPP_PHONE_NUMBER_ID"
  | "WHATSAPP_VERIFY_TOKEN"
  | "WHATSAPP_APP_SECRET"
  | "ADMIN_PASSWORD"
  | "DRIVE_POLL_INTERVAL_MS";

const CONFIG_PATH = join(process.cwd(), "data", "config.json");

let _fileConfig: Partial<Record<ConfigKey, string>> = {};

// ─── Load / save ──────────────────────────────────────────────────────────────

export async function loadConfig(): Promise<void> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    _fileConfig = JSON.parse(raw);
    const setKeys = (Object.keys(_fileConfig) as ConfigKey[]).filter(
      (k) => !!_fileConfig[k],
    );
    logger.info({ keys: setKeys }, "Config loaded from data/config.json");
  } catch {
    logger.info("No data/config.json found — using env vars only");
  }
}

export async function saveConfig(
  updates: Partial<Record<ConfigKey, string>>,
): Promise<void> {
  const next: Partial<Record<ConfigKey, string>> = { ..._fileConfig };
  for (const [k, v] of Object.entries(updates)) {
    const key = k as ConfigKey;
    if (v) {
      next[key] = v;
    } else {
      delete next[key];
    }
  }
  _fileConfig = next;
  await mkdir(join(process.cwd(), "data"), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(_fileConfig, null, 2), "utf8");
  logger.info({ keys: Object.keys(updates) }, "Config saved to data/config.json");
}

// ─── Value accessor ───────────────────────────────────────────────────────────

/** env var wins over config file. */
export function getConfigValue(key: ConfigKey): string | undefined {
  return process.env[key] ?? _fileConfig[key] ?? undefined;
}

// ─── Setup status ─────────────────────────────────────────────────────────────

export interface SetupStatus {
  googleCredentials: boolean;
  googleSheet: boolean;
  googleDriveFolder: boolean;
  whatsapp: boolean;
  adminPassword: boolean;
  /** True when the minimum required setup is done (Google creds + sheet). WhatsApp is optional. */
  allRequired: boolean;
}

export function getSetupStatus(): SetupStatus {
  const googleCredentials = !!getConfigValue("GOOGLE_SERVICE_ACCOUNT_JSON");
  const googleSheet = !!getConfigValue("GOOGLE_SHEET_ID");
  const googleDriveFolder = !!getConfigValue("GOOGLE_DRIVE_FOLDER_ID");
  const whatsapp = !!(
    getConfigValue("WHATSAPP_ACCESS_TOKEN") &&
    getConfigValue("WHATSAPP_PHONE_NUMBER_ID") &&
    getConfigValue("WHATSAPP_VERIFY_TOKEN") &&
    getConfigValue("WHATSAPP_APP_SECRET")
  );
  const adminPassword = !!getConfigValue("ADMIN_PASSWORD");
  return {
    googleCredentials,
    googleSheet,
    googleDriveFolder,
    whatsapp,
    adminPassword,
    allRequired: googleCredentials && googleSheet,
  };
}
