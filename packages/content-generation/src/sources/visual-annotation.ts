import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Les annotations de sources visuelles, et la seule porte par laquelle elles
 * peuvent entrer dans une génération.
 *
 * UNE PAGE RASTÉRISÉE N'EST PAS UNE SOURCE. Le pipeline lit du texte extrait ;
 * quand l'information n'existe qu'en image, ce texte ne la porte pas, et rien
 * dans la chaîne ne s'en aperçoit — le générateur produit un énoncé amputé sans
 * qu'aucun contrôle ne proteste. L'annotation comble ce trou, mais seulement
 * une fois qu'une personne a confronté la transcription à l'image.
 *
 * PIRE QUE L'ABSENCE : LE TEXTE QUI MENT. La page 9 de la mise en situation
 * « Les titres » porte, dans la couche texte du PDF, un tableau de dépréciations
 * rempli — que la page affichée laisse vide. Le corrigé est là, invisible. Un
 * contenu produit depuis ce texte citerait une couche de réponses comme si
 * c'était l'énoncé. C'est pourquoi une page marquée comme divergente ne peut pas
 * être citée sur la foi de son texte : il faut une annotation approuvée, ou
 * rien.
 */

export const annotationReviewStatuses = ["draft", "needs_human_review", "approved", "rejected"] as const;

export type AnnotationReviewStatus = (typeof annotationReviewStatuses)[number];

/**
 * Les transitions permises, énoncées par ce qui est autorisé.
 *
 * `approved` n'a aucune sortie : une annotation approuvée est signée. Corriger
 * après coup reviendrait à déplacer ce qu'une personne a certifié — c'est la
 * même règle que pour un contenu approuvé dans `content-review`, et pour la
 * même raison. Une correction passe par une nouvelle révision, jamais par une
 * réécriture silencieuse.
 *
 * `rejected → needs_human_review` existe parce qu'un rejet porte sur une
 * transcription, pas sur la page : corriger la transcription et la re-soumettre
 * est le déroulement normal.
 */
const ANNOTATION_TRANSITIONS: Record<AnnotationReviewStatus, readonly AnnotationReviewStatus[]> = {
  draft: ["needs_human_review"],
  needs_human_review: ["approved", "rejected"],
  rejected: ["needs_human_review"],
  approved: []
};

export class InvalidAnnotationTransitionError extends Error {
  constructor(
    readonly from: AnnotationReviewStatus,
    readonly to: AnnotationReviewStatus
  ) {
    super(
      from === "approved"
        ? `« ${from} » est un état signé : une annotation approuvée ne se modifie pas, elle se remplace par une nouvelle révision`
        : `transition « ${from} » → « ${to} » interdite`
    );
    this.name = "InvalidAnnotationTransitionError";
  }
}

export function canTransitionAnnotation(
  from: AnnotationReviewStatus,
  to: AnnotationReviewStatus
): boolean {
  return ANNOTATION_TRANSITIONS[from].includes(to);
}

/**
 * Comment la transcription a été obtenue.
 *
 * `ocr-approved` n'existe pas et n'existera pas : une machine qui lit une image
 * produit une proposition, jamais une source. Le seul chemin par lequel un OCR
 * entre ici est `ocr-assisted-visual-verified`, qui affirme qu'une personne a
 * regardé l'image et confirmé.
 */
export const transcriptionMethods = ["visual", "ocr-assisted-visual-verified", "manual"] as const;

export type TranscriptionMethod = (typeof transcriptionMethods)[number];

export const structuredFactSchema = z.object({
  factId: z.string().min(1),
  label: z.string().min(1),
  value: z.union([z.string(), z.number()]),
  unit: z.string().nullable(),
  context: z.string(),
  sourceRegion: z.string(),
  confidence: z.enum(["high", "medium", "low"])
});

export type StructuredFact = z.infer<typeof structuredFactSchema>;

export const visualAnnotationSchema = z.object({
  annotationId: z.string().min(1),
  documentId: z.string().min(1),
  pageNumber: z.number().int().min(1),
  /** Empreinte du rendu sur lequel la transcription a été relue. */
  pageImageHash: z.string().regex(/^[a-f0-9]{64}$/, "SHA-256 hexadécimal attendu").nullable(),
  regionId: z.string().min(1),
  annotationType: z.string().min(1),
  expectedInformation: z.string(),
  transcription: z.string().nullable(),
  structuredFacts: z.array(structuredFactSchema),
  confidence: z.enum(["high", "medium", "low"]).nullable(),
  transcriptionMethod: z.enum(transcriptionMethods).nullable(),
  reviewStatus: z.enum(annotationReviewStatuses),
  priority: z.enum(["BLOCKING", "USEFUL", "OPTIONAL"]),
  warnings: z.array(z.string()).default([]),
  createdAt: z.string().min(1),
  /** Qui a signé, quand, et sur quelle image. Absents tant que nul n'a décidé. */
  reviewedBy: z.string().min(1).optional(),
  reviewedAt: z.string().min(1).optional(),
  reviewReason: z.string().optional(),
  /**
   * L'empreinte du rendu au moment exact de la décision. Elle double
   * `pageImageHash` volontairement : celui-ci décrit l'annotation, celle-là
   * atteste ce que la personne avait sous les yeux. Les faire diverger est
   * précisément ce que la détection d'obsolescence cherche.
   */
  reviewedImageHash: z.string().regex(/^[a-f0-9]{64}$/).optional()
})
  // LES CHAMPS INCONNUS SONT CONSERVÉS. Une annotation porte, selon son type,
  // un arbre de décision, un tableau ou un verdict de complétude — que ce
  // schéma n'a pas à connaître. Les retirer au passage transformerait chaque
  // écriture en perte de travail de transcription.
  .passthrough();

export type VisualAnnotation = z.infer<typeof visualAnnotationSchema>;

export const visualAnnotationPlanSchema = z.object({
  chapter: z.string().min(1),
  imageDirectory: z.string().min(1),
  annotations: z.array(visualAnnotationSchema)
});

export type VisualAnnotationPlan = z.infer<typeof visualAnnotationPlanSchema>;

/** Le refus opposé à une génération qui réclame une annotation non approuvée. */
export const VISUAL_ANNOTATION_NOT_APPROVED = "visual-source-annotation-not-approved";
/** Le refus opposé à une annotation dont le rendu a changé sous elle. */
export const VISUAL_ANNOTATION_STALE_IMAGE = "visual-source-annotation-stale-image";

export class VisualAnnotationNotApprovedError extends Error {
  readonly code = VISUAL_ANNOTATION_NOT_APPROVED;

  constructor(
    readonly annotationId: string,
    readonly reviewStatus: AnnotationReviewStatus
  ) {
    super(
      `l'annotation « ${annotationId} » est en « ${reviewStatus} » : seule une annotation approuvée par une personne peut étayer un contenu`
    );
    this.name = "VisualAnnotationNotApprovedError";
  }
}

export class VisualAnnotationStaleImageError extends Error {
  readonly code = VISUAL_ANNOTATION_STALE_IMAGE;

  constructor(
    readonly annotationId: string,
    readonly expected: string | null,
    readonly actual: string
  ) {
    super(
      `l'annotation « ${annotationId} » porte sur un rendu qui n'existe plus (attendu ${expected ?? "aucun"}, trouvé ${actual}) : la transcription ne décrit plus ce qu'un relecteur verrait`
    );
    this.name = "VisualAnnotationStaleImageError";
  }
}

export function pageImageHash(image: Uint8Array): string {
  return createHash("sha256").update(image).digest("hex");
}

/**
 * Les annotations utilisables : approuvées, et rien d'autre.
 *
 * Le filtre est énoncé par ce qui est ACCEPTÉ. Écrire `!== "rejected"` aurait
 * laissé passer `needs_human_review`, c'est-à-dire l'état par défaut de toute
 * annotation — le contrat se serait inversé sans que personne l'ait décidé.
 */
export function approvedAnnotations(plan: VisualAnnotationPlan): VisualAnnotation[] {
  return plan.annotations.filter((annotation) => annotation.reviewStatus === "approved");
}

export interface AnnotationRequirement {
  documentId: string;
  pageNumber: number;
  regionId?: string;
}

/**
 * Résout les annotations exigées par un contenu, ou lève.
 *
 * Elle lève plutôt que de retourner un résultat partiel : un générateur qui
 * reçoit « voici les trois annotations sur les cinq demandées » produit un
 * contenu amputé et le déclare valide. Le refus est la seule réponse qui ne se
 * confond pas avec un succès.
 */
export function requireApprovedAnnotations(
  plan: VisualAnnotationPlan,
  requirements: readonly AnnotationRequirement[],
  renderedImageHashes?: ReadonlyMap<string, string>
): VisualAnnotation[] {
  const resolved: VisualAnnotation[] = [];

  for (const requirement of requirements) {
    const candidates = plan.annotations.filter(
      (annotation) =>
        annotation.documentId === requirement.documentId &&
        annotation.pageNumber === requirement.pageNumber &&
        (requirement.regionId === undefined || annotation.regionId === requirement.regionId)
    );

    if (candidates.length === 0) {
      throw new VisualAnnotationNotApprovedError(
        `${requirement.documentId}:p${requirement.pageNumber}${requirement.regionId ? `:${requirement.regionId}` : ""}`,
        "needs_human_review"
      );
    }

    for (const candidate of candidates) {
      if (candidate.reviewStatus !== "approved") {
        throw new VisualAnnotationNotApprovedError(candidate.annotationId, candidate.reviewStatus);
      }

      // Le rendu a-t-il bougé depuis la relecture ? Une image régénérée à une
      // autre échelle, ou un PDF source remplacé, produit une empreinte
      // différente : l'approbation ne porte plus sur ce qui serait affiché.
      const actual = renderedImageHashes?.get(`${candidate.documentId}:${candidate.pageNumber}`);

      if (actual !== undefined && actual !== candidate.pageImageHash) {
        throw new VisualAnnotationStaleImageError(candidate.annotationId, candidate.pageImageHash, actual);
      }

      resolved.push(candidate);
    }
  }

  return resolved;
}

/**
 * Les faits d'une annotation approuvée, prêts à étayer un contenu.
 *
 * Chaque fait garde sa provenance — annotation, page, région — pour qu'un
 * contenu généré puisse citer d'où vient sa donnée, comme il le fait déjà pour
 * une référence textuelle.
 */
export interface AttributedFact extends StructuredFact {
  annotationId: string;
  documentId: string;
  pageNumber: number;
  pageImageHash: string | null;
}

/** Longueur minimale d'un motif de rejet, alignée sur `content-review`. */
export const MINIMUM_REJECTION_REASON_LENGTH = 10;

export class AnnotationDecisionRefusedError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "AnnotationDecisionRefusedError";
  }
}

export interface AnnotationTransitionInput {
  annotation: VisualAnnotation;
  to: AnnotationReviewStatus;
  /** Vient de la couche d'authentification, jamais d'un champ de formulaire. */
  actor: string;
  occurredAt: string;
  reason?: string;
  /** Empreinte du rendu tel qu'il existe à l'instant de la décision. */
  renderedImageHash?: string;
}

/**
 * Applique une décision humaine à une annotation.
 *
 * Les gardes sont celles de l'approbation de contenu, transposées : on refuse
 * plutôt que de laisser passer un doute. Approuver une transcription dont
 * l'image a changé certifierait quelque chose que personne n'a vu.
 */
export function applyAnnotationTransition(input: AnnotationTransitionInput): VisualAnnotation {
  const from = input.annotation.reviewStatus;

  if (!canTransitionAnnotation(from, input.to)) {
    throw new InvalidAnnotationTransitionError(from, input.to);
  }

  if (input.to === "rejected") {
    const reason = input.reason?.trim() ?? "";

    if (reason.length < MINIMUM_REJECTION_REASON_LENGTH) {
      throw new AnnotationDecisionRefusedError(
        "motif-insuffisant",
        `un rejet sans motif est inexploitable pour qui reprendra l'annotation : ${MINIMUM_REJECTION_REASON_LENGTH} caractères au minimum`
      );
    }
  }

  if (input.to === "approved") {
    if (!input.annotation.pageImageHash) {
      throw new AnnotationDecisionRefusedError(
        "empreinte-absente",
        "cette annotation ne porte aucune empreinte de rendu : rien ne permet d'établir sur quelle image elle a été relue"
      );
    }

    // Ne pas pouvoir vérifier n'est pas vérifier : sans empreinte courante, on
    // refuse, comme l'approbation de contenu refuse un corpus absent.
    if (input.renderedImageHash === undefined) {
      throw new AnnotationDecisionRefusedError(
        "rendu-introuvable",
        "le rendu de cette page est introuvable : la transcription ne peut pas être confrontée à l'image"
      );
    }

    if (input.renderedImageHash !== input.annotation.pageImageHash) {
      throw new AnnotationDecisionRefusedError(
        VISUAL_ANNOTATION_STALE_IMAGE,
        "la source visuelle a changé depuis la transcription : une nouvelle revue est requise"
      );
    }
  }

  return visualAnnotationSchema.parse({
    ...input.annotation,
    reviewStatus: input.to,
    reviewedBy: input.actor,
    reviewedAt: input.occurredAt,
    ...(input.reason ? { reviewReason: input.reason.trim() } : {}),
    ...(input.to === "approved" ? { reviewedImageHash: input.annotation.pageImageHash ?? undefined } : {})
  });
}

/**
 * Modifie une annotation avant décision.
 *
 * Ce que la correction ne touche pas est aussi important que ce qu'elle touche :
 * ni `pageImageHash`, ni la page, ni l'identifiant. Corriger une transcription
 * est légitime ; déplacer la source sous elle ne l'est pas.
 *
 * `confidence` n'est jamais relevée d'office : une transcription incertaine le
 * reste tant qu'une personne ne dit pas le contraire.
 */
export function correctAnnotation(
  annotation: VisualAnnotation,
  changes: Partial<Pick<VisualAnnotation, "transcription" | "structuredFacts" | "confidence">>
): VisualAnnotation {
  if (annotation.reviewStatus === "approved") {
    throw new InvalidAnnotationTransitionError("approved", "needs_human_review");
  }

  return visualAnnotationSchema.parse({ ...annotation, ...changes });
}

/** Le refus opposé à une provenance visuelle qui désigne une annotation inconnue. */
export const VISUAL_ANNOTATION_UNKNOWN = "visual-source-annotation-unknown";
/** Le refus opposé à une provenance visuelle qu'aucun magasin ne permet de vérifier. */
export const VISUAL_ANNOTATION_UNVERIFIABLE = "visual-source-annotation-unverifiable";

export type VisualBackingRefusal =
  | typeof VISUAL_ANNOTATION_NOT_APPROVED
  | typeof VISUAL_ANNOTATION_STALE_IMAGE
  | typeof VISUAL_ANNOTATION_UNKNOWN
  | typeof VISUAL_ANNOTATION_UNVERIFIABLE;

export type VisualBackingResult =
  | { backed: true }
  | { backed: false; code: VisualBackingRefusal; message: string };

export interface VisualBackingInput {
  /** Les annotations que la référence invoque pour cette page. */
  annotationIds: readonly string[];
  documentId: string;
  pageNumber: number;
  /**
   * Le magasin d'annotations. `undefined` quand il n'a pas été chargé — et
   * c'est un refus, jamais un succès : invoquer une transcription qu'on ne
   * peut pas produire ne vaut pas mieux que ne rien invoquer.
   */
  annotations: readonly VisualAnnotation[] | undefined;
  /** Empreintes des rendus courants, quand on en dispose (`documentId:page`). */
  renderedImageHashes?: ReadonlyMap<string, string>;
}

/**
 * Une page dont le texte ne fait pas foi est-elle couverte par une annotation
 * visuelle réellement signée ?
 *
 * C'EST LA SEULE PORTE, ET ELLE EST FERMÉE PAR DÉFAUT. Quatre refus distincts
 * plutôt qu'un booléen : « aucune annotation ne porte ce nom », « elle n'est pas
 * approuvée », « elle décrit un rendu qui n'existe plus » et « rien ici ne
 * permet de le vérifier » appellent des corrections différentes, et les
 * confondre ferait relire la mauvaise chose.
 *
 * L'obsolescence se constate de deux façons, et les deux comptent. Le magasin
 * peut fournir l'empreinte du rendu courant : elle doit correspondre. À défaut,
 * l'annotation se contredit elle-même quand la signature (`reviewedImageHash`)
 * ne porte pas sur l'image qu'elle décrit (`pageImageHash`) — cette
 * vérification-là ne demande aucune image et reste donc toujours possible.
 */
export function verifyVisualBacking(input: VisualBackingInput): VisualBackingResult {
  if (input.annotationIds.length === 0) {
    return {
      backed: false,
      code: VISUAL_ANNOTATION_UNKNOWN,
      message: `aucune annotation visuelle n'est invoquée pour la page ${input.pageNumber} de « ${input.documentId} »`
    };
  }

  if (!input.annotations) {
    return {
      backed: false,
      code: VISUAL_ANNOTATION_UNVERIFIABLE,
      message:
        `la référence invoque une source visuelle approuvée pour la page ${input.pageNumber} de ` +
        `« ${input.documentId} », mais aucun magasin d'annotations n'est disponible : la provenance ne peut pas être établie`
    };
  }

  for (const annotationId of input.annotationIds) {
    const annotation = input.annotations.find((candidate) => candidate.annotationId === annotationId);

    if (!annotation) {
      return {
        backed: false,
        code: VISUAL_ANNOTATION_UNKNOWN,
        message: `l'annotation « ${annotationId} » n'existe pas dans le magasin`
      };
    }

    // La page annoncée doit être celle qui est couverte : une annotation
    // approuvée sur une autre page ne dit rien de celle-ci.
    if (annotation.documentId !== input.documentId || annotation.pageNumber !== input.pageNumber) {
      return {
        backed: false,
        code: VISUAL_ANNOTATION_UNKNOWN,
        message:
          `l'annotation « ${annotationId} » porte sur la page ${annotation.pageNumber} de ` +
          `« ${annotation.documentId} », pas sur la page ${input.pageNumber} de « ${input.documentId} »`
      };
    }

    if (annotation.reviewStatus !== "approved") {
      return {
        backed: false,
        code: VISUAL_ANNOTATION_NOT_APPROVED,
        message: new VisualAnnotationNotApprovedError(annotationId, annotation.reviewStatus).message
      };
    }

    const rendered = input.renderedImageHashes?.get(`${annotation.documentId}:${annotation.pageNumber}`);

    if (rendered !== undefined && rendered !== annotation.pageImageHash) {
      return {
        backed: false,
        code: VISUAL_ANNOTATION_STALE_IMAGE,
        message: new VisualAnnotationStaleImageError(annotationId, annotation.pageImageHash, rendered).message
      };
    }

    if (annotation.reviewedImageHash !== annotation.pageImageHash) {
      return {
        backed: false,
        code: VISUAL_ANNOTATION_STALE_IMAGE,
        message:
          `l'annotation « ${annotationId} » a été signée sur un rendu (${annotation.reviewedImageHash ?? "aucun"}) ` +
          `qui n'est pas celui qu'elle décrit (${annotation.pageImageHash ?? "aucun"}) : la signature ne porte plus sur cette transcription`
      };
    }
  }

  return { backed: true };
}

export function factsOf(annotations: readonly VisualAnnotation[]): AttributedFact[] {
  return annotations.flatMap((annotation) =>
    annotation.structuredFacts.map((fact) => ({
      ...fact,
      annotationId: annotation.annotationId,
      documentId: annotation.documentId,
      pageNumber: annotation.pageNumber,
      pageImageHash: annotation.pageImageHash
    }))
  );
}
