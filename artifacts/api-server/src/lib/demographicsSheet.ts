/**
 * Google Sheets integration for participant demographics.
 *
 * Writes to a "Demographics" tab in the same spreadsheet used for lab results.
 *
 * Schema (columns A–K):
 *   participant_id | dob | height_cm | weight_kg | waist_cm |
 *   bp_systolic | bp_diastolic | medications | surgical_history | collected_at
 *
 * Upsert key: participant_id
 *
 * Also writes dose-reminder responses to a "DoseLog" tab:
 *   participant_id | date | time_of_day | response | logged_at
 */

import { logger } from "./logger.js";
import { getSheetsClient, getSheetId } from "./sheetsClient.js";
import type { DemographicsAnswers } from "./conversationState.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEMO_SHEET = "Demographics";
const DEMO_COLUMNS = [
  "participant_id",
  "dob",
  "height_cm",
  "weight_kg",
  "waist_cm",
  "bp_systolic",
  "bp_diastolic",
  "medications",
  "surgical_history",
  "collected_at",
] as const;

const DOSE_SHEET = "DoseLog";
const DOSE_COLUMNS = [
  "participant_id",
  "date",
  "time_of_day",
  "response",
  "logged_at",
] as const;

// ─── In-process participant registry (populated from sheet at startup) ─────────

const activeParticipants = new Set<string>();

export function registerParticipant(participantId: string): void {
  activeParticipants.add(participantId);
}

export function getActiveParticipants(): string[] {
  return Array.from(activeParticipants);
}

// ─── Sheet bootstrap ──────────────────────────────────────────────────────────

/**
 * Ensure both the Demographics and DoseLog tabs exist with their header rows.
 * Safe to call on every startup — no-ops when already present.
 */
export async function ensureDemographicsSheets(): Promise<void> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSheetId();

  // Fetch existing sheet names
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existingNames = new Set(
    (meta.data.sheets ?? []).map((s) => s.properties?.title ?? ""),
  );

  const requests: object[] = [];
  if (!existingNames.has(DEMO_SHEET)) {
    requests.push({ addSheet: { properties: { title: DEMO_SHEET } } });
  }
  if (!existingNames.has(DOSE_SHEET)) {
    requests.push({ addSheet: { properties: { title: DOSE_SHEET } } });
  }

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });
    logger.info({ sheets: [DEMO_SHEET, DOSE_SHEET] }, "Created new sheet tabs");
  }

  // Ensure header rows
  await ensureHeader(
    spreadsheetId,
    DEMO_SHEET,
    [...DEMO_COLUMNS],
    `${DEMO_SHEET}!A1`,
  );
  await ensureHeader(
    spreadsheetId,
    DOSE_SHEET,
    [...DOSE_COLUMNS],
    `${DOSE_SHEET}!A1`,
  );
}

async function ensureHeader(
  spreadsheetId: string,
  sheetName: string,
  columns: string[],
  range: string,
): Promise<void> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  const existing = res.data.values?.[0];
  if (existing && existing[0] === columns[0]) return; // already initialised

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "RAW",
    requestBody: { values: [columns] },
  });
  logger.info({ sheetName }, "Header row written");
}

// ─── Demographics upsert ──────────────────────────────────────────────────────

/**
 * Parse a blood-pressure string ("120/80") into systolic / diastolic strings.
 * Returns ["", ""] if unparseable.
 */
function parseBp(bp: string): [string, string] {
  const m = bp.match(/(\d+)\s*\/\s*(\d+)/);
  return m ? [m[1], m[2]] : [bp, ""];
}

/**
 * Write (or overwrite) a participant's demographics row.
 * Called once when the questionnaire is completed.
 */
export async function saveDemographics(
  participantId: string,
  answers: DemographicsAnswers,
): Promise<void> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSheetId();
  const now = new Date().toISOString();
  const [bpSys, bpDia] = parseBp(answers.bp);

  const newRow: string[] = [
    participantId,
    answers.dob,
    answers.height,
    answers.weight,
    answers.waist,
    bpSys,
    bpDia,
    answers.medications,
    answers.surgical_history,
    now,
  ];

  // Read existing rows to find if participant already has an entry
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${DEMO_SHEET}!A:A`,
  });

  const idColumn: string[][] = existing.data.values ?? [];
  let existingRowNum: number | null = null;
  for (let i = 1; i < idColumn.length; i++) {
    if (idColumn[i]?.[0] === participantId) {
      existingRowNum = i + 1; // 1-based sheet row
      break;
    }
  }

  if (existingRowNum !== null) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${DEMO_SHEET}!A${existingRowNum}:J${existingRowNum}`,
      valueInputOption: "RAW",
      requestBody: { values: [newRow] },
    });
    logger.info({ participantId }, "Demographics row updated");
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${DEMO_SHEET}!A:J`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [newRow] },
    });
    logger.info({ participantId }, "Demographics row appended");
  }

  // Add to in-process registry
  registerParticipant(participantId);
}

// ─── Participant list (for scheduler) ────────────────────────────────────────

/**
 * Load all participant IDs from the Demographics sheet into the in-process
 * registry. Called at startup so the scheduler can reach pre-existing
 * participants even after a restart.
 */
export async function loadParticipantsFromSheet(): Promise<void> {
  try {
    const sheets = getSheetsClient();
    const spreadsheetId = getSheetId();

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${DEMO_SHEET}!A:A`,
    });

    const rows = res.data.values ?? [];
    let loaded = 0;
    for (let i = 1; i < rows.length; i++) {
      const id = rows[i]?.[0];
      if (id && typeof id === "string") {
        activeParticipants.add(id);
        loaded++;
      }
    }
    logger.info({ loaded }, "Participant list loaded from Demographics sheet");
  } catch (err) {
    logger.warn({ err }, "Could not load participants from sheet — will rely on in-session registrations");
  }
}

// ─── Dose response logging ────────────────────────────────────────────────────

export type DoseTimeOfDay = "morning" | "evening";
export type DoseResponse = "yes" | "no" | "skip";

/**
 * Append a dose-response row to the DoseLog tab.
 */
export async function logDoseResponse(
  participantId: string,
  timeOfDay: DoseTimeOfDay,
  response: DoseResponse,
): Promise<void> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSheetId();
  const now = new Date().toISOString();
  const date = now.slice(0, 10); // YYYY-MM-DD

  const row: string[] = [participantId, date, timeOfDay, response, now];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${DOSE_SHEET}!A:E`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });

  logger.info({ participantId, timeOfDay, response }, "Dose response logged");
}
