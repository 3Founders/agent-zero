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
 * Run Tesseract.js OCR on a PDF buffer.
 *
 * Tesseract/Leptonica has no native PDF decoder — it only reads raster image
 * formats (PNG, JPG, TIFF, etc). We first rasterize each PDF page to a PNG
 * with `pdf-to-img` (pure pdfjs-dist, no native canvas dependency — safe on
 * Vercel serverless), then OCR each page image and concatenate the text.
 */
async function ocrPdfBuffer(pdfBuffer: Buffer): Promise<string> {
  // Dynamic imports to avoid top-level ESM/CJS interop issues.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { pdf } = (await import("pdf-to-img")) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Tesseract = (await import("tesseract.js")) as any;
  const recognize = Tesseract.default?.recognize ?? Tesseract.recognize;

  const pageTexts: string[] = [];
  const document = await pdf(pdfBuffer, { scale: 2 });

  let pageIndex = 0;
  for await (const pageImage of document) {
    pageIndex += 1;
    const tmpPath = join(tmpdir(), `agent0_ocr_${Date.now()}_p${pageIndex}.png`);
    try {
      await writeFile(tmpPath, pageImage);

      const { data } = await recognize(tmpPath, "eng", {
        // Serverless platforms (Vercel, etc.) have a read-only filesystem
        // outside /tmp — tesseract.js otherwise tries to cache the ~5MB
        // language model next to cwd, which fails there.
        cachePath: tmpdir(),
        logger: (m: { status: string; progress?: number }) => {
          if (m.status === "recognizing text") {
            logger.debug({ page: pageIndex, progress: m.progress }, "OCR progress");
          }
        },
      });

      pageTexts.push(data.text as string);
    } finally {
      await unlink(tmpPath).catch(() => undefined);
    }
  }

  const fullText = pageTexts.join("\n");
  logger.info({ pages: pageIndex, chars: fullText.length }, "Tesseract OCR complete");
  return fullText;
}
