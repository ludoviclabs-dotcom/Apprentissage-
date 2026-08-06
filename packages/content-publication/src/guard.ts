import {
  collectSourceReferences,
  contentPayloadSchema,
  contentTypes,
  runTemplate,
  sourceReferenceSchema,
  validateContent,
  verifyReference,
  type ContentDraft,
  type ContentPayload,
  type CorpusIndex
} from "@finance/content-generation";
import { contentHash } from "./hash";

/**
 * Le garde de publication.
 *
 * IL NE FAIT PAS CONFIANCE AU VERDICT STOCKÉ. `validationMetadata` dit ce que
 * les contrôles ont conclu le jour où ils ont tourné ; il ne dit rien de ce
 * qu'ils concluraient maintenant. Entre-temps une source a pu être ré-extraite,
 * un template de calcul a pu passer en v2, un relecteur a pu corriger le
 * contenu. Le garde recharge donc le corpus et rejoue tout — c'est la seule
 * lecture de « la vérification doit être relancée au moment exact de la
 * publication » qui ait un sens.
 *
 * UN CORPUS ABSENT EST UN REFUS. Ne pas pouvoir vérifier n'est pas vérifier.
 * L'approbation applique déjà cette règle ; la publication, qui expose le
 * contenu à des inconnus, ne peut pas être plus laxiste qu'elle.
 */

export interface PublicationIssue {
  code: string;
  message: string;
  path?: string;
}

/** Ce que le garde a pu établir sur les sources du contenu. */
export interface SourceIntegrityReport {
  /** Faux dès qu'une seule référence ne désigne plus ce qu'elle prétend. */
  intact: boolean;
  corpusAvailable: boolean;
  referenceCount: number;
  documentCount: number;
  problems: PublicationIssue[];
}

/** Ce que le recalcul a donné, exercice par exercice. */
export interface DeterministicValidationReport {
  /** Faux dès qu'un recalcul diverge ou qu'une écriture ne s'équilibre plus. */
  passed: boolean;
  checks: Array<{ label: string; passed: boolean; detail: string }>;
}

export interface PublicationReport {
  passed: boolean;
  errors: PublicationIssue[];
  warnings: PublicationIssue[];
  sourceIntegrity: SourceIntegrityReport;
  deterministicValidation: DeterministicValidationReport;
  contentHash: string;
  /** La version que cette publication créerait. */
  publicationVersion: number;
}

export interface PublicationGuardInput {
  draft: ContentDraft;
  /** `undefined` quand l'extraction n'a pas été lancée : refus, jamais succès. */
  corpus: CorpusIndex | undefined;
  /** Version active actuelle, pour calculer la suivante. */
  currentVersion: number;
  /**
   * Hash du contenu tel qu'il a été revu, quand on en dispose. Une divergence
   * signifie que le contenu a bougé depuis l'approbation.
   */
  reviewedContentHash?: string;
}

/**
 * Motifs interdits dans un contenu destiné au navigateur.
 *
 * Repris du moteur de validation, plus l'URL de fichier privé que l'étape 2
 * réclame : un `file://`, un lien direct vers un PDF ou une URL de partage
 * Dropbox désignent un fichier source que le site public n'a pas le droit de
 * nommer, même si le fichier lui-même n'est pas servi.
 */
const ABSOLUTE_PATH_PATTERN = /(?:[A-Za-z]:[\\/])|(?:\/(?:home|Users)\/)|(?:\\\\[A-Za-z0-9_-]+\\)/;
const SECRET_PATTERN =
  /\b(?:sk-[A-Za-z0-9]{10,}|api[_-]?key\s*[:=]\s*\S+|Bearer\s+[A-Za-z0-9._-]{20,}|(?:secret|token|password|passwd)\s*[:=]\s*\S{8,})/i;
const PRIVATE_FILE_URL_PATTERN =
  /(?:file:\/\/)|(?:https?:\/\/[^\s"']*\.(?:pdf|docx?|xlsx?|pptx?)\b)|(?:dropbox\.com)|(?:CONTENT_SOURCE_ROOT)|(?:content-private)|(?:data\/extracted)|(?:data\/generated)/i;

/**
 * Motifs interdits, avec le code de refus qu'ils déclenchent.
 *
 * La table est parcourue par {@link scanForForbiddenStrings}, qui l'applique à
 * *chaque chaîne* d'une structure, si profondément enfouie soit-elle.
 */
const FORBIDDEN_PATTERNS: ReadonlyArray<{ code: string; pattern: RegExp; message: string }> = [
  {
    code: "chemin-prive",
    pattern: ABSOLUTE_PATH_PATTERN,
    message: "chemin de fichier absolu"
  },
  {
    code: "secret-detecte",
    pattern: SECRET_PATTERN,
    message: "ce qui ressemble à une clé, un jeton ou un mot de passe"
  },
  {
    code: "url-fichier-prive",
    pattern: PRIVATE_FILE_URL_PATTERN,
    message: "un lien ou un chemin vers un fichier source privé"
  }
];

function issue(code: string, message: string, path?: string): PublicationIssue {
  return { code, message, path };
}

/**
 * Parcours **récursif** de toute valeur, à la recherche de motifs interdits.
 *
 * `JSON.stringify` puis un `test` global aurait suffi à détecter la présence
 * d'un motif, mais pas à dire *où*. Or « le contenu comporte un chemin absolu »
 * est inexploitable sur un instantané de plusieurs centaines de lignes : ce
 * parcours rend le chemin d'accès exact (`sourceReferencesSnapshot[2].documentTitle`),
 * seul renseignement qui permette de corriger.
 *
 * Les clés sont inspectées autant que les valeurs : un objet dont une *clé*
 * serait un chemin est aussi anormal qu'une valeur qui l'est.
 */
export function scanForForbiddenStrings(value: unknown, rootPath = ""): PublicationIssue[] {
  const found: PublicationIssue[] = [];

  function walk(current: unknown, path: string): void {
    if (typeof current === "string") {
      for (const rule of FORBIDDEN_PATTERNS) {
        if (rule.pattern.test(current)) {
          found.push(issue(rule.code, `${path || "(racine)"} comporte ${rule.message}`, path));
        }
      }

      return;
    }

    if (Array.isArray(current)) {
      current.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }

    if (current === null || typeof current !== "object") {
      return;
    }

    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      for (const rule of FORBIDDEN_PATTERNS) {
        if (rule.pattern.test(key)) {
          found.push(issue(rule.code, `la clé « ${key} » comporte ${rule.message}`, path));
        }
      }

      walk(child, path ? `${path}.${key}` : key);
    }
  }

  walk(value, rootPath);

  return found;
}

/** `true` quand la valeur ne porte aucun texte exploitable. */
function isBlank(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().length === 0;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return value === null || value === undefined;
}

/**
 * Un contenu « vide » n'est pas un objet vide — Zod l'aurait déjà refusé. C'est
 * un contenu dont les champs porteurs de sens sont blancs : une fiche sans
 * règle, une carte au verso vide, un énoncé réduit à des espaces.
 */
function checkNotEmpty(payload: ContentPayload, errors: PublicationIssue[]): void {
  const carriers: Record<string, readonly string[]> = {
    smart_revision_sheet: ["title", "learningObjective", "summary", "essentialRules"],
    flashcard: ["front", "back", "explanation"],
    calculation_exercise: ["title", "statement", "explanation", "calculationSteps"],
    journal_entry_exercise: ["title", "statement", "expectedLines"],
    error_diagnosis_exercise: ["title", "scenario", "expectedCorrection", "errorCategories"],
    progressive_case: ["title", "context", "steps", "finalSynthesis"]
  };

  const content = payload.content as Record<string, unknown>;

  for (const field of carriers[payload.contentType] ?? []) {
    if (isBlank(content[field])) {
      errors.push(
        issue("contenu-vide", `le champ « ${field} » est vide — un contenu vide ne peut pas être publié`, `content.${field}`)
      );
    }
  }
}

function checkForbiddenStrings(payload: ContentPayload, errors: PublicationIssue[]): void {
  errors.push(...scanForForbiddenStrings(payload.content, "content"));
}

/**
 * Recalcule ce qui est recalculable.
 *
 * C'est le contrôle qui distingue une publication d'une simple recopie : un
 * exercice dont le template a changé de version, ou dont les entrées ont été
 * retouchées à la main après approbation, échoue ici et nulle part ailleurs.
 */
function runDeterministicChecks(payload: ContentPayload): DeterministicValidationReport {
  const checks: DeterministicValidationReport["checks"] = [];

  const roundToCent = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

  const checkBalance = (
    label: string,
    lines: ReadonlyArray<{ debit: number; credit: number }>
  ): void => {
    const debit = roundToCent(lines.reduce((sum, line) => sum + line.debit, 0));
    const credit = roundToCent(lines.reduce((sum, line) => sum + line.credit, 0));

    checks.push({
      label,
      passed: debit === credit,
      detail:
        debit === credit
          ? `équilibrée : ${debit} au débit comme au crédit`
          : `déséquilibrée : ${debit} au débit contre ${credit} au crédit`
    });
  };

  if (payload.contentType === "calculation_exercise") {
    const exercise = payload.content;
    const run = runTemplate(exercise.formulaTemplateId, exercise.templateInputs, exercise.roundingRule);

    if (!run.ok || run.rounded === undefined) {
      checks.push({
        label: `Recalcul « ${exercise.title} »`,
        passed: false,
        detail: `le recalcul a échoué : ${run.error ?? "raison inconnue"}`
      });
    } else {
      const gap = Math.abs(run.rounded - exercise.expectedAnswer);
      checks.push({
        label: `Recalcul « ${exercise.title} »`,
        passed: gap <= exercise.tolerance,
        detail:
          gap <= exercise.tolerance
            ? `${run.rounded} ${exercise.unit}, conforme à la réponse attendue`
            : `réponse annoncée ${exercise.expectedAnswer} ${exercise.unit}, recalculée ${run.rounded} ${exercise.unit} (écart ${gap.toFixed(4)}, tolérance ${exercise.tolerance})`
      });
    }
  }

  if (payload.contentType === "journal_entry_exercise") {
    checkBalance(`Écriture « ${payload.content.title} »`, payload.content.expectedLines);
  }

  if (payload.contentType === "error_diagnosis_exercise" && payload.content.proposedEntry) {
    // L'écriture *proposée* d'un diagnostic est fausse par construction : elle
    // n'a pas à s'équilibrer, sauf quand la réponse attendue est « aucune
    // erreur », auquel cas un déséquilibre contredirait l'énoncé.
    if (payload.content.expectedErrorCategory === "no_error") {
      checkBalance(`Écriture proposée « ${payload.content.title} »`, payload.content.proposedEntry);
    }
  }

  if (payload.contentType === "progressive_case") {
    for (const step of payload.content.steps) {
      if (step.answerSpecification.kind === "journal_entry") {
        checkBalance(`Étape « ${step.id} »`, step.answerSpecification.expectedLines);
      }
    }
  }

  return { passed: checks.every((check) => check.passed), checks };
}

function checkSourceIntegrity(
  payload: ContentPayload,
  corpus: CorpusIndex | undefined
): SourceIntegrityReport {
  const collected = collectSourceReferences(payload);
  const problems: PublicationIssue[] = [];
  const documents = new Set<string>();

  if (!corpus) {
    return {
      intact: false,
      corpusAvailable: false,
      referenceCount: collected.length,
      documentCount: 0,
      problems: [
        issue(
          "corpus-indisponible",
          "le corpus extrait de ce pack est introuvable : aucune source ne peut être vérifiée. Relancer l'extraction avant de publier."
        )
      ]
    };
  }

  if (collected.length === 0) {
    problems.push(issue("aucune-source", "le contenu ne cite aucune source"));
  }

  for (const { path, reference } of collected) {
    const parsed = sourceReferenceSchema.safeParse(reference);

    if (!parsed.success) {
      for (const detail of parsed.error.issues) {
        problems.push(issue("source-malformee", detail.message, `${path}.${detail.path.join(".")}`));
      }
      continue;
    }

    documents.add(parsed.data.documentId);
    const verification = verifyReference(parsed.data, corpus);

    for (const problem of verification.problems) {
      problems.push(issue(problem.code, problem.message, path));
    }

    // Une page dégradée n'interdit pas l'approbation par elle-même, mais un
    // contenu public ne peut pas s'appuyer sur un texte dont on sait
    // l'extraction incomplète.
    for (const warning of verification.warnings) {
      if (warning.code === "page-degradee") {
        problems.push(issue(warning.code, warning.message, path));
      }
    }
  }

  return {
    intact: problems.length === 0,
    corpusAvailable: true,
    referenceCount: collected.length,
    documentCount: documents.size,
    problems
  };
}

/**
 * Le rapport de publication. Ne publie rien : il dit si la publication est
 * possible, et pourquoi elle ne l'est pas.
 */
export function inspectForPublication(input: PublicationGuardInput): PublicationReport {
  const errors: PublicationIssue[] = [];
  const warnings: PublicationIssue[] = [];
  const draft = input.draft;

  const payloadCandidate = { contentType: draft.contentType, content: draft.content };
  const parsed = contentPayloadSchema.safeParse(payloadCandidate);

  if (!parsed.success) {
    for (const detail of parsed.error.issues) {
      errors.push(issue("schema-invalide", detail.message, detail.path.join(".")));
    }

    return {
      passed: false,
      errors,
      warnings,
      sourceIntegrity: {
        intact: false,
        corpusAvailable: Boolean(input.corpus),
        referenceCount: 0,
        documentCount: 0,
        problems: []
      },
      deterministicValidation: { passed: false, checks: [] },
      contentHash: contentHash(payloadCandidate),
      publicationVersion: input.currentVersion + 1
    };
  }

  const payload = parsed.data;
  const hash = contentHash(payload);

  // --- 1. Statut éditorial -------------------------------------------------
  if (draft.status !== "approved") {
    errors.push(
      issue(
        "statut-non-approuve",
        `le contenu est en « ${draft.status} » : seul un contenu approuvé peut être publié`
      )
    );
  }

  // --- 2. Type supporté ----------------------------------------------------
  if (!(contentTypes as readonly string[]).includes(draft.contentType)) {
    errors.push(issue("type-non-supporte", `type de contenu « ${draft.contentType} » non publiable`));
  }

  // --- 3. Mode de génération ----------------------------------------------
  if (draft.generationMetadata.mode === "mock") {
    errors.push(
      issue(
        "mode-mock",
        "ce contenu vient d'une fixture de démonstration (mode mock) : il ne peut pas être publié"
      )
    );
  }

  // --- 4. Contenu non vide, aucune chaîne interdite ------------------------
  checkNotEmpty(payload, errors);
  checkForbiddenStrings(payload, errors);

  // --- 5. Hash du contenu revu --------------------------------------------
  if (input.reviewedContentHash && input.reviewedContentHash !== hash) {
    errors.push(
      issue(
        "hash-divergent",
        "le contenu a changé depuis la relecture : l'empreinte ne correspond plus à ce qui a été approuvé"
      )
    );
  }

  // --- 6. Sources ----------------------------------------------------------
  const sourceIntegrity = checkSourceIntegrity(payload, input.corpus);
  errors.push(...sourceIntegrity.problems);

  // --- 7. Contrôles déterministes rejoués ----------------------------------
  const deterministicValidation = runDeterministicChecks(payload);

  for (const check of deterministicValidation.checks) {
    if (!check.passed) {
      errors.push(issue("controle-deterministe", `${check.label} : ${check.detail}`));
    }
  }

  // --- 8. Moteur de validation complet, rejoué -----------------------------
  if (input.corpus) {
    const revalidated = validateContent({ payload, corpus: input.corpus });

    for (const problem of revalidated.errors) {
      errors.push(issue(problem.code, problem.message, problem.path));
    }

    for (const problem of revalidated.warnings) {
      warnings.push(issue(problem.code, problem.message, problem.path));
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    sourceIntegrity,
    deterministicValidation,
    contentHash: hash,
    publicationVersion: input.currentVersion + 1
  };
}

/** Levée quand une publication est tentée malgré un rapport défavorable. */
export class PublicationRefusedError extends Error {
  constructor(readonly report: PublicationReport) {
    super(
      `publication refusée : ${report.errors.map((problem) => `${problem.code} — ${problem.message}`).join(" | ")}`
    );
    this.name = "PublicationRefusedError";
  }
}

/** Levée quand l'instantané *construit* porte encore quelque chose d'interdit. */
export class SnapshotRefusedError extends Error {
  constructor(readonly problems: PublicationIssue[]) {
    super(
      `instantané refusé : ${problems.map((problem) => `${problem.code} — ${problem.message}`).join(" | ")}`
    );
    this.name = "SnapshotRefusedError";
  }
}

/**
 * Dernier contrôle avant écriture : l'instantané **complet**.
 *
 * `inspectForPublication` examine le contenu ; celui-ci examine ce qui sera
 * réellement stocké — le contenu, mais aussi les références de sources, les
 * métadonnées de génération, de validation et de revue. C'est là que se
 * trouvent les champs qu'un auteur ne rédige pas et qu'on n'inspecterait donc
 * pas spontanément : `documentTitle` porte le nom du fichier d'origine,
 * `sourcePackId` désigne un pack privé, `reviewedBy` porte une adresse
 * électronique. Le contrôle est appliqué au tout, et non à ce qu'on croit
 * risqué.
 *
 * Deux exclusions, nommées plutôt que devinées :
 *
 * - `publishedBy` et `reviewMetadataSnapshot.reviewedBy` sont des comptes de
 *   relecteur. Ce sont des données internes, jamais projetées vers le public
 *   (voir `public/projection.ts`), mais légitimement présentes dans un registre
 *   dont l'objet est de dire qui a publié quoi. Les faire échouer sur le motif
 *   « secret » interdirait de tracer un acte.
 * - `contentHash`, `inputHash` et `excerptHash` sont des empreintes
 *   hexadécimales, qu'aucun motif ne vise, mais dont la longueur pourrait
 *   ressembler à un jeton dans une évolution future du motif.
 */
const SNAPSHOT_SCAN_EXCLUSIONS = new Set([
  "publishedBy",
  "reviewMetadataSnapshot",
  "contentHash",
  "sourceArtifactId",
  "id"
]);

export function inspectSnapshot(snapshot: Record<string, unknown>): PublicationIssue[] {
  const problems: PublicationIssue[] = [];

  for (const [key, value] of Object.entries(snapshot)) {
    if (SNAPSHOT_SCAN_EXCLUSIONS.has(key)) {
      continue;
    }

    problems.push(...scanForForbiddenStrings(value, key));
  }

  return problems;
}

/** Lève plutôt que de retourner : un appelant ne peut pas l'ignorer. */
export function assertSnapshotPublishable(snapshot: Record<string, unknown>): void {
  const problems = inspectSnapshot(snapshot);

  if (problems.length > 0) {
    throw new SnapshotRefusedError(problems);
  }
}
