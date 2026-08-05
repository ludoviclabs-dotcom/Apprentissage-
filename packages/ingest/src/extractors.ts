import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export interface ExtractedPageContent {
  /** Numéro réel de la page dans le document source (1-indexé). */
  pageNumber: number;
  rawText: string;
  markdownText: string;
}

export interface RawExtraction {
  rawText: string;
  markdownText: string;
  pages: number;
  /** Contenu page par page ; vide uniquement quand le format n'est pas couvert. */
  pageContents: ExtractedPageContent[];
  status: "extracted" | "needs-docling";
  reason?: string;
}

const MIN_TEXT_LENGTH = 200;
const MIN_ALNUM_RATIO = 0.45;

// Espace insécable (U+00A0), fréquent dans les PDF français.
const NON_BREAKING_SPACE = /\u00A0/g;

export function normalizeText(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(NON_BREAKING_SPACE, " ")
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

/** Marqueur de saut de page conservé dans le Markdown assemblé. */
export function pageBreakMarker(pageNumber: number): string {
  return `<!-- page: ${pageNumber} -->`;
}

export function joinPagesAsMarkdown(pageContents: ExtractedPageContent[]): string {
  return pageContents
    .map((page) => `${pageBreakMarker(page.pageNumber)}\n\n${page.markdownText}`.trim())
    .join("\n\n")
    .trim();
}

export async function extractPdf(absolutePath: string): Promise<RawExtraction> {
  const { PDFParse } = require("pdf-parse") as typeof import("pdf-parse");
  const buffer = await readFile(absolutePath);
  const parser = new PDFParse({ data: new Uint8Array(buffer) });

  try {
    const result = await parser.getText();
    const pageContents: ExtractedPageContent[] = (result.pages ?? []).map((page) => {
      const text = normalizeText(page.text ?? "");
      return { pageNumber: page.num, rawText: text, markdownText: text };
    });
    const text = normalizeText(result.text ?? "");
    const quality = assessQuality(text);

    return {
      rawText: text,
      markdownText: pageContents.length > 0 ? joinPagesAsMarkdown(pageContents) : text,
      pages: result.total ?? pageContents.length ?? 1,
      pageContents,
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
    // Le format DOCX ne matérialise pas de pagination : une page logique unique,
    // signalée comme telle par l'appelant (issue `pagination-unavailable`).
    pageContents: [{ pageNumber: 1, rawText: text, markdownText: text }],
    status: quality.ok ? "extracted" : "needs-docling",
    reason: quality.reason
  };
}
