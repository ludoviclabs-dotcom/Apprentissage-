import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export interface RawExtraction {
  rawText: string;
  markdownText: string;
  pages: number;
  status: "extracted" | "needs-docling";
  reason?: string;
}

const MIN_TEXT_LENGTH = 200;
const MIN_ALNUM_RATIO = 0.45;

export function normalizeText(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function assessQuality(text: string): { ok: boolean; reason?: string } {
  const trimmed = text.trim();

  if (trimmed.length < MIN_TEXT_LENGTH) {
    return { ok: false, reason: `texte trop court (${trimmed.length} caractères)` };
  }

  const alnum = (trimmed.match(/[\p{L}\p{N}]/gu) ?? []).length;
  const ratio = alnum / trimmed.length;

  if (ratio < MIN_ALNUM_RATIO) {
    return { ok: false, reason: `ratio alphanumérique faible (${ratio.toFixed(2)}) — probable scan ou tableau` };
  }

  return { ok: true };
}

export async function extractPdf(absolutePath: string): Promise<RawExtraction> {
  const { PDFParse } = require("pdf-parse") as typeof import("pdf-parse");
  const buffer = await readFile(absolutePath);
  const parser = new PDFParse({ data: new Uint8Array(buffer) });

  try {
    const result = await parser.getText();
    const text = normalizeText(result.text ?? "");
    const quality = assessQuality(text);

    return {
      rawText: text,
      markdownText: text,
      pages: result.total ?? result.pages?.length ?? 1,
      status: quality.ok ? "extracted" : "needs-docling",
      reason: quality.reason
    };
  } finally {
    await parser.destroy();
  }
}

export async function extractDocx(absolutePath: string): Promise<RawExtraction> {
  const mammoth = require("mammoth") as typeof import("mammoth");
  const buffer = await readFile(absolutePath);
  const raw = await mammoth.extractRawText({ buffer });
  const text = normalizeText(raw.value ?? "");
  const quality = assessQuality(text);

  return {
    rawText: text,
    markdownText: text,
    pages: 1,
    status: quality.ok ? "extracted" : "needs-docling",
    reason: quality.reason
  };
}
