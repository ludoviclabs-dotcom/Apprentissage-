import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export interface ExtractedPageContent {
  /** Numéro réel de la page dans le document source (1-indexé). */
  pageNumber: number;
  rawText: string;
  markdownText: string;
}

/**
 * Ce que le sondage d'images a pu établir, page par page.
 *
 * Le sondage ne porte que sur les pages *candidates* — celles dont le texte est
 * trop court —, parce qu'il coûte cher et qu'il n'apprend rien sur une page
 * dense. Une page hors de `probedPages` est donc *indécidable*, ce qui n'est pas
 * la même chose que « sans image » : les deux cas sont distingués par
 * {@link readImageProbe} et mènent à des conclusions opposées.
 */
export interface PageImageProbe {
  /** Pages effectivement sondées, numéros réels (1-indexé). */
  probedPages: number[];
  /** Parmi les pages sondées, celles portant au moins une image significative. */
  imageBearingPages: number[];
  /**
   * Renseigné quand le sondage a échoué — un format d'image que `pdf-parse` ne
   * sait pas décoder, par exemple. Le sondage est alors sans valeur *en entier*,
   * et le dire vaut mieux que de laisser croire à des pages sans image.
   */
  probeFailure?: string;
}

export interface RawExtraction {
  rawText: string;
  markdownText: string;
  pages: number;
  /** Contenu page par page ; vide uniquement quand le format n'est pas couvert. */
  pageContents: ExtractedPageContent[];
  status: "extracted" | "needs-docling";
  reason?: string;
  /** Absent pour les formats où la question ne se pose pas (DOCX, Markdown). */
  imageProbe?: PageImageProbe;
}

const MIN_TEXT_LENGTH = 200;
const MIN_ALNUM_RATIO = 0.45;

/**
 * Surface minimale, en pixels, à partir de laquelle une image est tenue pour
 * porteuse de contenu.
 *
 * 240 × 240 écarte les vignettes décoratives — puce, filet, logo — sans écarter
 * un schéma ni un bloc scanné. Le critère porte sur la *surface* et non sur
 * chaque côté, pour qu'une bande scannée large et basse (2000 × 120, une ligne
 * de formule ou une signature) reste comptée : c'est exactement ce que le filtre
 * intégré de `pdf-parse` laisserait échapper, puisqu'il compare chaque dimension
 * au seuil séparément.
 *
 * Mesuré sur le pack `compta-approfondie` : les images réellement porteuses de
 * contenu font 1319 × 1022, 1998 × 795 et 2096 × 751 ; aucune image en dessous
 * du seuil n'apparaît sur les pages sondées. La valeur exacte n'y départage donc
 * rien — elle est là pour les corpus à venir.
 */
const MIN_SIGNIFICANT_IMAGE_AREA = 240 * 240;

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

/**
 * Ce qui manque au texte, quand quelque chose lui manque.
 *
 * La distinction est portée par un type fermé plutôt que devinée dans le libellé
 * de `reason`, parce que les deux défauts n'ont pas la même conclusion :
 * `text-too-short` est compatible avec une extraction parfaite (un formulaire
 * vierge, une page de séparation) et demande donc une preuve supplémentaire,
 * tandis que `low-alnum-ratio` constate un texte déjà abîmé.
 */
export type QualityDefect = "text-too-short" | "low-alnum-ratio";

export interface QualityAssessment {
  ok: boolean;
  defect?: QualityDefect;
  reason?: string;
}

export function assessQuality(text: string): QualityAssessment {
  const trimmed = text.trim();

  if (trimmed.length < MIN_TEXT_LENGTH) {
    return {
      ok: false,
      defect: "text-too-short",
      reason: `texte trop court (${trimmed.length} caractères)`
    };
  }

  const alnum = (trimmed.match(/[\p{L}\p{N}]/gu) ?? []).length;
  const ratio = alnum / trimmed.length;

  if (ratio < MIN_ALNUM_RATIO) {
    return {
      ok: false,
      defect: "low-alnum-ratio",
      reason: `ratio alphanumérique faible (${ratio.toFixed(2)}) — probable scan ou tableau`
    };
  }

  return { ok: true };
}

/** Ce que le sondage dit d'une page — y compris qu'il n'en dit rien. */
export type PageImageVerdict = "image-present" | "no-image" | "not-probed";

export function readImageProbe(
  probe: PageImageProbe | undefined,
  pageNumber: number
): PageImageVerdict {
  if (!probe || probe.probeFailure !== undefined || !probe.probedPages.includes(pageNumber)) {
    return "not-probed";
  }

  return probe.imageBearingPages.includes(pageNumber) ? "image-present" : "no-image";
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

type PdfParser = InstanceType<typeof import("pdf-parse").PDFParse>;

/**
 * Cherche une image significative sur les pages désignées, et sur elles seules.
 *
 * Le sondage réutilise le parser déjà chargé : le document n'est pas relu, seule
 * la liste d'opérateurs des pages visées est parcourue. Mesuré sur les dix PDF du
 * pack `compta-approfondie` (84 pages, 4 candidates), le surcoût est de 44 à
 * 182 ms sur ~1,4 s d'extraction de texte, là où le même sondage appliqué à
 * *toutes* les pages coûte 3,4 à 3,6 s — d'où le ciblage.
 */
async function probePageImages(parser: PdfParser, pageNumbers: number[]): Promise<PageImageProbe> {
  if (pageNumbers.length === 0) {
    return { probedPages: [], imageBearingPages: [] };
  }

  try {
    const result = await parser.getImage({
      partial: pageNumbers,
      // Le filtre intégré compare la largeur *ou* la hauteur au seuil : une bande
      // scannée large et basse y échapperait. On le désactive et on juge sur la
      // surface (MIN_SIGNIFICANT_IMAGE_AREA).
      imageThreshold: 0,
      // Ni tampon ni data URL : seules les dimensions nous intéressent, et
      // l'encodage PNG est le poste le plus coûteux de `getImage`.
      imageBuffer: false,
      imageDataUrl: false
    });

    return {
      probedPages: [...pageNumbers],
      imageBearingPages: (result.pages ?? [])
        .filter((page) =>
          page.images.some((image) => image.width * image.height >= MIN_SIGNIFICANT_IMAGE_AREA)
        )
        .map((page) => page.pageNumber)
    };
  } catch (error) {
    // Un échec ne se rattrape pas en silence : il vide le sondage de sa valeur,
    // et l'appelant doit retomber sur le classement prudent en le disant.
    return {
      probedPages: [...pageNumbers],
      imageBearingPages: [],
      probeFailure: error instanceof Error ? error.message : String(error)
    };
  }
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
    const imageProbe = await probePageImages(
      parser,
      pageContents
        .filter((page) => assessQuality(page.rawText).defect === "text-too-short")
        .map((page) => page.pageNumber)
    );

    // Un document globalement court n'est illisible que si son contenu est
    // ailleurs que dans le texte. Quand il est court, que toutes ses pages ont
    // donc été sondées et qu'aucune ne porte d'image, Docling n'en tirerait rien
    // de plus : le document est court par construction. Le classer
    // `needs-docling` contredirait en outre ses propres pages, qui se disent
    // peu denses et non dégradées.
    const sparseByDesign =
      quality.defect === "text-too-short" &&
      imageProbe.probeFailure === undefined &&
      imageProbe.probedPages.length > 0 &&
      imageProbe.imageBearingPages.length === 0;
    const usable = quality.ok || sparseByDesign;

    return {
      rawText: text,
      markdownText: pageContents.length > 0 ? joinPagesAsMarkdown(pageContents) : text,
      pages: result.total ?? pageContents.length ?? 1,
      pageContents,
      status: usable ? "extracted" : "needs-docling",
      reason: usable ? undefined : quality.reason,
      imageProbe
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
