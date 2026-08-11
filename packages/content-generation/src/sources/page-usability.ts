import { z } from "zod";

/**
 * Ce que le texte extrait d'une page vaut comme source pédagogique.
 *
 * LE PROBLÈME N'EST PAS L'ABSENCE DE TEXTE, C'EST LE TEXTE QUI MENT. Une page
 * dont l'extraction est vide se voit : le validateur la signale déjà. Une page
 * dont la couche texte porte un contenu que la page n'affiche pas ne se voit
 * pas — et c'est le cas de la page 9 de la mise en situation « Les titres »,
 * dont le texte extrait contient un tableau de dépréciations rempli là où la
 * page montre une grille vide. Un contenu produit depuis ce texte citerait un
 * corrigé invisible comme s'il s'agissait de l'énoncé.
 *
 * D'où une classification plutôt qu'un booléen : « inutilisable » et
 * « utilisable seulement pour ses parties fiables » appellent des conduites
 * différentes, et un drapeau opaque les confondrait.
 */
export const sourceTextUsabilities = ["reliable", "visual_required", "mixed", "unusable"] as const;

export type SourceTextUsability = (typeof sourceTextUsabilities)[number];

export const pageUsabilitySchema = z.object({
  documentId: z.string().min(1),
  pageNumber: z.number().int().min(1),
  usability: z.enum(sourceTextUsabilities),
  /** Pourquoi cette page est classée ainsi — jamais un verdict sans motif. */
  reason: z.string().min(1)
});

export type PageUsability = z.infer<typeof pageUsabilitySchema>;

export const pageUsabilityMapSchema = z.object({
  pack: z.string().min(1),
  pages: z.array(pageUsabilitySchema)
});

export type PageUsabilityMap = z.infer<typeof pageUsabilityMapSchema>;

/** Le refus opposé à un chunk tiré d'une page dont le texte ne fait pas foi. */
export const UNRELIABLE_TEXT_SOURCE = "unreliable-text-source";

export class UnreliableTextSourceError extends Error {
  readonly code = UNRELIABLE_TEXT_SOURCE;

  constructor(
    readonly documentId: string,
    readonly pageNumber: number,
    readonly usability: SourceTextUsability,
    reason: string
  ) {
    super(
      `le texte de la page ${pageNumber} de « ${documentId} » est classé « ${usability} » : ${reason}. Une annotation visuelle approuvée est requise.`
    );
    this.name = "UnreliableTextSourceError";
  }
}

function key(documentId: string, pageNumber: number): string {
  return `${documentId}:${pageNumber}`;
}

export function indexUsability(map: PageUsabilityMap): Map<string, PageUsability> {
  return new Map(map.pages.map((page) => [key(page.documentId, page.pageNumber), page]));
}

/**
 * Le classement d'une page.
 *
 * Une page absente de la carte est `reliable`. Le défaut est délibéré : la
 * quasi-totalité des pages le sont, et exiger une déclaration pour chacune
 * ferait de la carte un inventaire à maintenir plutôt qu'une liste
 * d'exceptions constatées.
 */
export function usabilityOf(
  index: ReadonlyMap<string, PageUsability>,
  documentId: string,
  pageNumber: number
): SourceTextUsability {
  return index.get(key(documentId, pageNumber))?.usability ?? "reliable";
}

/** `true` quand le texte de la page peut étayer un contenu tel quel. */
export function isTextUsable(usability: SourceTextUsability): boolean {
  return usability === "reliable";
}

/**
 * `true` quand la page ne peut entrer que par une annotation visuelle
 * approuvée. `mixed` en fait partie : ses portions fiables ne sont pas
 * identifiées au niveau du chunk, et prétendre le contraire rouvrirait la porte
 * qu'on vient de fermer.
 */
export function requiresApprovedAnnotation(usability: SourceTextUsability): boolean {
  return usability === "visual_required" || usability === "unusable" || usability === "mixed";
}

export function assertTextChunkUsable(
  index: ReadonlyMap<string, PageUsability>,
  documentId: string,
  pageNumber: number
): void {
  const entry = index.get(key(documentId, pageNumber));

  if (entry && !isTextUsable(entry.usability)) {
    throw new UnreliableTextSourceError(documentId, pageNumber, entry.usability, entry.reason);
  }
}

/** Le refus opposé à une génération qui exige une carte et n'en a pas. */
export const PAGE_USABILITY_MAP_REQUIRED = "page-usability-map-required";
/** Le refus opposé à une carte illisible ou malformée. */
export const PAGE_USABILITY_MAP_INVALID = "page-usability-map-invalid";
/** Le refus opposé à une enveloppe construite sans la carte qu'elle exige. */
export const PAGE_USABILITY_MAP_NOT_APPLIED = "page-usability-map-not-applied";

export class PageUsabilityMapRequiredError extends Error {
  readonly code = PAGE_USABILITY_MAP_REQUIRED;

  constructor(
    readonly chapterSlug: string,
    readonly expectedPath: string
  ) {
    super(
      `le chapitre « ${chapterSlug} » comporte des pages dont l'extraction est dégradée : une carte de fiabilité est obligatoire, et elle est introuvable (${expectedPath}). Un fichier absent ne vaut pas « toutes les pages sont fiables ».`
    );
    this.name = "PageUsabilityMapRequiredError";
  }
}

export class PageUsabilityMapInvalidError extends Error {
  readonly code = PAGE_USABILITY_MAP_INVALID;

  constructor(
    readonly chapterSlug: string,
    readonly detail: string
  ) {
    super(`la carte de fiabilité du chapitre « ${chapterSlug} » est inexploitable : ${detail}`);
    this.name = "PageUsabilityMapInvalidError";
  }
}

export class PageUsabilityMapNotAppliedError extends Error {
  readonly code = PAGE_USABILITY_MAP_NOT_APPLIED;

  constructor(readonly chapterSlug: string) {
    super(
      `l'enveloppe du chapitre « ${chapterSlug} » est construite sans carte de fiabilité alors que son corpus en exige une : la construction est refusée plutôt que de laisser passer le texte d'une page non vérifiée.`
    );
    this.name = "PageUsabilityMapNotAppliedError";
  }
}

/**
 * Le nom de fichier d'une carte. UN SEUL ENDROIT LE CONNAÎT.
 *
 * Le dupliquer dans le CLI, dans un test et dans un script suffirait à ce que
 * l'un des trois cherche au mauvais endroit le jour où la convention change, et
 * conclue « pas de carte » — c'est-à-dire « tout est fiable ».
 */
export function pageUsabilityFileName(chapterSlug: string): string {
  return `${chapterSlug}-page-usability.json`;
}

/**
 * Un chapitre exige-t-il une carte ?
 *
 * LA RÉPONSE VIENT DU CORPUS, PAS D'UNE LISTE. Inscrire « les-titres » dans une
 * constante aurait marché aujourd'hui et raté le prochain chapitre dont
 * l'extraction se dégrade. Le critère est celui que l'ingestion établit
 * elle-même : dès qu'une page d'un document du chapitre est marquée dégradée,
 * son texte ne peut plus être présumé fidèle, et le classement devient
 * obligatoire.
 *
 * Les chapitres dont l'extraction est intacte n'ont donc rien à déclarer et
 * continuent de fonctionner comme avant.
 */
export function requiresPageUsabilityMap(
  documents: ReadonlyArray<{ pages: ReadonlyArray<{ degraded: boolean }> }>
): boolean {
  return documents.some((document) => document.pages.some((page) => page.degraded));
}

/** Nature d'un fait retenu par une génération : d'où il tire son autorité. */
export const factOrigins = ["TEXT_SOURCE", "APPROVED_VISUAL_SOURCE"] as const;

export type FactOrigin = (typeof factOrigins)[number];
