/**
 * Google Sheets upsert logic for lab-result rows.
 *
 * Schema (columns A–H):
 *   participant_id | field | value | unit | reference_range | last_updated | message_id | source
 *
 * Upsert key: (participant_id, field)
 * Re-sending the same report updates existing rows rather than duplicating them.
 */

import { logger } from "./logger.js";
import { getSheetsClient, getSheetId } from "./sheetsClient.js";
import type { LabResultRow } from "./extractionStore.js";

// ─── Constants ───────────────────────────────────────────────────────────────

export const SHEET_COLUMNS = [
  "participant_id",   // A
  "field",            // B
  "value",            // C
  "unit",             // D
  "reference_range",  // E
  "last_updated",     // F
  "message_id",       // G
  "source",           // H
] as const;

const HEADER_ROW = [...SHEET_COLUMNS];
const DATA_RANGE = "A:H";

// ─── Types ────────────────────────────────────────────────────────────────────

type SheetRow = [string, string, string, string, string, string, string, string];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Ensure the header row exists. Safe to call on every run — no-ops if already present.
 */
export async function ensureHeaderRow(): Promise<void> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSheetId();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "A1:H1",
  });

  const existing = res.data.values?.[0];
  if (existing && existing[0] === "participant_id") return; // already initialised

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "A1:H1",
    valueInputOption: "RAW",
    requestBody: { values: [HEADER_ROW] },
  });

  logger.info("Google Sheet header row written");
}

/**
 * Upsert lab-result rows into the sheet.
 *
 * Algorithm:
 *  1. Read all existing data (A:H).
 *  2. Build an index: (participant_id, field) → row number (1-based, sheet row).
 *  3. For each incoming row: if key exists → batch-update that row; else → collect for append.
 *  4. Fire one batchUpdate for all updates, then one append for new rows.
 */
export async function upsertLabResults(
  participantId: string,
  rows: LabResultRow[],
  messageId: string,
  source: "whatsapp" | "drive",
): Promise<void> {
  if (rows.length === 0) return;

  const sheets = getSheetsClient();
  const spreadsheetId = getSheetId();
  const now = new Date().toISOString();

  // 1. Read all existing rows
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: DATA_RANGE,
  });

  const allRows: string[][] = existing.data.values ?? [];

  // 2. Build index: composite key → sheet row index (0-based in allRows)
  const index = new Map<string, number>();
  for (let i = 1; i < allRows.length; i++) {
    // Skip header row (index 0)
    const [pid, field] = allRows[i];
    if (pid && field) {
      index.set(compositeKey(pid, field), i);
    }
  }

  // 3. Separate incoming rows into updates and appends
  const updateRequests: Array<{
    range: string;
    values: string[][];
  }> = [];
  const appendRows: string[][] = [];

  for (const row of rows) {
    const key = compositeKey(participantId, row.field);
    const sheetRow = buildSheetRow(participantId, row, messageId, source, now);

    const existingIndex = index.get(key);
    if (existingIndex !== undefined) {
      // Row exists — update it (sheet row number = existingIndex + 1, 1-based)
      const sheetRowNum = existingIndex + 1;
      updateRequests.push({
        range: `A${sheetRowNum}:H${sheetRowNum}`,
        values: [sheetRow],
      });
    } else {
      appendRows.push(sheetRow);
    }
  }

  // 4a. Batch update existing rows
  if (updateRequests.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: updateRequests,
      },
    });
    logger.info(
      { count: updateRequests.length, participantId },
      "Sheets rows updated",
    );
  }

  // 4b. Append new rows
  if (appendRows.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: DATA_RANGE,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: appendRows },
    });
    logger.info(
      { count: appendRows.length, participantId },
      "Sheets rows appended",
    );
  }

  logger.info(
    {
      participantId,
      updated: updateRequests.length,
      appended: appendRows.length,
      messageId,
    },
    "Sheets upsert complete",
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function compositeKey(participantId: string, field: string): string {
  return `${participantId}|||${field.toLowerCase().trim()}`;
}

function buildSheetRow(
  participantId: string,
  row: LabResultRow,
  messageId: string,
  source: string,
  timestamp: string,
): SheetRow {
  return [
    participantId,
    row.field,
    row.value ?? "",
    row.unit ?? "",
    row.referenceRange ?? "",
    timestamp,
    messageId,
    source,
  ];
}
