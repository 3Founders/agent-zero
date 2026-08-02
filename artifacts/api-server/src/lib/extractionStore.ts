/**
 * In-memory extraction result store.
 * Task 2 (Google Sheets sync) imports saveExtractionResult / getPendingResults
 * to consume completed extractions and upsert them into the sheet.
 */

export interface LabResultRow {
  field: string;
  value: string | null;
  unit: string | null;
  referenceRange: string | null;
}

export interface ExtractionSuccess {
  status: "success";
  participantId: string;
  messageId: string;
  timestamp: string;
  rows: LabResultRow[];
  source: "whatsapp" | "drive" | "manual";
}

export interface ExtractionError {
  status: "error";
  participantId: string;
  messageId: string;
  timestamp: string;
  reason: string;
  source: "whatsapp" | "drive" | "manual";
}

export type ExtractionResult = ExtractionSuccess | ExtractionError;

const store = new Map<string, ExtractionResult>();

/**
 * Persist a completed extraction result keyed by messageId.
 * Called by the webhook handler after LLM extraction finishes (success or failure).
 */
export function saveExtractionResult(result: ExtractionResult): void {
  store.set(result.messageId, result);
}

/**
 * Return all stored results and clear the store.
 * Task 2 calls this to drain pending results into Google Sheets.
 */
export function getPendingResults(): ExtractionResult[] {
  const results = Array.from(store.values());
  store.clear();
  return results;
}

/**
 * Return all stored results without clearing (for diagnostics).
 */
export function peekResults(): ExtractionResult[] {
  return Array.from(store.values());
}
