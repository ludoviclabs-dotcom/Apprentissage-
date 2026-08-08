import { z } from "zod";

/**
 * Contexte normatif d'un contenu pédagogique.
 *
 * IL RÉPOND À UNE SEULE QUESTION : « selon quel référentiel ce contenu est-il
 * vrai ? » Un plan comptable n'est pas une vérité intemporelle, c'est un texte
 * daté. Le support d'origine du chapitre « Emprunts obligataires » enregistre
 * les frais d'émission étalés par 4816, les vire par 791 et les amortit par
 * 6812 ; le PCG au 1er janvier 2026 les enregistre par 481 et les amortit par
 * 6862, sans aucun passage par un compte 79. Les deux traitements sont
 * cohérents — chacun dans son millésime. Ce qui ne l'est pas, c'est de les
 * additionner, ou de noter un apprenant d'aujourd'hui sur celui d'hier.
 *
 * L'OBJET EST PORTÉ PAR L'ENVELOPPE, PAS PAR LE CONTENU. Un contexte normatif
 * ne se rédige pas : il se constate en lisant les comptes employés, puis il est
 * décidé à la revue. Le placer dans `content` en aurait fait un champ que le
 * générateur remplit — donc un champ qu'il peut se tromper à remplir, et dont
 * l'erreur passerait pour une donnée. Il vit à côté de `generationMetadata` et
 * `validationMetadata`, avec les autres constats.
 *
 * IL EST OPTIONNEL, ET IL NE LE RESTERA PAS. Les vingt-quatre brouillons du
 * pilote ont été écrits avant lui : les rendre invalides d'un coup les aurait
 * tous fait tomber en `validation_failed` sans que personne ait relu quoi que
 * ce soit. Son absence est donc tolérée — mais elle est signalée dès que le
 * contenu emploie un compte dont le traitement dépend du millésime, et le
 * classement (`classifyNormativeContext`) en propose un pour chaque brouillon.
 */

/**
 * Le référentiel selon lequel un contenu dit vrai.
 *
 * - `anc-2026-current` : le plan comptable général en vigueur au 1er janvier
 *   2026. C'est le profil du parcours public, et le seul sur lequel un
 *   apprenant est noté.
 * - `course-original` : le traitement du support d'origine, conservé
 *   fidèlement. Il a une valeur pédagogique — comprendre pourquoi la norme a
 *   changé — mais aucune valeur normative aujourd'hui.
 * - `entity-specific` : une subdivision propre à une entité ou à un exercice.
 *   Elle n'est ni juste ni fausse au regard du plan officiel : elle est locale,
 *   et doit être annoncée comme telle.
 */
export const normativeProfiles = ["anc-2026-current", "course-original", "entity-specific"] as const;

export type NormativeProfile = (typeof normativeProfiles)[number];

export const normativeProfileSchema = z.enum(normativeProfiles);

export const normativeStatuses = ["current", "legacy", "custom"] as const;

export type NormativeStatus = (typeof normativeStatuses)[number];

export const normativeStatusSchema = z.enum(normativeStatuses);

/**
 * Ce que le contenu a le droit de faire dans la progression de l'apprenant.
 *
 * - `graded` : la réponse attendue fait foi, la réussite compte.
 * - `comparison-only` : le contenu s'affiche pour comparer deux états du droit,
 *   jamais pour corriger une tentative. Aucun score n'en dépend.
 * - `not-gradable` : le contenu n'a pas de réponse attendue exploitable — une
 *   fiche, un rappel de contexte.
 */
export const scoringPolicies = ["graded", "comparison-only", "not-gradable"] as const;

export type ScoringPolicy = (typeof scoringPolicies)[number];

export const scoringPolicySchema = z.enum(scoringPolicies);

/**
 * Le statut qu'un profil implique. La table est explicite plutôt que déduite à
 * la volée : c'est elle que le validateur confronte au statut déclaré.
 */
export const STATUS_BY_PROFILE: Readonly<Record<NormativeProfile, NormativeStatus>> = {
  "anc-2026-current": "current",
  "course-original": "legacy",
  "entity-specific": "custom"
};

/**
 * Une subdivision qui n'appartient pas au plan officiel.
 *
 * `parentAccount` est obligatoire, et c'est tout l'objet de la structure : un
 * sous-compte sans compte parent déclaré est indiscernable d'un compte du plan,
 * et c'est exactement l'erreur que l'audit a relevée sur 4816 et 4671.
 */
export const customAccountDisclosureSchema = z.object({
  accountNumber: z.string().regex(/^\d{2,8}$/, "numéro de compte attendu (2 à 8 chiffres)"),
  /** Le compte officiel dont ce numéro est une subdivision. */
  parentAccount: z.string().regex(/^\d{2,8}$/, "compte parent officiel attendu (2 à 8 chiffres)"),
  /**
   * D'où vient la subdivision : du support de cours, ou du plan de comptes
   * d'une entité. La distinction décide de sa place — une subdivision du
   * support appartient au traitement historique, celle d'une entité peut
   * cohabiter avec le référentiel courant.
   */
  source: z.enum(["course", "entity-plan"]),
  label: z.string().min(2).max(200)
});

export type CustomAccountDisclosure = z.infer<typeof customAccountDisclosureSchema>;

export const versionConflictSeverities = ["info", "warning", "blocking"] as const;

export type VersionConflictSeverity = (typeof versionConflictSeverities)[number];

/**
 * Une divergence constatée entre deux états du référentiel.
 *
 * C'est une note de revue, pas un message d'interface publique : elle nomme des
 * identifiants de source et cite le raisonnement du relecteur. La projection
 * publique ne la transporte pas.
 */
export const versionConflictNoteSchema = z.object({
  code: z.string().min(1),
  severity: z.enum(versionConflictSeverities),
  message: z.string().min(1).max(2000),
  /** Documents ou versions entre lesquels la divergence a été constatée. */
  sourceIds: z.array(z.string().min(1)).default([])
});

export type VersionConflictNote = z.infer<typeof versionConflictNoteSchema>;

/**
 * Le schéma est *structurel* : il garantit la forme, pas la cohérence.
 *
 * La cohérence — un profil courant ne peut pas être `legacy`, un support
 * d'origine ne peut pas être noté — est vérifiée par `checkNormativeContext`,
 * qui la signale sous le code `normative-profile-mismatch`. La mettre en
 * `refine` ici l'aurait transformée en « objet malformé » : le relecteur aurait
 * lu un message Zod au lieu du conflit de version qu'il doit arbitrer.
 */
export const normativeContextSchema = z.object({
  profile: normativeProfileSchema,
  status: normativeStatusSchema,
  /** Début d'application du référentiel, quand il est daté (ISO). */
  effectiveFrom: z.string().min(1).optional(),
  /** Fin d'application. Renseignée sur un traitement remplacé. */
  effectiveTo: z.string().min(1).optional(),
  scoringPolicy: scoringPolicySchema,
  /**
   * Les documents ou versions de référentiel sur lesquels le contenu s'appuie.
   * Ce sont des identifiants de document du corpus, jamais des chemins.
   */
  sourceVersionIds: z.array(z.string().min(1)).default([]),
  /** Le profil qui a remplacé celui-ci, sur un contenu historique. */
  supersededByProfile: normativeProfileSchema.optional(),
  customAccountDisclosures: z.array(customAccountDisclosureSchema).default([]),
  versionConflictNotes: z.array(versionConflictNoteSchema).default([])
});

export type NormativeContext = z.infer<typeof normativeContextSchema>;

/** Le profil du parcours public : ce sur quoi un apprenant est noté aujourd'hui. */
export const DEFAULT_NORMATIVE_PROFILE: NormativeProfile = "anc-2026-current";

/** Libellés destinés aux écrans — jamais l'identifiant brut. */
export const NORMATIVE_PROFILE_LABELS: Readonly<Record<NormativeProfile, string>> = {
  "anc-2026-current": "ANC 2026 — actuel",
  "course-original": "Support d'origine — historique",
  "entity-specific": "Sous-compte propre au cas"
};

export const SCORING_POLICY_LABELS: Readonly<Record<ScoringPolicy, string>> = {
  graded: "Noté",
  "comparison-only": "Comparaison seule — jamais noté",
  "not-gradable": "Non notable"
};

export const NORMATIVE_STATUS_LABELS: Readonly<Record<NormativeStatus, string>> = {
  current: "En vigueur",
  legacy: "Historique",
  custom: "Propre à une entité ou un exercice"
};

/** Un contenu ne compte dans la progression que si sa réponse fait foi. */
export function contributesToMastery(context: NormativeContext | null | undefined): boolean {
  return (context?.scoringPolicy ?? "graded") === "graded";
}

/**
 * Le contexte d'un contenu qui n'en déclare pas.
 *
 * Tant que le champ est optionnel, un contenu muet est lu comme relevant du
 * référentiel courant : c'est le comportement qu'avait le système avant cette
 * correction, rendu explicite plutôt que laissé implicite. Le validateur, lui,
 * ne se contente pas de ce défaut dès qu'un compte versionné apparaît.
 */
export function resolveNormativeContext(context: NormativeContext | null | undefined): NormativeContext {
  return (
    context ?? {
      profile: DEFAULT_NORMATIVE_PROFILE,
      status: STATUS_BY_PROFILE[DEFAULT_NORMATIVE_PROFILE],
      scoringPolicy: "graded",
      sourceVersionIds: [],
      customAccountDisclosures: [],
      versionConflictNotes: []
    }
  );
}
