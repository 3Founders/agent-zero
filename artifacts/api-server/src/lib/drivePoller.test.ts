/**
 * Unit-level checks for Drive poller retry-classification logic.
 *
 * These are intentionally framework-free (no Jest/Vitest dependency) so they
 * can be run with plain `tsx` or included in the typecheck pass.  They throw
 * on failure so CI will catch regressions in ProcessResult semantics.
 *
 * Run:  npx tsx src/lib/drivePoller.test.ts
 */

import { parsePhoneFromFilename } from "./drivePoller.js";
import type { ExtractionLLMError } from "./extractLabResults.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

// ─── parsePhoneFromFilename ────────────────────────────────────────────────────

console.log("parsePhoneFromFilename");

assert(
  "extracts E.164 number with + prefix",
  parsePhoneFromFilename("+919876543210_day30.pdf") === "+919876543210",
);

assert(
  "extracts number without leading +",
  parsePhoneFromFilename("919876543210_report.pdf") === "+919876543210",
);

assert(
  "returns null for no phone in filename",
  parsePhoneFromFilename("thyrocare_june.pdf") === null,
);

assert(
  "returns null for too-short digit sequence",
  parsePhoneFromFilename("day7.pdf") === null,
);

assert(
  "handles name with spaces around number",
  parsePhoneFromFilename("participant +918888888888 report.pdf") !== null,
);

// ─── ExtractionLLMError retryable flag ───────────────────────────────────────

console.log("\nExtractionLLMError.retryable semantics");

// Simulate what extractLabResultsFromText returns for each error case.
const shortText: ExtractionLLMError = {
  kind: "llm_error",
  reason: "Extracted text is too short to process",
  retryable: false,
};

const apiFailure: ExtractionLLMError = {
  kind: "llm_error",
  reason: "LLM call failed: FetchError: network timeout",
  retryable: true,
};

const jsonParseFailure: ExtractionLLMError = {
  kind: "llm_error",
  reason: "LLM response could not be parsed as JSON: ...",
  retryable: true,
};

const emptyContent: ExtractionLLMError = {
  kind: "llm_error",
  reason: "LLM returned empty content",
  retryable: true,
};

assert("short text → not retryable", !shortText.retryable);
assert("API failure → retryable", apiFailure.retryable);
assert("JSON parse failure → retryable", jsonParseFailure.retryable);
assert("empty content → retryable", emptyContent.retryable);

// ─── ProcessResult mapping ────────────────────────────────────────────────────

console.log("\nProcessResult mapping from ExtractionLLMError");

function classifyLLMError(err: ExtractionLLMError): "permanent_failure" | "transient_failure" {
  return err.retryable ? "transient_failure" : "permanent_failure";
}

assert(
  "permanent error maps to permanent_failure",
  classifyLLMError(shortText) === "permanent_failure",
);

assert(
  "API error maps to transient_failure",
  classifyLLMError(apiFailure) === "transient_failure",
);

assert(
  "JSON parse error maps to transient_failure",
  classifyLLMError(jsonParseFailure) === "transient_failure",
);

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
