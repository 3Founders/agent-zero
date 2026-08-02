/**
 * Compose WhatsApp reply messages for lab-result extraction outcomes.
 *
 * Detects clinical panels from field names so the summary is human-readable
 * (e.g. "Lipid Panel, HbA1c, CBC") rather than a raw list of field names.
 */

import type { LabResultRow } from "./extractionStore.js";

// ─── Panel detection ─────────────────────────────────────────────────────────

interface PanelRule {
  name: string;
  patterns: RegExp[];
}

const PANEL_RULES: PanelRule[] = [
  {
    name: "Lipid Panel",
    patterns: [
      /cholesterol/i,
      /\bldl\b/i,
      /\bhdl\b/i,
      /triglyceride/i,
      /vldl/i,
      /non.?hdl/i,
    ],
  },
  {
    name: "HbA1c / Diabetes",
    patterns: [/hba1c/i, /glycated/i, /glycohaemoglobin/i, /fasting.*glucose/i, /blood.*sugar/i],
  },
  {
    name: "CBC / Haematology",
    patterns: [
      /haemoglobin/i,
      /hemoglobin/i,
      /\bwbc\b/i,
      /\brbc\b/i,
      /\bplatelets?\b/i,
      /hematocrit/i,
      /haematocrit/i,
      /\bmcv\b/i,
      /\bmchc?\b/i,
      /neutrophil/i,
      /lymphocyte/i,
      /eosinophil/i,
      /basophil/i,
      /monocyte/i,
    ],
  },
  {
    name: "Liver Function",
    patterns: [
      /\balt\b/i,
      /\bast\b/i,
      /\bggt\b/i,
      /bilirubin/i,
      /albumin/i,
      /\balp\b/i,
      /alkaline.*phosphatase/i,
      /sgpt/i,
      /sgot/i,
    ],
  },
  {
    name: "Kidney Function",
    patterns: [
      /creatinine/i,
      /\burea\b/i,
      /\bbun\b/i,
      /uric.*acid/i,
      /\begfr\b/i,
    ],
  },
  {
    name: "Thyroid",
    patterns: [/\btsh\b/i, /\bt3\b/i, /\bt4\b/i, /thyroxine/i, /thyroid/i],
  },
  {
    name: "Vitamins & Minerals",
    patterns: [
      /vitamin\s*[bd]/i,
      /\bb12\b/i,
      /ferritin/i,
      /\biron\b/i,
      /calcium/i,
      /magnesium/i,
      /\bfolate\b/i,
      /folic.*acid/i,
      /phosphorus/i,
    ],
  },
  {
    name: "Inflammation",
    patterns: [/\bcrp\b/i, /c.reactive/i, /esr\b/i, /il.6/i],
  },
];

/**
 * Return the set of clinical panel names detected across the given rows.
 * Preserves insertion order (first detected panel comes first).
 */
export function detectPanels(rows: LabResultRow[]): string[] {
  const found = new Set<string>();
  for (const row of rows) {
    for (const rule of PANEL_RULES) {
      if (rule.patterns.some((re) => re.test(row.field))) {
        found.add(rule.name);
      }
    }
  }
  return Array.from(found);
}

// ─── Reply text composers ─────────────────────────────────────────────────────

const SHEET_URL_PREFIX = "https://docs.google.com/spreadsheets/d/";

/**
 * Build the success reply for a participant.
 * Kept to ≤ 450 chars to fit within WhatsApp's free-form message window.
 */
export function composeSuccessReply(
  rows: LabResultRow[],
  sheetId: string,
): string {
  const count = rows.length;
  const panels = detectPanels(rows);
  const panelStr = panels.length > 0 ? panels.join(", ") : "lab markers";
  const link = `${SHEET_URL_PREFIX}${sheetId}`;

  const summary =
    `✅ Extracted ${count} marker${count !== 1 ? "s" : ""}: ${panelStr}.\n` +
    `View your results: ${link}`;

  // Truncate if somehow over 450 chars (very long panel list edge case)
  return summary.length <= 450 ? summary : summary.slice(0, 447) + "…";
}

/**
 * Build the error reply when extraction failed or produced zero rows.
 */
export function composeErrorReply(reason?: string): string {
  const detail =
    reason && reason.length < 120
      ? ` (${reason})`
      : "";
  return (
    `⚠️ I couldn't read your PDF${detail}.\n` +
    "Please try sending it again, or contact the study team for help."
  );
}

/**
 * Build the zero-rows reply when the PDF was readable but no markers found.
 */
export function composeEmptyReply(sheetId: string): string {
  const link = `${SHEET_URL_PREFIX}${sheetId}`;
  return (
    "ℹ️ Your PDF was received but no lab markers were found in it.\n" +
    "If this looks wrong, please resend or contact the study team.\n" +
    `Sheet: ${link}`
  );
}
