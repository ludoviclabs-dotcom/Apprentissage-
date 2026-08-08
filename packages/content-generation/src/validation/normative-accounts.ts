import type { ContentPayload } from "../types/artifact";

/**
 * Les comptes dont le traitement dépend du millésime du référentiel.
 *
 * LA LISTE EST FERMÉE, ET C'EST CE QUI LA REND UTILISABLE. Le plan comptable
 * compte des milliers de numéros ; prétendre les arbitrer tous depuis le code
 * reviendrait à réécrire le PCG en TypeScript. Ce qui est décrit ici est
 * exactement ce que l'audit du chapitre « Emprunts obligataires » a établi, pas
 * une théorie générale de la comptabilité : les comptes sur lesquels le support
 * d'origine et le plan au 1er janvier 2026 divergent, plus ceux que le support
 * subdivise sans le dire.
 *
 * Un compte absent de cette table n'est ni interdit ni suspect : il est
 * simplement hors du périmètre du versionnement, et le validateur le laisse
 * passer sans rien en dire.
 */

/** Ce qu'un compte est, du point de vue du versionnement normatif. */
export type VersionedAccountKind =
  | /** Compte du plan officiel au 1er janvier 2026. */ "official-current"
  | /** Compte ou mécanisme du support d'origine, remplacé depuis. */ "legacy"
  | /** Subdivision libre : ni prescrite ni interdite, mais à déclarer. */ "custom-subdivision";

export interface VersionedAccount {
  accountNumber: string;
  kind: VersionedAccountKind;
  label: string;
  /**
   * Le compte officiel dont ce numéro est une subdivision. Renseigné pour les
   * subdivisions, et c'est la valeur que `customAccountDisclosures` doit
   * annoncer : une divergence entre les deux est une erreur de déclaration.
   */
  parentAccount?: string;
  /** Le compte à employer aujourd'hui, quand celui-ci a été remplacé. */
  supersededBy?: string;
  /**
   * Le compte officiel que cette subdivision *double*.
   *
   * TOUTES LES SUBDIVISIONS NE SE VALENT PAS. 4671 subdivise 467 pour distinguer
   * un usage que le plan ne nomme pas : elle ajoute quelque chose, et rien dans
   * le plan 2026 ne la contredit. 4816 porte au contraire l'intitulé exact du
   * compte 481 — ce n'est pas une subdivision *en plus* de 481, c'est 481 sous
   * un numéro antérieur. La première reste employable dans le référentiel en
   * vigueur une fois déclarée ; la seconde ne le peut pas, puisqu'il faudrait
   * deux numéros pour une seule chose.
   */
  duplicatesOfficialAccount?: string;
  /** Pourquoi ce compte figure ici — affiché au relecteur, jamais deviné. */
  rationale: string;
}

/**
 * Le traitement des frais d'émission d'emprunt, dans ses deux états.
 *
 * Support d'origine : 4816 (subdivision de 481), virement par 791, dotation par
 * 6812. PCG 2026 : 481 directement débité à l'engagement, dotation par 6862,
 * aucun compte 79 dans le mécanisme.
 *
 * 16883 n'était pas nommé dans la commande de correction, mais relève du même
 * constat, établi par la même matrice de comptes : intitulé identique, numéro
 * différent (1638 en 2026). Le traiter à part aurait laissé une divergence de
 * version connue circuler sans marquage.
 */
export const VERSIONED_ACCOUNTS: readonly VersionedAccount[] = [
  {
    accountNumber: "481",
    kind: "official-current",
    label: "Charges à répartir sur plusieurs exercices — frais d'émission des emprunts",
    rationale:
      "Compte officiel actuel pour les frais d'émission d'emprunt étalés. Le mécanisme décrit par le PCG 2026 le débite directement lors de l'engagement des frais."
  },
  {
    accountNumber: "6862",
    kind: "official-current",
    label: "Dotations aux amortissements des frais d'émission des emprunts",
    rationale: "Contrepartie officielle actuelle de l'étalement du compte 481."
  },
  {
    accountNumber: "6272",
    kind: "official-current",
    label: "Commissions et frais sur émission d'emprunts",
    rationale: "Numéro et libellé identiques dans le support et dans le plan 2026."
  },
  {
    accountNumber: "512",
    kind: "official-current",
    label: "Banques",
    rationale:
      "Le support ne le nomme pas — il dit « un compte de trésorerie ». Son intitulé vient du référentiel officiel, et un contenu qui l'emploie doit donc citer une référence officielle plutôt que de le présenter comme une évidence."
  },
  {
    accountNumber: "467",
    kind: "official-current",
    label: "Divers comptes débiteurs et produits à recevoir",
    rationale: "Compte parent officiel des subdivisions 4671 et 4672 employées par le support."
  },
  {
    accountNumber: "4816",
    kind: "custom-subdivision",
    parentAccount: "481",
    duplicatesOfficialAccount: "481",
    label: "Frais d'émission des emprunts (subdivision du support)",
    rationale:
      "Même intitulé que le compte 481 du plan 2026, numéro différent. Le plan 2026 ne prescrit pas ce numéro : ce n'est pas un compte officiel, c'est une subdivision."
  },
  {
    accountNumber: "4671",
    kind: "custom-subdivision",
    parentAccount: "467",
    label: "Obligataires, obligations à placer (subdivision du support)",
    rationale:
      "Le support de cours dit lui-même que ce compte n'est pas prévu par le PCG. Il reste utilisable comme subdivision pédagogique de 467, jamais comme compte obligatoire."
  },
  {
    accountNumber: "4672",
    kind: "custom-subdivision",
    parentAccount: "467",
    label: "Obligataires, coupons à payer (subdivision du support)",
    rationale:
      "Le support le présente explicitement comme une division libre du compte 467, pas comme une norme."
  },
  {
    accountNumber: "791",
    kind: "legacy",
    label: "Transferts de charges d'exploitation",
    rationale:
      "Divergence méthodologique, pas seulement de numéro : le mécanisme officiel du compte 481 ne comporte aucun virement par un compte 79. Le traitement du support d'origine, conservé pour comparaison."
  },
  {
    accountNumber: "6812",
    kind: "legacy",
    supersededBy: "6862",
    label: "Dotations aux amortissements des charges d'exploitation à répartir",
    rationale:
      "Même rôle que 6862 — la dotation d'amortissement des frais d'émission étalés — mais dans la nomenclature du support d'origine."
  },
  {
    accountNumber: "16883",
    kind: "legacy",
    supersededBy: "1638",
    label: "Intérêts courus sur autres emprunts obligataires",
    rationale:
      "Intitulé identique à celui du compte 1638 du plan 2026, numéro différent — vraisemblablement une nomenclature antérieure."
  }
];

const BY_NUMBER = new Map(VERSIONED_ACCOUNTS.map((account) => [account.accountNumber, account]));

export function versionedAccount(accountNumber: string): VersionedAccount | undefined {
  return BY_NUMBER.get(accountNumber);
}

export function isLegacyAccount(accountNumber: string): boolean {
  return BY_NUMBER.get(accountNumber)?.kind === "legacy";
}

export function isCustomSubdivision(accountNumber: string): boolean {
  return BY_NUMBER.get(accountNumber)?.kind === "custom-subdivision";
}

/** Les clés dont la valeur est un numéro de compte, dans les schémas de contenu. */
const ACCOUNT_STRING_KEYS = new Set(["accountNumber", "parentAccount"]);
const ACCOUNT_ARRAY_KEYS = new Set(["requiredAccounts", "allowedAlternativeAccounts", "accountsInvolved"]);

/**
 * Les champs qui ne décrivent pas ce que le contenu *enseigne*.
 *
 * `customAccountDisclosures` vit dans le contexte normatif, pas dans le
 * contenu ; la précaution est prise ici quand même, parce qu'un relevé de
 * comptes qui compterait la déclaration comme un emploi rendrait toute
 * déclaration auto-justifiante.
 */
const IGNORED_KEYS = new Set(["customAccountDisclosures"]);

/**
 * Un numéro de compte cité dans un texte, avec le contexte qui permet d'en
 * juger. `path` sert au message d'erreur : « 791 dans content.explanation » est
 * exploitable, « le contenu emploie 791 » ne l'est pas.
 */
export interface AccountOccurrence {
  accountNumber: string;
  path: string;
  /** Vrai quand le numéro vient d'un champ typé, faux quand il vient d'un texte. */
  structured: boolean;
}

/**
 * Groupes de milliers et décimales : ce qui trahit un montant plutôt qu'un
 * compte. En JavaScript, `\s` couvre déjà l'espace insécable et l'espace fine
 * insécable, qui sont les séparateurs de milliers réellement employés dans les
 * énoncés : les énumérer une seconde fois n'aurait rien ajouté.
 */
const THOUSANDS_BEFORE = /\d[\s.,]$/;
const THOUSANDS_AFTER = /^[\s.,]\d/;

/**
 * Les numéros les plus longs d'abord. Sans cet ordre, reconnaître « 4816 »
 * dépendrait du fait que « 481 » soit essayé puis rejeté par la garde de droite :
 * cela fonctionne, mais pour une raison qu'il faudrait redémontrer à chaque ajout
 * dans la table.
 */
const TEXT_SCAN_PATTERN = new RegExp(
  `(?<!\\d)(?:${[...VERSIONED_ACCOUNTS]
    .map((account) => account.accountNumber)
    .sort((left, right) => right.length - left.length || left.localeCompare(right))
    .join("|")})(?!\\d)`,
  "g"
);

/**
 * Les comptes versionnés cités dans un texte libre.
 *
 * LE BALAYAGE NE CHERCHE QUE LA LISTE FERMÉE. Chercher « un numéro de compte »
 * dans de la prose reviendrait à confondre tout nombre de trois à cinq chiffres
 * avec un compte — un montant, une année, un nombre d'obligations. Restreindre
 * la recherche aux onze numéros que l'audit a nommés supprime la question.
 *
 * Reste le cas d'un de ces onze numéros apparaissant *dans* un montant :
 * « 1 791 200 ». Les deux gardes ci-dessous écartent un voisinage de groupe de
 * milliers ou de décimale. Ce n'est pas infaillible sur un montant écrit sans
 * séparateur, et c'est assumé : le relevé textuel produit des avertissements et
 * des propositions de classement, jamais un refus à lui seul — les refus
 * s'appuient sur les champs typés.
 */
export function scanTextForVersionedAccounts(text: string): string[] {
  const found: string[] = [];

  for (const match of text.matchAll(TEXT_SCAN_PATTERN)) {
    const index = match.index ?? 0;
    const before = text.slice(Math.max(0, index - 2), index);
    const after = text.slice(index + match[0].length, index + match[0].length + 2);

    if (THOUSANDS_BEFORE.test(before) || THOUSANDS_AFTER.test(after)) {
      continue;
    }

    found.push(match[0]);
  }

  return found;
}

/**
 * Tous les comptes versionnés qu'un contenu emploie.
 *
 * Deux relevés en un : les champs typés — lignes d'écriture, comptes requis,
 * carte des comptes — qui font foi, et les textes, qui ne servent qu'à repérer
 * un traitement décrit en prose sans écriture correspondante (une fiche, une
 * carte). La distinction est conservée dans `structured`.
 */
export function collectVersionedAccounts(payload: ContentPayload): AccountOccurrence[] {
  const found: AccountOccurrence[] = [];

  function record(accountNumber: string, path: string, structured: boolean): void {
    if (!BY_NUMBER.has(accountNumber)) {
      return;
    }

    found.push({ accountNumber, path, structured });
  }

  function walk(value: unknown, path: string): void {
    if (typeof value === "string") {
      for (const accountNumber of scanTextForVersionedAccounts(value)) {
        record(accountNumber, path, false);
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }

    if (value === null || typeof value !== "object") {
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;

      if (IGNORED_KEYS.has(key)) {
        continue;
      }

      if (ACCOUNT_STRING_KEYS.has(key) && typeof child === "string") {
        record(child, childPath, true);
        continue;
      }

      if (ACCOUNT_ARRAY_KEYS.has(key) && Array.isArray(child)) {
        child.forEach((item, index) => {
          if (typeof item === "string") {
            record(item, `${childPath}[${index}]`, true);
          }
        });
        continue;
      }

      walk(child, childPath);
    }
  }

  walk(payload.content, "content");

  return found;
}

/** Les numéros distincts employés, tous relevés confondus. */
export function distinctAccountNumbers(occurrences: readonly AccountOccurrence[]): string[] {
  return [...new Set(occurrences.map((occurrence) => occurrence.accountNumber))].sort();
}
