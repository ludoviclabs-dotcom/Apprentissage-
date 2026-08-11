import { z } from "zod";

/**
 * Le périmètre éditorial d'une génération.
 *
 * UNE SOURCE PEUT ÊTRE FIABLE ET POURTANT HORS SUJET. C'est le cas de la page 8
 * de la mise en situation « Les titres » : son extraction a été confrontée au
 * rendu, elle est exacte — et elle appartient au cas « Chez Popeye », dont les
 * sources visuelles attendent encore une décision humaine. La garde de
 * fiabilité la laisse passer, à juste titre ; c'est une autre contrainte qui
 * doit l'écarter.
 *
 * Confondre les deux aurait un coût précis : classer la page 8 en
 * `visual_required` pour s'en débarrasser reviendrait à écrire dans le corpus
 * qu'elle n'est pas fiable, ce qui est faux, et à perdre l'information le jour
 * où le cas rentrera dans le périmètre.
 */

export const editorialScopeExclusionSchema = z
  .object({
    id: z.string().min(1),
    reason: z.string().min(1),
    /** Le cas d'espèce écarté, quand l'exclusion en désigne un. */
    caseLabel: z.string().min(1).optional(),
    documentIds: z.array(z.string().min(1)).default([]),
    /** Pages exclues, par document. Clé : identifiant de document. */
    pages: z.record(z.string(), z.array(z.number().int().min(1))).default({}),
    /** Le plus précis : des chunks nommés, quand on les connaît. */
    chunkIds: z.array(z.string().min(1)).default([]),
    /** Annotations visuelles écartées, même approuvées. */
    annotationIds: z.array(z.string().min(1)).default([])
  })
  .refine(
    (exclusion) =>
      exclusion.documentIds.length > 0 ||
      Object.keys(exclusion.pages).length > 0 ||
      exclusion.chunkIds.length > 0 ||
      exclusion.annotationIds.length > 0,
    { message: "une exclusion qui ne désigne rien n'exclut rien : préciser documents, pages, chunks ou annotations" }
  );

export type EditorialScopeExclusion = z.infer<typeof editorialScopeExclusionSchema>;

export const editorialScopeSchema = z.object({
  chapterSlug: z.string().min(1),
  scopeLabel: z.string().min(1),
  exclusions: z.array(editorialScopeExclusionSchema)
});

export type EditorialScope = z.infer<typeof editorialScopeSchema>;

/** Le refus opposé à un contenu qui cite une source hors périmètre. */
export const EXCLUDED_EDITORIAL_SCOPE_CONSUMED = "excluded-editorial-scope-consumed";

export interface ScopeViolation {
  exclusionId: string;
  caseLabel?: string;
  reason: string;
  documentId?: string;
  pageNumber?: number;
  chunkId?: string;
  annotationId?: string;
}

export class ExcludedEditorialScopeError extends Error {
  readonly code = EXCLUDED_EDITORIAL_SCOPE_CONSUMED;

  constructor(readonly violations: readonly ScopeViolation[]) {
    super(
      `des sources hors périmètre éditorial ont été citées : ${violations
        .map(
          (violation) =>
            `${violation.chunkId ?? violation.annotationId ?? `${violation.documentId}:p${violation.pageNumber}`} — ${violation.caseLabel ?? violation.exclusionId} (${violation.reason})`
        )
        .slice(0, 8)
        .join(" | ")}`
    );
    this.name = "ExcludedEditorialScopeError";
  }
}

export interface ScopeCandidate {
  documentId?: string;
  pageStart?: number;
  pageEnd?: number;
  chunkId?: string;
  annotationId?: string;
}

/**
 * L'exclusion qui frappe un candidat, s'il y en a une.
 *
 * L'ordre des tests va du plus précis au plus large : un chunk nommé, une
 * annotation nommée, puis une page, puis un document entier. Un contrôle qui
 * s'arrêterait au document exclurait des pages qu'on voulait garder ; un
 * contrôle qui ne regarderait que les chunks laisserait passer une page dont
 * les chunks n'ont pas été énumérés.
 */
export function findScopeViolation(
  exclusions: readonly EditorialScopeExclusion[],
  candidate: ScopeCandidate
): ScopeViolation | undefined {
  for (const exclusion of exclusions) {
    const base = { exclusionId: exclusion.id, caseLabel: exclusion.caseLabel, reason: exclusion.reason };

    if (candidate.chunkId && exclusion.chunkIds.includes(candidate.chunkId)) {
      return { ...base, chunkId: candidate.chunkId, documentId: candidate.documentId };
    }

    if (candidate.annotationId && exclusion.annotationIds.includes(candidate.annotationId)) {
      return { ...base, annotationId: candidate.annotationId };
    }

    if (!candidate.documentId) {
      continue;
    }

    const pages = exclusion.pages[candidate.documentId];

    if (pages && candidate.pageStart !== undefined) {
      const end = candidate.pageEnd ?? candidate.pageStart;

      for (let page = candidate.pageStart; page <= end; page += 1) {
        if (pages.includes(page)) {
          return { ...base, documentId: candidate.documentId, pageNumber: page, chunkId: candidate.chunkId };
        }
      }
    }

    // Un document exclu en entier n'a pas besoin d'énumérer ses pages.
    if (exclusion.documentIds.includes(candidate.documentId) && !pages) {
      return { ...base, documentId: candidate.documentId, chunkId: candidate.chunkId };
    }
  }

  return undefined;
}

export function isWithinScope(
  exclusions: readonly EditorialScopeExclusion[],
  candidate: ScopeCandidate
): boolean {
  return findScopeViolation(exclusions, candidate) === undefined;
}

/**
 * Second verrou : les références d'un contenu déjà rédigé.
 *
 * Le filtrage de l'enveloppe empêche une source exclue d'atteindre le
 * générateur. Il n'empêche rien du tout quand la charge utile est écrite à la
 * main : rien n'oblige un rédacteur à ne citer que ce que l'enveloppe contenait.
 * Ce contrôle-ci ferme cette porte, et il lève plutôt que de signaler — un
 * avertissement laisserait le contenu s'écrire.
 */
export function assertReferencesWithinScope(
  exclusions: readonly EditorialScopeExclusion[],
  references: ReadonlyArray<{
    documentId: string;
    pageStart: number;
    pageEnd: number;
    chunkIds: readonly string[];
  }>
): void {
  if (exclusions.length === 0) {
    return;
  }

  const violations: ScopeViolation[] = [];

  for (const reference of references) {
    for (const chunkId of reference.chunkIds.length > 0 ? reference.chunkIds : [undefined]) {
      const violation = findScopeViolation(exclusions, {
        documentId: reference.documentId,
        pageStart: reference.pageStart,
        pageEnd: reference.pageEnd,
        chunkId
      });

      if (violation) {
        violations.push(violation);
      }
    }
  }

  if (violations.length > 0) {
    throw new ExcludedEditorialScopeError(violations);
  }
}
