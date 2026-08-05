import type { EnvelopeChunk, SourceEnvelope } from "../envelope/build";
import type { StrictSourceReference } from "../types/source-reference";

/**
 * Outils des fixtures du mode mock.
 *
 * Les fixtures ne codent jamais un identifiant de chunk en dur : elles
 * *cherchent* dans l'enveloppe le fragment qui porte la notion visée, et en
 * dérivent une référence. Une fixture reste donc exacte quand le corpus est
 * ré-extrait, et devient introuvable — donc absente — si la source disparaît,
 * ce qui est le comportement voulu : pas de source, pas de contenu.
 */

export interface ChunkMatch {
  chunk: EnvelopeChunk;
  documentTitle: string;
}

export function findChunk(
  envelope: SourceEnvelope,
  predicate: (content: string) => boolean,
  options: { category?: string } = {}
): ChunkMatch | undefined {
  for (const document of envelope.documents) {
    if (options.category && document.category !== options.category) {
      continue;
    }

    const chunk = document.chunks.find((candidate) => predicate(candidate.content));

    if (chunk) {
      return { chunk, documentTitle: document.title };
    }
  }

  return undefined;
}

/** Cherche un fragment contenant tous les termes donnés, accents ignorés. */
export function findChunkWithAll(
  envelope: SourceEnvelope,
  terms: readonly string[],
  options: { category?: string } = {}
): ChunkMatch | undefined {
  const normalizedTerms = terms.map((term) => normalize(term));

  return findChunk(
    envelope,
    (content) => {
      const normalizedContent = normalize(content);
      return normalizedTerms.every((term) => normalizedContent.includes(term));
    },
    options
  );
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function referenceFrom(match: ChunkMatch, excerptLength = 300): StrictSourceReference {
  return {
    documentId: match.chunk.documentId,
    documentTitle: match.documentTitle,
    pageStart: match.chunk.pageStart,
    pageEnd: match.chunk.pageEnd,
    chunkIds: [match.chunk.chunkId],
    excerpt: match.chunk.content.slice(0, excerptLength).trim(),
    excerptHash: match.chunk.contentHash
  };
}

/**
 * Référence sur un terme, ou `undefined` si le corpus ne le documente pas.
 * Les fixtures s'en servent pour *omettre* un élément plutôt que l'inventer.
 */
export function referenceForTerms(
  envelope: SourceEnvelope,
  terms: readonly string[],
  options: { category?: string } = {}
): StrictSourceReference | undefined {
  const match = findChunkWithAll(envelope, terms, options);
  return match ? referenceFrom(match) : undefined;
}

/**
 * Référence couvrant plusieurs fragments d'un même document.
 *
 * Une règle comptable s'étale souvent sur deux fragments voisins — le compte
 * crédité dans l'un, le compte débité dans l'autre. Plutôt que de n'en citer
 * qu'un, on cite les deux et on élargit l'intervalle de pages en conséquence.
 * Renvoie `undefined` si un seul des termes reste introuvable : une citation
 * partielle serait trompeuse.
 */
export function referenceSpanningTerms(
  envelope: SourceEnvelope,
  terms: readonly string[],
  options: { category?: string } = {}
): StrictSourceReference | undefined {
  for (const document of envelope.documents) {
    if (options.category && document.category !== options.category) {
      continue;
    }

    const matched = new Map<string, EnvelopeChunk>();

    for (const term of terms) {
      const normalizedTerm = normalize(term);
      const chunk = document.chunks.find((candidate) =>
        normalize(candidate.content).includes(normalizedTerm)
      );

      if (!chunk) {
        break;
      }

      matched.set(chunk.chunkId, chunk);
    }

    // Tous les termes doivent avoir été trouvés dans CE document.
    const allFound = terms.every((term) =>
      [...matched.values()].some((chunk) => normalize(chunk.content).includes(normalize(term)))
    );

    if (!allFound || matched.size === 0) {
      continue;
    }

    const chunks = [...matched.values()].sort((left, right) => left.pageStart - right.pageStart);
    const first = chunks[0];

    return {
      documentId: document.documentId,
      documentTitle: document.title,
      pageStart: Math.min(...chunks.map((chunk) => chunk.pageStart)),
      pageEnd: Math.max(...chunks.map((chunk) => chunk.pageEnd)),
      chunkIds: chunks.map((chunk) => chunk.chunkId),
      excerpt: first.content.slice(0, 300).trim(),
      excerptHash: first.contentHash
    };
  }

  return undefined;
}
