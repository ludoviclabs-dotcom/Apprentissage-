import { z } from "zod";

/**
 * Machine à états éditoriale de la fabrique pédagogique.
 *
 * `published` n'existe pas : la publication est hors périmètre de ce lot, et
 * l'absence de l'état rend la fuite d'un brouillon vers le site public
 * structurellement impossible plutôt que simplement interdite.
 */
export const contentDraftStatuses = [
  "draft",
  "validation_failed",
  "needs_review",
  "approved",
  "rejected"
] as const;

export type ContentDraftStatus = (typeof contentDraftStatuses)[number];

export const contentDraftStatusSchema = z.enum(contentDraftStatuses);

/**
 * Transitions autorisées. Toute transition absente de cette table est refusée
 * par `assertTransition`, y compris une transition vers soi-même : ré-écrire le
 * statut courant masquerait une action qui n'a rien changé.
 *
 * - `approved` est terminal dans ce lot : un contenu approuvé ne se modifie plus
 *   sans créer une nouvelle révision (voir `reviseApproved` côté repository).
 * - `rejected` retourne à `draft` pour être retravaillé, jamais directement à
 *   `approved` : un refus doit être suivi d'une nouvelle validation.
 */
export const allowedTransitions: Record<ContentDraftStatus, readonly ContentDraftStatus[]> = {
  draft: ["validation_failed", "needs_review"],
  validation_failed: ["draft"],
  needs_review: ["approved", "rejected"],
  approved: [],
  rejected: ["draft"]
};

export function canTransition(from: ContentDraftStatus, to: ContentDraftStatus): boolean {
  return allowedTransitions[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: ContentDraftStatus,
    readonly to: ContentDraftStatus
  ) {
    const allowed = allowedTransitions[from];
    super(
      `Transition interdite : « ${from} » → « ${to} ». ` +
        (allowed.length > 0
          ? `Depuis « ${from} », seules ces transitions sont possibles : ${allowed.join(", ")}.`
          : `« ${from} » est un état terminal.`)
    );
    this.name = "InvalidTransitionError";
  }
}

/** Lève plutôt que de retourner un booléen : un appelant ne peut pas l'ignorer. */
export function assertTransition(from: ContentDraftStatus, to: ContentDraftStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

/** Un contenu approuvé ne peut pas être écrasé ; il est révisé. */
export function isTerminal(status: ContentDraftStatus): boolean {
  return allowedTransitions[status].length === 0;
}

export const statusTransitionSchema = z.object({
  fromStatus: contentDraftStatusSchema.nullable(),
  toStatus: contentDraftStatusSchema,
  occurredAt: z.string().min(1),
  /** Compte humain, ou origine machine (`cli:generate`, `validator`). */
  actor: z.string().min(1),
  comment: z.string().max(2000).optional()
});

export type StatusTransition = z.infer<typeof statusTransitionSchema>;
