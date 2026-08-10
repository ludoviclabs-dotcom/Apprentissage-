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

/** Nature d'un fait retenu par une génération : d'où il tire son autorité. */
export const factOrigins = ["TEXT_SOURCE", "APPROVED_VISUAL_SOURCE"] as const;

export type FactOrigin = (typeof factOrigins)[number];
