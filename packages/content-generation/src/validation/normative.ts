import { collectSourceReferences, type ContentPayload } from "../types/artifact";
import {
  STATUS_BY_PROFILE,
  type CustomAccountDisclosure,
  type NormativeContext,
  type NormativeProfile,
  type ScoringPolicy
} from "../types/normative-context";
import type { ValidationIssue } from "../types/metadata";
import { sourceMaterialKinds } from "../types/source-reference";
import {
  collectVersionedAccounts,
  distinctAccountNumbers,
  versionedAccount,
  type AccountOccurrence
} from "./normative-accounts";

/**
 * Contrôles de cohérence normative.
 *
 * LE CODE DE REFUS EST UNIQUE ET IL EST DÉLIBÉRÉ. `normative-profile-mismatch`
 * couvre tous les mélanges de référentiels — 481 avec 791, 6862 avec 6812, un
 * exercice noté sur un traitement remplacé — parce que le relecteur n'a pas
 * besoin de dix codes pour une seule question : « ce contenu dit-il vrai selon
 * un seul référentiel, et lequel ? ». Les codes distincts sont réservés à ce
 * qui n'est pas un mélange : une subdivision non déclarée, un compte officiel
 * employé sans source officielle.
 *
 * TANT QUE `normativeContext` EST ABSENT, LES RÈGLES AVERTISSENT AU LIEU DE
 * REFUSER. Les vingt-quatre brouillons du pilote ont été écrits avant ce
 * modèle : les refuser en bloc les ferait tous basculer en `validation_failed`
 * sans qu'un humain ait rien arbitré, ce qui remplacerait une divergence par
 * une avalanche. Deux exceptions, et elles ne dépendent d'aucun profil : une
 * écriture qui emploie 481 et 791, ou 6862 et 6812, est fausse quel que soit le
 * référentiel qu'on lui prête — elle additionne deux mécanismes qui se
 * remplacent l'un l'autre.
 */

export const NORMATIVE_MISMATCH_CODE = "normative-profile-mismatch";
export const UNDECLARED_ACCOUNT_CODE = "compte-personnalise-non-declare";
export const WRONG_PARENT_CODE = "subdivision-parent-errone";
export const UNSOURCED_OFFICIAL_ACCOUNT_CODE = "compte-officiel-non-source";
export const MISSING_CONTEXT_CODE = "contexte-normatif-absent";

export interface NormativeCheckInput {
  payload: ContentPayload;
  /** `null` quand le contenu ne déclare rien — le cas des brouillons antérieurs. */
  normativeContext?: NormativeContext | null;
}

export interface NormativeCheckResult {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  /** Les comptes versionnés relevés, pour le rapport de classement. */
  occurrences: AccountOccurrence[];
}

function issue(
  severity: "error" | "warning",
  code: string,
  message: string,
  path?: string
): ValidationIssue {
  return { code, message, path, severity };
}

/** Les natures de source citées par le contenu. */
function citedMaterialKinds(payload: ContentPayload): Set<string> {
  const kinds = new Set<string>();

  for (const { reference } of collectSourceReferences(payload)) {
    const sourceType = (reference as { sourceType?: unknown }).sourceType;

    if (typeof sourceType === "string" && (sourceMaterialKinds as readonly string[]).includes(sourceType)) {
      kinds.add(sourceType);
    }
  }

  return kinds;
}

function disclosureFor(
  disclosures: readonly CustomAccountDisclosure[],
  accountNumber: string
): CustomAccountDisclosure | undefined {
  return disclosures.find((disclosure) => disclosure.accountNumber === accountNumber);
}

/** Le premier chemin où un compte a été relevé — pour pointer l'endroit exact. */
function pathOf(occurrences: readonly AccountOccurrence[], accountNumber: string): string | undefined {
  return occurrences.find((occurrence) => occurrence.accountNumber === accountNumber)?.path;
}

/**
 * Les deux mélanges qui sont faux sans qu'on ait à connaître le profil.
 *
 * 481 et 791 : le mécanisme officiel du compte 481 débite directement les frais
 * à l'engagement ; le virement par 791 appartient à l'autre traitement, celui
 * qui passait par 4816. Les employer ensemble, c'est enregistrer deux fois.
 *
 * 4816 AVEC 791 N'EST PAS UN MÉLANGE, C'EST LE TRAITEMENT HISTORIQUE. La
 * première version de ce contrôle assimilait la subdivision à son parent et
 * refusait donc les contenus qui décrivent fidèlement le support d'origine —
 * exactement ceux que ce modèle est censé permettre de conserver. Ce qui est
 * interdit est de mêler le compte *actuel* au virement *historique*.
 *
 * 6862 et 6812 : deux dotations pour un seul étalement. L'une remplace l'autre,
 * elles ne s'ajoutent pas.
 *
 * LE CONTRÔLE PORTE SUR LES CHAMPS TYPÉS, PAS SUR LA PROSE. Un mélange est une
 * *écriture* qui additionne deux mécanismes : deux lignes, deux comptes requis.
 * Une phrase qui compare les deux traitements les nomme tous les deux sans rien
 * additionner, et c'est exactement ce qu'un encart comparatif doit faire.
 * L'appliquer au texte aurait rendu la comparaison impossible à écrire — or
 * comprendre ce qui a changé fait partie de ce qu'un apprenant doit savoir. Une
 * mention en prose reste soumise à {@link checkConflictIsDeclared} : nommer un
 * compte remplacé oblige à dater la divergence.
 */
function checkProfileIndependentHybrids(
  occurrences: readonly AccountOccurrence[],
  errors: ValidationIssue[]
): void {
  const present = new Set(
    occurrences.filter((occurrence) => occurrence.structured).map((occurrence) => occurrence.accountNumber)
  );

  if (present.has("481") && present.has("791")) {
    errors.push(
      issue(
        "error",
        NORMATIVE_MISMATCH_CODE,
        "l'écriture emploie le compte 481 et le compte 791 : le mécanisme actuel débite 481 à l'engagement des frais et ne comporte aucun virement par un compte 79. Les deux traitements se remplacent, ils ne se cumulent pas.",
        pathOf(occurrences, "791")
      )
    );
  }

  if (present.has("6862") && present.has("6812")) {
    errors.push(
      issue(
        "error",
        NORMATIVE_MISMATCH_CODE,
        "le contenu emploie 6862 et 6812 pour la même dotation : 6862 est la dotation actuelle, 6812 celle du support d'origine. Une seule des deux peut valoir à la fois.",
        pathOf(occurrences, "6812")
      )
    );
  }
}

/** Le profil courant refuse ce qui a été remplacé, et les subdivisions du support. */
function checkCurrentProfile(
  payload: ContentPayload,
  present: ReadonlySet<string>,
  occurrences: readonly AccountOccurrence[],
  context: NormativeContext,
  errors: ValidationIssue[]
): void {
  // Se déclarer du référentiel en vigueur en ne citant que le support revient à
  // affirmer que le support *est* le référentiel — c'est l'erreur que l'audit a
  // relevée. La règle ne s'applique qu'aux contenus qui touchent un compte
  // versionné : une carte sur le vocabulaire de l'emprunt n'a rien à prouver.
  if (present.size > 0 && !citedMaterialKinds(payload).has("official-reference")) {
    errors.push(
      issue(
        "error",
        NORMATIVE_MISMATCH_CODE,
        "le contenu se déclare « ANC 2026 — actuel » mais ne cite aucune référence officielle : le référentiel invoqué n'est étayé par aucune source du plan comptable",
        "content.sourceReferences"
      )
    );
  }

  const structured = new Set(
    occurrences.filter((occurrence) => occurrence.structured).map((occurrence) => occurrence.accountNumber)
  );

  for (const accountNumber of present) {
    const account = versionedAccount(accountNumber);

    if (account?.kind === "legacy") {
      // NOMMER L'ANCIEN TRAITEMENT N'EST PAS L'APPLIQUER. Une fiche du profil en
      // vigueur doit pouvoir dire ce qui a changé — c'est même la seule façon
      // qu'a un apprenant de comprendre un support antérieur qu'il a sous les
      // yeux. Ce qui est interdit, c'est de l'employer : de le mettre dans une
      // carte des comptes, une chronologie, une ligne d'écriture ou une liste de
      // comptes requis, c'est-à-dire là où il devient la réponse.
      //
      // Une simple mention en prose reste soumise à `checkConflictIsDeclared` :
      // elle exige une note de divergence, faute de quoi le lecteur ne peut pas
      // savoir que le compte cité appartient à un état antérieur du droit.
      if (!structured.has(accountNumber)) {
        continue;
      }

      errors.push(
        issue(
          "error",
          NORMATIVE_MISMATCH_CODE,
          `le contenu se déclare « ANC 2026 — actuel » mais emploie le compte ${accountNumber} (${account.label})` +
            `${account.supersededBy ? `, remplacé par ${account.supersededBy}` : ""} : ${account.rationale}`,
          pathOf(occurrences, accountNumber)
        )
      );
      continue;
    }

    if (account?.kind !== "custom-subdivision" || !structured.has(accountNumber)) {
      continue;
    }

    // Une subdivision déclarée reste employable dans le référentiel en vigueur :
    // le plan admet les subdivisions, et 4671 nomme un usage que 467 ne nomme
    // pas. Ce qui est refusé est la subdivision qui *double* un compte officiel
    // — 4816 porte l'intitulé exact de 481 — parce qu'il faudrait alors deux
    // numéros pour une seule chose, et que le plan en a tranché un.
    if (account.duplicatesOfficialAccount) {
      errors.push(
        issue(
          "error",
          NORMATIVE_MISMATCH_CODE,
          `le compte ${accountNumber} porte l'intitulé du compte ${account.duplicatesOfficialAccount} du plan 2026 sous un numéro que ce plan ne prescrit pas : dans le référentiel en vigueur, employer ${account.duplicatesOfficialAccount}. Le numéro ${accountNumber} relève du profil « Support d'origine — historique ».`,
          pathOf(occurrences, accountNumber)
        )
      );
    }
  }
}

/** Un contenu historique ne note personne, et le dit. */
function checkLegacyProfile(
  present: ReadonlySet<string>,
  context: NormativeContext,
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): void {
  if (context.scoringPolicy !== "comparison-only") {
    errors.push(
      issue(
        "error",
        NORMATIVE_MISMATCH_CODE,
        `le profil « Support d'origine — historique » impose une politique de notation « comparaison seule », or le contenu déclare « ${context.scoringPolicy} » : un traitement remplacé ne peut pas servir à noter une réponse d'aujourd'hui`,
        "normativeContext.scoringPolicy"
      )
    );
  }

  if (!context.supersededByProfile) {
    warnings.push(
      issue(
        "warning",
        NORMATIVE_MISMATCH_CODE,
        "aucun profil de remplacement n'est indiqué : le relecteur ne peut pas dire vers quel traitement renvoyer l'apprenant",
        "normativeContext.supersededByProfile"
      )
    );
  }

  if (present.size === 0) {
    warnings.push(
      issue(
        "warning",
        NORMATIVE_MISMATCH_CODE,
        "le contenu est classé « Support d'origine — historique » mais n'emploie aucun compte divergent du plan 2026 : vérifier que le classement est justifié",
        "normativeContext.profile"
      )
    );
  }
}

/**
 * Une subdivision propre à une entité ou à un exercice doit nommer son parent.
 *
 * La règle vaut pour les trois profils : c'est elle qui empêche un sous-compte
 * d'être lu comme un compte du plan. Le profil décide seulement s'il a le droit
 * d'être là, pas s'il a le droit d'être anonyme.
 */
function checkDisclosures(
  present: ReadonlySet<string>,
  occurrences: readonly AccountOccurrence[],
  context: NormativeContext,
  errors: ValidationIssue[]
): void {
  // L'obligation de déclarer porte sur l'EMPLOI, pas sur la citation. Un
  // sous-compte devient trompeur quand il figure dans une carte des comptes, une
  // ligne d'écriture ou une liste de comptes requis : le lecteur le prend alors
  // pour un compte du plan. Une phrase qui le nomme pour dire d'où il vient ne
  // le présente comme obligatoire à personne — et l'exiger aurait interdit
  // d'expliquer la différence entre deux numérotations.
  const used = new Set(
    occurrences.filter((occurrence) => occurrence.structured).map((occurrence) => occurrence.accountNumber)
  );

  for (const accountNumber of used) {
    const account = versionedAccount(accountNumber);

    if (account?.kind !== "custom-subdivision") {
      continue;
    }

    const disclosure = disclosureFor(context.customAccountDisclosures, accountNumber);

    if (!disclosure) {
      errors.push(
        issue(
          "error",
          UNDECLARED_ACCOUNT_CODE,
          `le compte ${accountNumber} n'est pas prescrit par le plan officiel : il doit être déclaré comme subdivision de ${account.parentAccount} dans customAccountDisclosures, sans quoi il est présenté comme un compte obligatoire`,
          pathOf(occurrences, accountNumber)
        )
      );
      continue;
    }

    if (disclosure.parentAccount !== account.parentAccount) {
      errors.push(
        issue(
          "error",
          WRONG_PARENT_CODE,
          `le compte ${accountNumber} est déclaré comme subdivision de ${disclosure.parentAccount}, alors qu'il subdivise ${account.parentAccount}`,
          "normativeContext.customAccountDisclosures"
        )
      );
    }
  }

  // Une déclaration sans emploi n'est pas fausse, mais elle décrit un contenu
  // qui n'est pas celui-ci — le plus souvent le reste d'une reprise.
  for (const disclosure of context.customAccountDisclosures) {
    if (!present.has(disclosure.accountNumber)) {
      errors.push(
        issue(
          "error",
          UNDECLARED_ACCOUNT_CODE,
          `le compte ${disclosure.accountNumber} est déclaré comme sous-compte mais n'apparaît nulle part dans le contenu`,
          "normativeContext.customAccountDisclosures"
        )
      );
    }
  }
}

/**
 * Un compte officiel que le support ne nomme pas doit citer le référentiel.
 *
 * C'est le cas du compte 512 : le support de cours dit « un compte de
 * trésorerie », le numéro et l'intitulé viennent du plan de comptes. Le
 * présenter sans citer de référence officielle revient à le faire passer pour
 * une connaissance qui n'a pas besoin de source.
 */
function checkOfficialAccountsAreSourced(
  present: ReadonlySet<string>,
  payload: ContentPayload,
  occurrences: readonly AccountOccurrence[],
  errors: ValidationIssue[]
): void {
  if (!present.has("512")) {
    return;
  }

  if (citedMaterialKinds(payload).has("official-reference")) {
    return;
  }

  errors.push(
    issue(
      "error",
      UNSOURCED_OFFICIAL_ACCOUNT_CODE,
      "le compte 512 « Banques » est employé sans qu'aucune référence officielle soit citée : son intitulé vient du plan de comptes, pas du support de cours, et ne peut pas être présenté comme une connaissance non sourcée",
      pathOf(occurrences, "512")
    )
  );
}

/** Une divergence de version tue en silence : elle doit être écrite quelque part. */
function checkConflictIsDeclared(
  present: ReadonlySet<string>,
  context: NormativeContext,
  errors: ValidationIssue[]
): void {
  // Deux façons d'être daté : un compte dont le traitement a été remplacé (791,
  // 6812, 16883), et un sous-compte qui porte l'intitulé d'un compte officiel
  // sous un numéro antérieur (4816). Les deux appellent la même obligation :
  // nommer un numéro daté sans dire qu'il l'est le fait passer pour courant.
  const dated = [...present].filter((accountNumber) => {
    const account = versionedAccount(accountNumber);

    return account?.kind === "legacy" || Boolean(account?.duplicatesOfficialAccount);
  });

  if (dated.length === 0 || context.versionConflictNotes.length > 0) {
    return;
  }

  errors.push(
    issue(
      "error",
      NORMATIVE_MISMATCH_CODE,
      `le contenu nomme ${dated.join(", ")}, dont le traitement ou la numérotation a été remplacé, sans aucune note de divergence : présenter l'ancien traitement sans avertissement le fait passer pour toujours applicable`,
      "normativeContext.versionConflictNotes"
    )
  );
}

/** Le profil, le statut et la politique de notation doivent dire la même chose. */
function checkContextCoherence(
  context: NormativeContext,
  errors: ValidationIssue[]
): void {
  const expected = STATUS_BY_PROFILE[context.profile];

  if (context.status !== expected) {
    errors.push(
      issue(
        "error",
        NORMATIVE_MISMATCH_CODE,
        `le profil « ${context.profile} » implique le statut « ${expected} », or le contenu déclare « ${context.status} »`,
        "normativeContext.status"
      )
    );
  }

  // Le profil courant admet `graded` — un exercice — et `not-gradable` — une
  // fiche, qui n'a pas de réponse attendue. Il n'admet pas `comparison-only`,
  // qui est la voie réservée à ce qui n'est plus applicable.
  if (context.profile === "anc-2026-current" && context.scoringPolicy === "comparison-only") {
    errors.push(
      issue(
        "error",
        NORMATIVE_MISMATCH_CODE,
        "un contenu du référentiel en vigueur ne peut pas être « comparaison seule » : cette politique existe pour ce qui n'est plus applicable",
        "normativeContext.scoringPolicy"
      )
    );
  }

  if (context.effectiveFrom && context.effectiveTo && context.effectiveTo < context.effectiveFrom) {
    errors.push(
      issue(
        "error",
        NORMATIVE_MISMATCH_CODE,
        `la période d'application se termine (${context.effectiveTo}) avant de commencer (${context.effectiveFrom})`,
        "normativeContext.effectiveTo"
      )
    );
  }
}

/** Un contenu noté ne peut pas attendre une réponse issue d'un traitement remplacé. */
function checkGradedAnswerIsCurrent(
  present: ReadonlySet<string>,
  occurrences: readonly AccountOccurrence[],
  scoringPolicy: ScoringPolicy,
  errors: ValidationIssue[]
): void {
  if (scoringPolicy !== "graded") {
    return;
  }

  const structured = new Set(
    occurrences.filter((occurrence) => occurrence.structured).map((occurrence) => occurrence.accountNumber)
  );

  for (const accountNumber of present) {
    if (!structured.has(accountNumber) || versionedAccount(accountNumber)?.kind !== "legacy") {
      continue;
    }

    errors.push(
      issue(
        "error",
        NORMATIVE_MISMATCH_CODE,
        `la réponse attendue emploie le compte ${accountNumber}, qui relève du traitement du support d'origine, alors que le contenu est noté : un apprenant serait corrigé sur un traitement qui n'est plus applicable`,
        pathOf(occurrences, accountNumber)
      )
    );
  }
}

/**
 * Le contrôle complet.
 *
 * Il rend des problèmes, il n'en corrige aucun : reclasser d'office un contenu
 * qui emploie 791 sous le profil historique masquerait le fait qu'il a été
 * rédigé comme s'il était actuel, et c'est précisément ce qu'un relecteur doit
 * voir.
 */
export function checkNormativeContext(input: NormativeCheckInput): NormativeCheckResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const occurrences = collectVersionedAccounts(input.payload);
  const present = new Set(distinctAccountNumbers(occurrences));
  const context = input.normativeContext ?? null;

  checkProfileIndependentHybrids(occurrences, errors);

  if (!context) {
    if (present.size > 0) {
      warnings.push(
        issue(
          "warning",
          MISSING_CONTEXT_CODE,
          `le contenu emploie des comptes dont le traitement dépend du millésime (${[...present].sort().join(", ")}) sans déclarer de contexte normatif : le profil applicable ne peut pas être établi`,
          "normativeContext"
        )
      );
    }

    return { errors, warnings, occurrences };
  }

  checkContextCoherence(context, errors);
  checkDisclosures(present, occurrences, context, errors);
  checkConflictIsDeclared(present, context, errors);
  checkOfficialAccountsAreSourced(present, input.payload, occurrences, errors);
  checkGradedAnswerIsCurrent(present, occurrences, context.scoringPolicy, errors);

  if (context.profile === "anc-2026-current") {
    checkCurrentProfile(input.payload, present, occurrences, context, errors);
  }

  if (context.profile === "course-original") {
    checkLegacyProfile(present, context, errors, warnings);
  }

  return { errors, warnings, occurrences };
}

// --- Classement ------------------------------------------------------------

export interface NormativeClassification {
  /** Le profil que les comptes employés désignent. */
  proposedProfile: NormativeProfile;
  proposedScoringPolicy: ScoringPolicy;
  proposedDisclosures: CustomAccountDisclosure[];
  accountsFound: string[];
  legacyAccounts: string[];
  customSubdivisions: string[];
  /** Vrai quand le classement demande un arbitrage humain plutôt qu'une reprise. */
  ambiguous: boolean;
  reasons: string[];
}

/**
 * Les types dont la réponse attendue fait foi.
 *
 * LA FLASHCARD EN FAIT PARTIE, ET L'OUBLIER VIDAIT LA FILE DE RÉVISION. Une
 * carte porte une réponse au verso, l'apprenant s'auto-évalue dessus, et
 * `flashcard_reviewed` est l'une des sept dimensions de la maîtrise d'un
 * chapitre. La classer « non notable » la faisait écarter par
 * `filterGradedVersions` : un chapitre entièrement classé par cette commande
 * serait arrivé en production avec une répétition espacée vide, sans qu'aucun
 * contrôle ne s'en plaigne.
 *
 * La fiche de révision aussi : ses questions de rappel actif sont notées, et
 * c'est la dimension `active_recall`.
 *
 * `not-gradable` reste disponible pour un contenu sans réponse attendue
 * exploitable. Qu'aucun type n'y tombe aujourd'hui est un fait sur ce chapitre,
 * pas une raison de retirer la valeur.
 */
const GRADABLE_CONTENT_TYPES = new Set<ContentPayload["contentType"]>([
  "smart_revision_sheet",
  "flashcard",
  "calculation_exercise",
  "journal_entry_exercise",
  "error_diagnosis_exercise",
  "progressive_case"
]);

/**
 * Le profil que les comptes employés désignent, sans rien décider d'autre.
 *
 * ELLE NE TOUCHE PAS À LA RÉPONSE ATTENDUE. Un contenu qui emploie 791 est
 * classé « support d'origine » parce que c'est ce qu'il est, pas réécrit en 481
 * — remplacer 791 par 481 changerait le nombre de lignes, les montants et le
 * barème, c'est-à-dire réécrire l'exercice. Le classement rend un constat ; la
 * réécriture est un autre travail, qui se fait à la main et se relit.
 */
export function classifyNormativeContext(payload: ContentPayload): NormativeClassification {
  const occurrences = collectVersionedAccounts(payload);
  const accountsFound = distinctAccountNumbers(occurrences);
  const reasons: string[] = [];

  const legacyAccounts = accountsFound.filter(
    (accountNumber) => versionedAccount(accountNumber)?.kind === "legacy"
  );
  const customSubdivisions = accountsFound.filter(
    (accountNumber) => versionedAccount(accountNumber)?.kind === "custom-subdivision"
  );

  const proposedDisclosures: CustomAccountDisclosure[] = customSubdivisions.map((accountNumber) => {
    const account = versionedAccount(accountNumber);

    return {
      accountNumber,
      parentAccount: account?.parentAccount ?? "",
      source: "course" as const,
      label: account?.label ?? accountNumber
    };
  });

  let proposedProfile: NormativeProfile = "anc-2026-current";

  if (legacyAccounts.length > 0) {
    proposedProfile = "course-original";
    reasons.push(
      `emploie ${legacyAccounts.join(", ")}, dont le traitement a été remplacé au 1er janvier 2026`
    );
  } else if (customSubdivisions.length > 0) {
    proposedProfile = "entity-specific";
    reasons.push(
      `emploie ${customSubdivisions.join(", ")}, qui ne sont pas des comptes du plan officiel mais des subdivisions`
    );
  } else if (accountsFound.length > 0) {
    reasons.push(`n'emploie que des comptes du plan en vigueur (${accountsFound.join(", ")})`);
  } else {
    reasons.push("n'emploie aucun compte dont le traitement dépend du millésime");
  }

  const gradable = GRADABLE_CONTENT_TYPES.has(payload.contentType);
  let proposedScoringPolicy: ScoringPolicy;

  if (proposedProfile === "course-original") {
    proposedScoringPolicy = "comparison-only";
  } else if (gradable) {
    proposedScoringPolicy = "graded";
  } else {
    proposedScoringPolicy = "not-gradable";
  }

  // Ce qui demande un humain : une écriture qui mélange les deux traitements, ou
  // un compte officiel non sourcé. Le classement ne tranche pas.
  //
  // Le mélange se juge sur les champs typés, comme le refus correspondant : une
  // fiche qui *compare* les deux traitements les nomme tous les deux en prose
  // sans rien additionner, et c'est précisément ce qu'un encart comparatif doit
  // faire. La signaler comme ambiguë l'aurait envoyée en arbitrage humain à
  // chaque passage, y compris une fois corrigée.
  const inAnswer = new Set(
    occurrences.filter((occurrence) => occurrence.structured).map((occurrence) => occurrence.accountNumber)
  );
  const mixesTreatments = inAnswer.has("481") && inAnswer.has("791");
  const doubleDotation = inAnswer.has("6862") && inAnswer.has("6812");
  const unsourced512 =
    accountsFound.includes("512") && !citedMaterialKinds(payload).has("official-reference");

  if (mixesTreatments) {
    reasons.push("mélange le compte 481 du plan en vigueur et le virement historique par 791");
  }

  if (doubleDotation) {
    reasons.push("emploie 6862 et 6812 pour la même dotation");
  }

  if (unsourced512) {
    reasons.push("emploie le compte 512 sans citer de référence officielle");
  }

  return {
    proposedProfile,
    proposedScoringPolicy,
    proposedDisclosures,
    accountsFound,
    legacyAccounts,
    customSubdivisions,
    ambiguous: mixesTreatments || doubleDotation || unsourced512,
    reasons
  };
}
