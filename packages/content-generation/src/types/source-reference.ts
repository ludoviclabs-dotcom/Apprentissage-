import { z } from "zod";

/**
 * Référence de source vérifiable.
 *
 * Le schéma seul ne prouve rien : il garantit la forme (pages positives,
 * intervalle croissant, au moins un chunk). C'est `verifyReference` qui prouve
 * l'existence, en confrontant la référence au corpus réellement extrait. Un
 * contenu ne peut pas atteindre `needs_review` sans que chacune de ses
 * références ait passé cette vérification.
 */
export const sourceReferenceSchema = z
  .object({
    documentId: z.string().min(1),
    documentTitle: z.string().min(1),
    pageStart: z.number().int().min(1, "pageStart doit valoir au moins 1"),
    pageEnd: z.number().int().min(1),
    chunkIds: z.array(z.string().min(1)).min(1, "au moins un chunk doit étayer la référence"),
    sectionTitle: z.string().optional(),
    /** Extrait court affiché au relecteur ; jamais un document entier. */
    excerpt: z.string().max(1200).optional(),
    /** Hash du chunk cité, pour détecter une source qui a changé sous le contenu. */
    excerptHash: z.string().regex(/^[a-f0-9]{64}$/, "SHA-256 hexadécimal attendu").optional()
  })
  .refine((reference) => reference.pageEnd >= reference.pageStart, {
    message: "pageEnd doit être supérieur ou égal à pageStart",
    path: ["pageEnd"]
  });

export type StrictSourceReference = z.infer<typeof sourceReferenceSchema>;

export interface CorpusPage {
  pageNumber: number;
  /** Une page en `needs-review` ne peut pas étayer un contenu approuvable. */
  degraded: boolean;
}

export interface CorpusChunk {
  id: string;
  documentId: string;
  pageStart: number;
  pageEnd: number;
  contentHash: string;
  content: string;
  sectionTitle: string;
}

export interface CorpusDocument {
  documentId: string;
  title: string;
  relativePath: string;
  category: string;
  domainId: string;
  chapterSlug: string;
  pages: CorpusPage[];
  chunks: CorpusChunk[];
}

/**
 * Index en mémoire du corpus extrait. Construit depuis `data/extracted/`, il est
 * la seule autorité sur « cette page existe-t-elle », « ce chunk appartient-il à
 * ce document ». Aucun chemin absolu n'y entre : les artefacts du pipeline
 * portent déjà des chemins relatifs.
 */
export class CorpusIndex {
  private readonly documents = new Map<string, CorpusDocument>();

  constructor(documents: readonly CorpusDocument[]) {
    for (const document of documents) {
      this.documents.set(document.documentId, document);
    }
  }

  get size(): number {
    return this.documents.size;
  }

  listDocuments(): CorpusDocument[] {
    return [...this.documents.values()].sort((left, right) =>
      left.documentId.localeCompare(right.documentId)
    );
  }

  getDocument(documentId: string): CorpusDocument | undefined {
    return this.documents.get(documentId);
  }

  getChunk(documentId: string, chunkId: string): CorpusChunk | undefined {
    return this.documents.get(documentId)?.chunks.find((chunk) => chunk.id === chunkId);
  }
}

export interface ReferenceProblem {
  code:
    | "document-inconnu"
    | "page-inexistante"
    | "chunk-inconnu"
    | "chunk-hors-intervalle"
    | "hash-divergent"
    | "page-degradee";
  message: string;
}

export interface ReferenceVerification {
  valid: boolean;
  /** Bloquant : la référence ne désigne pas ce qu'elle prétend désigner. */
  problems: ReferenceProblem[];
  /** Non bloquant à la génération, bloquant à l'approbation. */
  warnings: ReferenceProblem[];
}

/**
 * Confronte une référence au corpus. Sépare délibérément les problèmes
 * (la référence est fausse) des avertissements (la référence est exacte mais
 * s'appuie sur une page dont l'extraction est dégradée) : le premier cas est un
 * échec de validation, le second interdit seulement l'approbation.
 */
export function verifyReference(
  reference: StrictSourceReference,
  corpus: CorpusIndex
): ReferenceVerification {
  const problems: ReferenceProblem[] = [];
  const warnings: ReferenceProblem[] = [];

  const document = corpus.getDocument(reference.documentId);

  if (!document) {
    return {
      valid: false,
      problems: [
        {
          code: "document-inconnu",
          message: `le document « ${reference.documentId} » n'existe pas dans le corpus extrait`
        }
      ],
      warnings
    };
  }

  const pagesByNumber = new Map(document.pages.map((page) => [page.pageNumber, page]));

  for (let pageNumber = reference.pageStart; pageNumber <= reference.pageEnd; pageNumber += 1) {
    const page = pagesByNumber.get(pageNumber);

    if (!page) {
      problems.push({
        code: "page-inexistante",
        message: `la page ${pageNumber} n'existe pas dans « ${document.title} » (pages disponibles : ${document.pages.length})`
      });
      continue;
    }

    if (page.degraded) {
      warnings.push({
        code: "page-degradee",
        message: `la page ${pageNumber} de « ${document.title} » a une extraction dégradée — à vérifier avant approbation`
      });
    }
  }

  for (const chunkId of reference.chunkIds) {
    const chunk = corpus.getChunk(reference.documentId, chunkId);

    if (!chunk) {
      problems.push({
        code: "chunk-inconnu",
        message: `le chunk « ${chunkId} » n'appartient pas au document « ${document.title} »`
      });
      continue;
    }

    if (chunk.pageStart < reference.pageStart || chunk.pageEnd > reference.pageEnd) {
      problems.push({
        code: "chunk-hors-intervalle",
        message: `le chunk « ${chunkId} » couvre les pages ${chunk.pageStart}-${chunk.pageEnd}, hors de l'intervalle cité ${reference.pageStart}-${reference.pageEnd}`
      });
    }
  }

  // L'extrait provient d'un seul fragment, alors qu'une référence peut en citer
  // plusieurs : le hash doit correspondre à l'un d'eux, pas à tous.
  if (reference.excerptHash) {
    const matchesOne = reference.chunkIds.some(
      (chunkId) => corpus.getChunk(reference.documentId, chunkId)?.contentHash === reference.excerptHash
    );

    if (!matchesOne) {
      problems.push({
        code: "hash-divergent",
        message:
          "l'extrait cité ne correspond à aucun des fragments référencés — la source a changé depuis la génération, régénérer le contenu plutôt que le corriger"
      });
    }
  }

  return { valid: problems.length === 0, problems, warnings };
}

/** Toutes les références d'un contenu, vérifiées d'un coup. */
export function verifyReferences(
  references: readonly StrictSourceReference[],
  corpus: CorpusIndex
): ReferenceVerification {
  const problems: ReferenceProblem[] = [];
  const warnings: ReferenceProblem[] = [];

  for (const reference of references) {
    const result = verifyReference(reference, corpus);
    problems.push(...result.problems);
    warnings.push(...result.warnings);
  }

  return { valid: problems.length === 0, problems, warnings };
}
