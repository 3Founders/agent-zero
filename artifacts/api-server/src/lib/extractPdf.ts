/**
 * PDF text extraction.
 *
 * Strategy:
 *  1. pdf-parse extracts embedded text from the full document.
 *  2. If the result is too sparse (< MIN_CHARS), Tesseract.js OCRs the PDF.
 *
 * Returns the concatenated text of all pages.
 */

import { createRequire } from "module";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { logger } from "./logger.js";

// pdf-parse is CJS; use createRequire for clean ESM interop.
const require = createRequire(import.meta.url);

// Minimum extracted characters to consider the PDF "digital" (not scanned).
const MIN_CHARS = 50;

/**
 * Extract all text from a PDF buffer.
 * Falls back to Tesseract OCR when pdf-parse yields too little text.
 */
export async function extractTextFromPdf(pdfBuffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfParse: (buf: Buffer) => Promise<{ text: string; numpages: number }> =
    require("pdf-parse");

  let fullText = "";

  try {
    const result = await pdfParse(pdfBuffer);
    fullText = result.text ?? "";
    logger.info(
      { pages: result.numpages, chars: fullText.length },
      "pdf-parse extraction complete",
    );
  } catch (err) {
    logger.warn({ err }, "pdf-parse failed, will attempt OCR");
    fullText = "";
  }

  // If we got very little text the PDF is likely scanned — run OCR.
  if (fullText.trim().length < MIN_CHARS) {
    logger.info("Text sparse, running Tesseract OCR");
    fullText = await ocrPdfBuffer(pdfBuffer);
  }

  return fullText;
}

/**
 * Run Tesseract.js OCR on a buffer written to a temp file.
 */
async function ocrPdfBuffer(pdfBuffer: Buffer): Promise<string> {
  const tmpPath = join(tmpdir(), `agent0_ocr_${Date.now()}.pdf`);
  try {
    await writeFile(tmpPath, pdfBuffer);

    // Dynamic import to avoid a top-level ESM/CJS conflict.
    // tesseract.js ships its own types; the any cast keeps tsc happy across versions.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Tesseract = (await import("tesseract.js")) as any;
    const recognize = Tesseract.default?.recognize ?? Tesseract.recognize;

    const { data } = await recognize(
      tmpPath,
      "eng",
      {
        logger: (m: { status: string; progress?: number }) => {
          if (m.status === "recognizing text") {
            logger.debug({ progress: m.progress }, "OCR progress");
          }
        },
      },
    );

    logger.info({ chars: data.text.length }, "Tesseract OCR complete");
    return data.text as string;
  } finally {
    await unlink(tmpPath).catch(() => undefined);
  }
}
