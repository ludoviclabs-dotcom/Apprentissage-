import { createHash } from "node:crypto";
import { CALCULATION_TEMPLATE_IDS, getTemplate } from "../calc/templates";
import {
  materialKindForCategory,
  type CorpusDocument,
  type CorpusIndex,
  type SourceMaterialKind
} from "../types/source-reference";
import type { PageUsability } from "../sources/page-usability";

/**
 * Construction déterministe de l'enveloppe envoyée au générateur.
 *
 * Deux garanties portent tout le reste : on ne mélange jamais deux chapitres, et
 * on ne tronque jamais en silence. Ce qui n'entre pas dans la limite est listé
 * dans `excluded`, avec sa raison — un brouillon produit à partir d'un corpus
 * amputé doit être identifiable comme tel.
 */

export const DEFAULT_MAX_INPUT_CHARS = 60_000;

export interface EnvelopeChunk {
  chunkId: string;
  documentId: string;
  pageStart: number;
  pageEnd: number;
  sectionTitle: string;
  content: string;
  contentHash: string;
}

export interface EnvelopeDocument {
  documentId: string;
  packId: string;
  title: string;
  category: string;
  /** Cours, référence officielle, note ou énoncé — jamais implicite. */
  materialKind: SourceMaterialKind;
  effectiveDate?: string;
  pageCount: number;
  /** Pages dont l'extraction est dégradée : citables, mais non approuvables. */
  degradedPages: number[];
  chunks: EnvelopeChunk[];
}

export interface ExcludedItem {
  chunkId: string;
  documentId: string;
  reason: string;
}

export interface SourceEnvelope {
  chapterSlug: string;
  chapterLabel: string;
  domainId: string;
  sourcePackId: string;
  documents: EnvelopeDocument[];
  excluded: ExcludedItem[];
  /** Somme des caractères de contenu réellement inclus. */
  totalChars: number;
  maxInputChars: number;
  /** Empreinte des entrées : même corpus ⇒ même hash. */
  inputHash: string;
  /** Templates de calcul autorisés, transmis au générateur. */
  allowedCalculationTemplates: readonly string[];
}

export interface BuildEnvelopeOptions {
  chapterSlug: string;
  chapterLabel: string;
  sourcePackId: string;
  maxInputChars?: number;
  /** Restreint aux catégories utiles (course, exercise, correction…). */
  includeCategories?: readonly string[];
  /**
   * Classement des pages dont le texte extrait ne fait pas foi.
   *
   * L'enveloppe est le seul endroit où le texte du corpus entre dans une
   * génération : c'est donc ici, et pas dans le générateur, que se refuse une
   * page dont la couche texte porte autre chose que ce qu'elle affiche. Le
   * filtrer plus tard laisserait le texte transiter par le prompt.
   */
  pageUsability?: ReadonlyMap<string, PageUsability>;
}

/**
 * Priorité d'inclusion quand le corpus dépasse la limite : le cours d'abord
 * (c'est lui qui porte les règles citables), puis les corrigés, puis les
 * énoncés. Une synthèse vaut mieux qu'une annale si la place manque.
 */
const CATEGORY_PRIORITY: Readonly<Record<string, number>> = {
  course: 0,
  synthesis: 1,
  correction: 2,
  exercise: 3,
  reference: 4,
  exam: 5
};

function categoryRank(category: string): number {
  return CATEGORY_PRIORITY[category] ?? 9;
}

export function buildSourceEnvelope(
  corpus: CorpusIndex,
  options: BuildEnvelopeOptions
): SourceEnvelope {
  const maxInputChars = options.maxInputChars ?? DEFAULT_MAX_INPUT_CHARS;

  const candidates = corpus
    .listDocuments()
    .filter((document) => document.chapterSlug === options.chapterSlug)
    .filter(
      (document) => !options.includeCategories || options.includeCategories.includes(document.category)
    )
    .sort((left, right) => {
      const rank = categoryRank(left.category) - categoryRank(right.category);
      return rank !== 0 ? rank : left.documentId.localeCompare(right.documentId);
    });

  if (candidates.length === 0) {
    throw new Error(
      `aucun document pour le chapitre « ${options.chapterSlug} » — vérifier le pack et lancer content:scan puis content:extract`
    );
  }

  const domains = new Set(candidates.map((document) => document.domainId));
  if (domains.size > 1) {
    throw new Error(
      `le chapitre « ${options.chapterSlug} » couvre plusieurs domaines (${[...domains].join(", ")}) — un mélange de domaines produirait des citations incohérentes`
    );
  }

  const documents: EnvelopeDocument[] = [];
  const excluded: ExcludedItem[] = [];
  const seenHashes = new Set<string>();
  let totalChars = 0;

  for (const candidate of candidates) {
    const degradedPages = candidate.pages
      .filter((page) => page.degraded)
      .map((page) => page.pageNumber);

    const chunks: EnvelopeChunk[] = [];

    for (const chunk of [...candidate.chunks].sort(
      (left, right) => left.pageStart - right.pageStart || left.id.localeCompare(right.id)
    )) {
      if (seenHashes.has(chunk.contentHash)) {
        excluded.push({
          chunkId: chunk.id,
          documentId: candidate.documentId,
          reason: "chunk en double (même contenu déjà inclus)"
        });
        continue;
      }

      // UN CHUNK QUI TOUCHE UNE PAGE NON FIABLE EST ÉCARTÉ EN ENTIER. Il
      // pourrait ne porter que du texte visible, mais rien dans le chunk ne
      // permet de le dire : `mixed` est traité comme les autres, faute de
      // pouvoir séparer les portions fiables au niveau du chunk. Retenir le
      // doute est ce qui empêche un corrigé invisible d'atteindre le prompt.
      const unreliablePage = options.pageUsability
        ? Array.from(
            { length: chunk.pageEnd - chunk.pageStart + 1 },
            (_, offset) => chunk.pageStart + offset
          )
            .map((pageNumber) => options.pageUsability?.get(`${candidate.documentId}:${pageNumber}`))
            .find((entry) => entry !== undefined && entry.usability !== "reliable")
        : undefined;

      if (unreliablePage) {
        excluded.push({
          chunkId: chunk.id,
          documentId: candidate.documentId,
          reason: `page ${unreliablePage.pageNumber} classée « ${unreliablePage.usability} » : ${unreliablePage.reason}. Une annotation visuelle approuvée est requise pour cette page.`
        });
        continue;
      }

      if (totalChars + chunk.content.length > maxInputChars) {
        excluded.push({
          chunkId: chunk.id,
          documentId: candidate.documentId,
          reason: `limite de ${maxInputChars} caractères atteinte — contenu non transmis au générateur`
        });
        continue;
      }

      seenHashes.add(chunk.contentHash);
      totalChars += chunk.content.length;
      chunks.push({
        chunkId: chunk.id,
        documentId: candidate.documentId,
        pageStart: chunk.pageStart,
        pageEnd: chunk.pageEnd,
        sectionTitle: chunk.sectionTitle,
        content: chunk.content,
        contentHash: chunk.contentHash
      });
    }

    documents.push({
      documentId: candidate.documentId,
      packId: candidate.packId,
      title: candidate.title,
      category: candidate.category,
      materialKind: materialKindForCategory(candidate.category),
      effectiveDate: candidate.effectiveDate,
      pageCount: candidate.pages.length,
      degradedPages,
      chunks
    });
  }

  return {
    chapterSlug: options.chapterSlug,
    chapterLabel: options.chapterLabel,
    domainId: candidates[0].domainId,
    sourcePackId: options.sourcePackId,
    documents,
    excluded,
    totalChars,
    maxInputChars,
    inputHash: hashEnvelopeInputs(candidates, options.chapterSlug),
    allowedCalculationTemplates: CALCULATION_TEMPLATE_IDS
  };
}

/**
 * Empreinte fondée sur les hashes de contenu, pas sur le texte : elle change dès
 * qu'une source change, et reste stable si seul l'ordre de lecture varie.
 */
function hashEnvelopeInputs(documents: readonly CorpusDocument[], chapterSlug: string): string {
  const parts = documents
    .flatMap((document) => document.chunks.map((chunk) => `${document.documentId}:${chunk.contentHash}`))
    .sort();

  return createHash("sha256").update(`${chapterSlug}\n${parts.join("\n")}`).digest("hex");
}

/**
 * Rendu textuel de l'enveloppe pour le prompt. Aucun chemin de fichier n'y
 * figure : le générateur voit des identifiants, des pages et du texte.
 */
export function renderEnvelope(envelope: SourceEnvelope): string {
  const lines: string[] = [
    `CHAPITRE : ${envelope.chapterLabel}`,
    `DOMAINE : ${envelope.domainId}`,
    `PACK : ${envelope.sourcePackId}`,
    "",
    "SOURCES DISPONIBLES. Cite uniquement les documentId, pages et chunkIds ci-dessous.",
    ""
  ];

  for (const document of envelope.documents) {
    lines.push(
      `### Document ${document.documentId} — « ${document.title} » (${document.category}, nature « ${document.materialKind} », ${document.pageCount} pages)`
    );

    if (document.degradedPages.length > 0) {
      lines.push(
        `  ⚠ pages à extraction dégradée, à éviter : ${document.degradedPages.join(", ")}`
      );
    }

    for (const chunk of document.chunks) {
      const pages =
        chunk.pageStart === chunk.pageEnd
          ? `page ${chunk.pageStart}`
          : `pages ${chunk.pageStart}-${chunk.pageEnd}`;
      lines.push("", `[chunkId: ${chunk.chunkId} | ${pages}]`, chunk.content);
    }

    lines.push("");
  }

  if (envelope.excluded.length > 0) {
    lines.push(
      `NOTE : ${envelope.excluded.length} fragment(s) de source n'ont pas été transmis (limite de taille ou doublon).`,
      ""
    );
  }

  lines.push("TEMPLATES DE CALCUL AUTORISÉS (aucune autre formule n'est acceptée) :");
  for (const templateId of envelope.allowedCalculationTemplates) {
    const template = getTemplate(templateId);
    if (template) {
      const inputs = template.inputs.map((input) => `${input.name} (${input.unit})`).join(", ");
      lines.push(`- ${templateId} : ${template.label}. Entrées : ${inputs}.`);
    }
  }

  return lines.join("\n");
}
