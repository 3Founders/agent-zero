/**
 * LLM-based lab-result extraction.
 *
 * Sends raw text to GPT and expects a strictly-typed JSON array back.
 * Never fabricates values — explicitly null if not present in the document.
 */

import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger.js";
import type { LabResultRow } from "./extractionStore.js";

const SYSTEM_PROMPT = `You are a clinical data extraction assistant processing blood test reports.

Your ONLY job is to extract lab test results that are explicitly present in the provided report text.

Output EXACTLY a JSON array (no prose, no markdown, no explanation) in this format:
[
  {
    "field": "Test name exactly as written in the report",
    "value": "Numeric or text result as written",
    "unit": "Unit string or null if not present",
    "referenceRange": "Reference range string or null if not present"
  }
]

STRICT RULES:
1. Return ONLY the JSON array — nothing before or after it.
2. If a field value is not clearly present in the text, set it to null.
3. NEVER fabricate, infer, or guess values. If in doubt, set to null.
4. If you cannot find ANY lab results in the text, return an empty array: []
5. Do not include demographic information (name, age, DOB) as lab results.
6. Include every test result you can find: hemogram, lipid panel, liver function, thyroid, diabetes, etc.
7. Preserve the exact test name as it appears in the report.`;

export interface ExtractionLLMError {
  kind: "llm_error";
  reason: string;
  /**
   * true  → transient error (API/network/rate-limit/JSON instability); safe to retry.
   * false → permanent error (text too short, unreadable); retrying the same file won't help.
   */
  retryable: boolean;
}

/**
 * Call the LLM to extract structured lab result rows from raw PDF text.
 * Returns either an array of rows or an error descriptor.
 */
export async function extractLabResultsFromText(
  text: string,
): Promise<LabResultRow[] | ExtractionLLMError> {
  if (!text || text.trim().length < 20) {
    return {
      kind: "llm_error",
      reason: "Extracted text is too short to process",
      retryable: false, // Corrupted / blank PDF — retrying won't help
    };
  }

  // Truncate extremely long texts to fit within model context (keep ~60k chars)
  const truncated = text.length > 60_000 ? text.slice(0, 60_000) : text;

  let rawContent: string | null = null;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.6-luna", // cost-effective for high-volume extraction
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Extract all lab results from the following blood report text:\n\n${truncated}`,
        },
      ],
    });

    rawContent = response.choices[0]?.message?.content ?? null;
  } catch (err) {
    logger.error({ err }, "OpenAI API call failed");
    return {
      kind: "llm_error",
      reason: `LLM call failed: ${String(err)}`,
      retryable: true, // Network / rate-limit / server error — worth retrying
    };
  }

  if (!rawContent) {
    return {
      kind: "llm_error",
      reason: "LLM returned empty content",
      retryable: true, // Model instability — retry may succeed
    };
  }

  // Strip optional markdown code fence if the model wrapped the JSON
  const cleaned = rawContent
    .replace(/^```(?:json)?\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    logger.warn({ rawContent: rawContent.slice(0, 500) }, "LLM response is not valid JSON");
    return {
      kind: "llm_error",
      reason: `LLM response could not be parsed as JSON: ${cleaned.slice(0, 200)}`,
      retryable: true, // Model instability / hallucinated markdown — retry may succeed
    };
  }

  if (!Array.isArray(parsed)) {
    return {
      kind: "llm_error",
      reason: "LLM response is not a JSON array",
      retryable: true, // Model instability — retry may succeed
    };
  }

  // Validate and coerce each row
  const rows: LabResultRow[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as Record<string, unknown>;
    rows.push({
      field: typeof row.field === "string" ? row.field : String(row.field ?? ""),
      value: row.value != null ? String(row.value) : null,
      unit: row.unit != null ? String(row.unit) : null,
      referenceRange: row.referenceRange != null ? String(row.referenceRange) : null,
    });
  }

  logger.info({ rowCount: rows.length }, "Lab result extraction complete");
  return rows;
}
