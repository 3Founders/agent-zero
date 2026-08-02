/**
 * Setup wizard API routes.
 *
 * These endpoints power the in-app setup wizard in the dashboard.
 * They allow a coordinator to configure Google Sheets/Drive and WhatsApp
 * credentials without touching Replit Secrets or a terminal.
 *
 * Routes:
 *   GET  /admin/setup/status        — which integrations are configured (no auth)
 *   POST /admin/setup/test-google   — validate Google service-account JSON (no auth)
 *   POST /admin/setup/test-whatsapp — validate WhatsApp access token (no auth)
 *   PUT  /admin/setup/config        — save config + hot-reload subsystems (admin auth)
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { google } from "googleapis";
import {
  getConfigValue,
  saveConfig,
  getSetupStatus,
  type ConfigKey,
} from "../lib/configStore.js";
import { resetGoogleClients } from "../lib/sheetsClient.js";
import { resetDrivePoller, startDrivePoller } from "../lib/drivePoller.js";
import {
  restartReminderScheduler,
  startReminderScheduler,
} from "../lib/scheduler.js";
import { ensureHeaderRow } from "../lib/sheetsSync.js";
import {
  ensureDemographicsSheets,
  loadParticipantsFromSheet,
} from "../lib/demographicsSheet.js";
import { requireAdminAuth } from "../lib/adminAuth.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// ─── GET /admin/setup/status ─────────────────────────────────────────────────

router.get("/admin/setup/status", (_req: Request, res: Response): void => {
  res.json(getSetupStatus());
});

// ─── POST /admin/setup/test-google ───────────────────────────────────────────

/**
 * Test a service-account JSON key against the given spreadsheet.
 * Accepts { serviceAccountJson: string (base64), sheetId: string }.
 * Returns { ok, sheetTitle?, clientEmail?, error? }.
 */
router.post(
  "/admin/setup/test-google",
  async (req: Request, res: Response): Promise<void> => {
    const { serviceAccountJson, sheetId } = req.body as {
      serviceAccountJson?: string;
      sheetId?: string;
    };

    if (!serviceAccountJson || !sheetId) {
      res.status(400).json({ ok: false, error: "serviceAccountJson and sheetId are required" });
      return;
    }

    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(
        Buffer.from(serviceAccountJson, "base64").toString("utf8"),
      );
    } catch {
      res.json({ ok: false, error: "Invalid base64 or JSON — make sure you uploaded the correct file" });
      return;
    }

    const clientEmail = credentials["client_email"];
    if (typeof clientEmail !== "string") {
      res.json({ ok: false, error: "The JSON file does not look like a service-account key (missing client_email)" });
      return;
    }

    try {
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
      const sheets = google.sheets({ version: "v4", auth });
      const response = await sheets.spreadsheets.get({
        spreadsheetId: sheetId,
        fields: "properties.title",
      });
      const sheetTitle = response.data.properties?.title ?? sheetId;
      res.json({ ok: true, sheetTitle, clientEmail });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("404")) {
        res.json({
          ok: false,
          error: `Sheet not found. Make sure you shared it with: ${clientEmail}`,
        });
      } else if (msg.includes("403")) {
        res.json({
          ok: false,
          error: `Access denied. Share the sheet with ${clientEmail} (Editor role).`,
        });
      } else {
        res.json({ ok: false, error: `Google API error: ${msg}` });
      }
    }
  },
);

// ─── POST /admin/setup/test-whatsapp ─────────────────────────────────────────

/**
 * Test a WhatsApp access token by fetching phone number metadata.
 * Accepts { accessToken: string, phoneNumberId: string }.
 * Returns { ok, displayPhoneNumber?, error? }.
 */
router.post(
  "/admin/setup/test-whatsapp",
  async (req: Request, res: Response): Promise<void> => {
    const { accessToken, phoneNumberId } = req.body as {
      accessToken?: string;
      phoneNumberId?: string;
    };

    if (!accessToken || !phoneNumberId) {
      res.status(400).json({ ok: false, error: "accessToken and phoneNumberId are required" });
      return;
    }

    try {
      const url = `https://graph.facebook.com/v18.0/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = (await response.json()) as Record<string, unknown>;

      if (!response.ok) {
        const errMsg =
          (data["error"] as { message?: string } | undefined)?.message ??
          `HTTP ${response.status}`;
        if (response.status === 401 || response.status === 403) {
          res.json({ ok: false, error: "Access token is invalid or expired. Generate a new System User token." });
        } else if (response.status === 404) {
          res.json({ ok: false, error: "Phone Number ID not found. Check you copied it correctly from Meta." });
        } else {
          res.json({ ok: false, error: `Meta API error: ${errMsg}` });
        }
        return;
      }

      res.json({
        ok: true,
        displayPhoneNumber: String(data["display_phone_number"] ?? phoneNumberId),
        verifiedName: String(data["verified_name"] ?? ""),
      });
    } catch (err: unknown) {
      res.json({ ok: false, error: `Network error: ${err instanceof Error ? err.message : String(err)}` });
    }
  },
);

// ─── PUT /admin/setup/config ─────────────────────────────────────────────────

const ALLOWED_KEYS = new Set<ConfigKey>([
  "GOOGLE_SERVICE_ACCOUNT_JSON",
  "GOOGLE_SHEET_ID",
  "GOOGLE_DRIVE_FOLDER_ID",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_APP_SECRET",
  "ADMIN_PASSWORD",
]);

/**
 * Save a partial config update and hot-reload the affected subsystems.
 * Accepts any subset of the known config keys.
 * Protected by admin auth (open if no password is set — initial wizard flow).
 */
router.put(
  "/admin/setup/config",
  requireAdminAuth,
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as Record<string, unknown>;

    // Filter to only known keys with string values
    const updates: Partial<Record<ConfigKey, string>> = {};
    for (const [k, v] of Object.entries(body)) {
      if (ALLOWED_KEYS.has(k as ConfigKey) && typeof v === "string") {
        updates[k as ConfigKey] = v;
      }
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ ok: false, error: "No valid config keys provided" });
      return;
    }

    await saveConfig(updates);

    // ── Hot-reload affected subsystems ────────────────────────────────────
    const googleTouched = (["GOOGLE_SERVICE_ACCOUNT_JSON", "GOOGLE_SHEET_ID", "GOOGLE_DRIVE_FOLDER_ID"] as ConfigKey[]).some(
      (k) => k in updates,
    );
    const whatsappTouched = (["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"] as ConfigKey[]).some(
      (k) => k in updates,
    );

    if (googleTouched) {
      resetGoogleClients();

      const hasGoogleCreds =
        !!getConfigValue("GOOGLE_SERVICE_ACCOUNT_JSON") &&
        !!getConfigValue("GOOGLE_SHEET_ID");

      if (hasGoogleCreds) {
        Promise.all([ensureHeaderRow(), ensureDemographicsSheets()])
          .catch((err: unknown) => logger.warn({ err }, "Sheet init after config save failed"))
          .then(() =>
            loadParticipantsFromSheet().catch((err: unknown) =>
              logger.warn({ err }, "loadParticipantsFromSheet after config save failed"),
            ),
          );

        if (getConfigValue("GOOGLE_DRIVE_FOLDER_ID")) {
          resetDrivePoller();
          startDrivePoller().catch((err: unknown) =>
            logger.warn({ err }, "startDrivePoller after config save failed"),
          );
        }
      }
    }

    if (whatsappTouched) {
      const hasWhatsApp =
        !!getConfigValue("WHATSAPP_ACCESS_TOKEN") &&
        !!getConfigValue("WHATSAPP_PHONE_NUMBER_ID");

      if (hasWhatsApp) {
        restartReminderScheduler();
      }
    }

    res.json({ ok: true, setupStatus: getSetupStatus() });
  },
);

export default router;
