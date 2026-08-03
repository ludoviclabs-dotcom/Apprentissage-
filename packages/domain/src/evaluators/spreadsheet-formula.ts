import {
  CANONICAL_FUNCTIONS,
  evaluateWorkbook,
  isSpreadsheetError,
  parseCellKey,
  formatScalar,
  type CanonicalFunction,
  type EvaluatedCell,
  type Scalar,
  type WorkbookCellInput
} from "../spreadsheet";
import { isAtMost } from "./numeric";
import {
  normalizeCellRef,
  type CellErrorKind,
  type SpreadsheetSubmission
} from "./spreadsheet";
import {
  InvalidEvaluationSpecError,
  buildResult,
  emptyFeedback,
  round2,
  type CriterionResult,
  type Evaluator,
  type EvaluationResult,
  type StructuredFeedback
} from "./types";

/**
 * Spreadsheet grading through the formula engine (PR-12b).
 *
 * The previous evaluator compared a formula's *text* to an authored pattern —
 * with the limitation ADR-006 records: an equivalent formula the author did not
 * anticipate loses the method marks. This evaluator removes that limitation by
 * never looking at the text at all. The learner's formula is parsed, injected
 * into the exercise's workbook, and *executed* by the bounded engine:
 *
 * 1. **Result** — the formula must produce the expected value over the given
 *    data. Any correct formulation earns these marks: `=B2+B3`, `=SOMME(B2:B3)`
 *    and `=B3+B2` are indistinguishable here, as they should be.
 * 2. **Method** — the formula must *survive the data changing*. Each authored
 *    perturbation overrides some given cells and states the value a correct
 *    method now produces. A hard-coded `=600000` matches the base data and
 *    fails every perturbation, which is precisely what makes it a method error
 *    — no pattern needed. Reference and function constraints (expected or
 *    forbidden) express the remaining method properties a perturbation cannot:
 *    "use the range, not three cells" is `requiredFunctions: ["SUM"]` plus
 *    `requiredRefs: ["B2:B4"]`.
 *
 * EACH CHECK IS GRADED IN ISOLATION. When an exercise chains cells (B13 reads
 * B12, both graded), B13 is evaluated against a workbook where B12 holds its
 * *expected* value, not the learner's. A mistake in B12 costs B12's points
 * once; B13 keeps its marks if its own formula is right — follow-through
 * credit, as a human marker gives. It is also what makes perturbation
 * expectations well-defined: they describe the correct model, not whichever
 * model the learner happened to build.
 */

export interface FormulaPerturbation {
  /** Stable identifier, unique within the spec. */
  name: string;
  /** French description of the scenario, shown when the check fails on it. */
  label: string;
  /** Given cells overridden by this scenario. Keys must exist in `workbook`. */
  overrides: Record<string, number | string>;
  /**
   * Expected value per checked cell under this scenario. A check absent here
   * keeps its base `expectedValue` (the scenario does not affect it).
   */
  expected: Record<string, number | string>;
}

export interface FormulaCellCheck {
  /** A1-style reference of the cell the learner must fill. */
  cell: string;
  label: string;
  points: number;
  /** What a correct model computes over the base data. */
  expectedValue: number | string;
  /** Fraction, not percent: 0.01 means 1%. Numbers only. */
  tolerancePct?: number;
  toleranceAbs?: number;
  unit?: string;
  /**
   * References the formula must read — a cell ("B2") or an exact range
   * ("B2:B4"). A range requirement is satisfied only by that range, not by
   * enumerating its members: it expresses "this must follow an inserted row".
   */
  requiredRefs?: string[];
  /** References the formula must not read, e.g. the subsidy line in a CA. */
  forbiddenRefs?: string[];
  requiredFunctions?: CanonicalFunction[];
  forbiddenFunctions?: CanonicalFunction[];
  /** Where a method failure is filed. Defaults to `reasoning`. */
  errorKind?: CellErrorKind;
  /** Shown when the method marks are lost. Never before. */
  formulaHint?: string;
}

export interface FormulaSpreadsheetSpec {
  /** The given cells: data the learner reads, labels included. */
  workbook: Record<string, WorkbookCellInput>;
  /** At least one; every check must be covered by at least one of them. */
  perturbations: FormulaPerturbation[];
  checks: FormulaCellCheck[];
}

/** The result marks weigh 60%, the method marks 40% — same split as ADR-006. */
const VALUE_SHARE = 0.6;
const DEFAULT_TOLERANCE_PCT = 0.0001;

function isValidCellKey(key: string): boolean {
  return parseCellKey(key) !== null;
}

function isValidRefConstraint(key: string): boolean {
  const parts = key.split(":");

  if (parts.length === 1) {
    return isValidCellKey(parts[0]);
  }

  return parts.length === 2 && isValidCellKey(parts[0]) && isValidCellKey(parts[1]);
}

function normalizeRefConstraint(key: string): string {
  return key
    .split(":")
    .map((part) => normalizeCellRef(part))
    .join(":");
}

function valueMatches(actual: Scalar, check: FormulaCellCheck, expected: number | string): boolean {
  if (typeof expected === "string") {
    return (
      typeof actual === "string" && actual.trim().toLowerCase() === expected.trim().toLowerCase()
    );
  }

  if (typeof actual !== "number" || !Number.isFinite(actual)) {
    return false;
  }

  const diff = Math.abs(actual - expected);

  if (
    typeof check.toleranceAbs === "number" &&
    isAtMost(diff, check.toleranceAbs, Math.max(Math.abs(actual), Math.abs(expected)))
  ) {
    return true;
  }

  const pct =
    check.tolerancePct ?? (typeof check.toleranceAbs === "number" ? undefined : DEFAULT_TOLERANCE_PCT);

  if (typeof pct !== "number") {
    return false;
  }

  return isAtMost(diff / Math.max(Math.abs(expected), 1), pct);
}

/**
 * The expected value of a checked cell under a scenario: the scenario's figure
 * when it names the cell, the base figure otherwise.
 */
function expectedUnder(
  perturbation: FormulaPerturbation | null,
  byCell: ReadonlyMap<string, FormulaCellCheck>
): (cell: string) => number | string {
  return (cell) => {
    const target = byCell.get(cell) as FormulaCellCheck;

    return perturbation?.expected[cell] ?? target.expectedValue;
  };
}

/**
 * Evaluates the learner's formula for one check under one scenario. The
 * workbook is the given data, the scenario's overrides, the *expected* values
 * of every other checked cell, and the learner's input in the target cell.
 */
function computeCellValue(
  spec: FormulaSpreadsheetSpec,
  check: FormulaCellCheck,
  learnerInput: WorkbookCellInput,
  perturbation: FormulaPerturbation | null,
  byCell: ReadonlyMap<string, FormulaCellCheck>
): EvaluatedCell {
  const target = normalizeCellRef(check.cell);
  const cells: Record<string, WorkbookCellInput> = { ...spec.workbook };

  for (const [key, value] of Object.entries(perturbation?.overrides ?? {})) {
    cells[normalizeCellRef(key)] = value;
  }

  const expectedOf = expectedUnder(perturbation, byCell);

  for (const other of byCell.keys()) {
    if (other !== target) {
      cells[other] = expectedOf(other);
    }
  }

  cells[target] = learnerInput;

  const workbook = evaluateWorkbook({ cells });

  return workbook.cells.get(target) as EvaluatedCell;
}

interface MethodVerdict {
  ok: boolean;
  /** French sentence naming the first failed property. */
  failure: string | null;
  /** True when the failure is a result typed in with no reference to the data. */
  hardCoded: boolean;
}

function checkMethod(
  spec: FormulaSpreadsheetSpec,
  check: FormulaCellCheck,
  learnerInput: WorkbookCellInput,
  evaluated: EvaluatedCell,
  byCell: ReadonlyMap<string, FormulaCellCheck>
): MethodVerdict {
  const profile = evaluated.formula?.profile ?? null;

  if (!profile || !profile.referencesData) {
    return {
      ok: false,
      hardCoded: true,
      failure:
        "le résultat est saisi en dur : la formule ne lit aucune cellule, elle ne suivra pas les données."
    };
  }

  if (profile.unknownFunctions.length > 0) {
    return {
      ok: false,
      hardCoded: false,
      failure: `fonction inconnue (${profile.unknownFunctions.join(", ")}).`
    };
  }

  const refs = new Set<string>([...profile.cellRefs, ...profile.rangeRefs]);

  for (const required of check.requiredRefs ?? []) {
    if (!refs.has(normalizeRefConstraint(required))) {
      return {
        ok: false,
        hardCoded: false,
        failure: `la formule devrait s'appuyer sur ${required}.`
      };
    }
  }

  for (const forbidden of check.forbiddenRefs ?? []) {
    if (refs.has(normalizeRefConstraint(forbidden))) {
      return {
        ok: false,
        hardCoded: false,
        failure: `la formule ne devrait pas faire intervenir ${forbidden}.`
      };
    }
  }

  const functions = new Set(profile.functions);

  for (const required of check.requiredFunctions ?? []) {
    if (!functions.has(required)) {
      return {
        ok: false,
        hardCoded: false,
        failure: `la fonction ${required} est attendue ici.`
      };
    }
  }

  for (const forbidden of check.forbiddenFunctions ?? []) {
    if (functions.has(forbidden)) {
      return {
        ok: false,
        hardCoded: false,
        failure: `la fonction ${forbidden} n'a pas sa place dans ce calcul.`
      };
    }
  }

  for (const perturbation of spec.perturbations) {
    const target = normalizeCellRef(check.cell);
    const expected = perturbation.expected[target];

    if (expected === undefined) {
      continue;
    }

    const evaluatedUnder = computeCellValue(spec, check, learnerInput, perturbation, byCell);

    if (!valueMatches(evaluatedUnder.value, check, expected)) {
      return {
        ok: false,
        hardCoded: false,
        failure: `si ${perturbation.label}, la formule devrait donner ${expected}${
          check.unit ? ` ${check.unit}` : ""
        } et donne ${formatScalar(evaluatedUnder.value)}.`
      };
    }
  }

  return { ok: true, hardCoded: false, failure: null };
}

function gradeCheck(
  spec: FormulaSpreadsheetSpec,
  check: FormulaCellCheck,
  submission: SpreadsheetSubmission,
  byCell: ReadonlyMap<string, FormulaCellCheck>,
  feedback: StructuredFeedback,
  criteria: CriterionResult[]
): void {
  const target = normalizeCellRef(check.cell);
  const submitted = Object.entries(submission?.cells ?? {}).find(
    ([cell]) => normalizeCellRef(cell) === target
  )?.[1];

  const valuePoints = round2(check.points * VALUE_SHARE);
  const methodPoints = round2(check.points * (1 - VALUE_SHARE));
  const unit = check.unit ? ` ${check.unit}` : "";

  const miss = (justification: string): void => {
    criteria.push(
      {
        id: `${target}-value`,
        label: `${check.cell} · ${check.label}`,
        maxPoints: valuePoints,
        awardedPoints: 0,
        outcome: "missed",
        justification
      },
      {
        id: `${target}-method`,
        label: `${check.cell} · méthode`,
        maxPoints: methodPoints,
        awardedPoints: 0,
        outcome: "missed",
        justification: check.formulaHint ?? justification
      }
    );
  };

  // The learner answers with a formula; a bare value is accepted and graded as
  // the literal it is — it can earn the result marks, never the method marks.
  const rawFormula = submitted?.formula?.trim();
  const input: WorkbookCellInput | null =
    rawFormula && rawFormula !== ""
      ? rawFormula.startsWith("=")
        ? rawFormula
        : `=${rawFormula}`
      : typeof submitted?.value === "number" && Number.isFinite(submitted.value)
        ? submitted.value
        : null;

  if (input === null) {
    feedback.missing.push(`${check.cell} — ${check.label} : aucune formule saisie.`);
    miss("Aucune formule saisie.");
    return;
  }

  const evaluated = computeCellValue(spec, check, input, null, byCell);

  if (evaluated.formula && evaluated.formula.parseError) {
    feedback.reasoningErrors.push(
      `${check.cell} : formule illisible — ${evaluated.formula.parseError}`
    );
    miss(`Formule illisible : ${evaluated.formula.parseError}`);
    return;
  }

  // --- Result ---------------------------------------------------------------

  const value = evaluated.value;
  const valueOk = valueMatches(value, check, check.expectedValue);
  const shown = formatScalar(value);

  if (valueOk) {
    feedback.correct.push(`${check.cell} — ${check.label} : ${shown}${unit}.`);
  } else if (isSpreadsheetError(value)) {
    feedback.calculationErrors.push(
      `${check.cell} — ${check.label} : la formule renvoie ${value.code} (${value.message})`
    );
  } else {
    feedback.calculationErrors.push(
      `${check.cell} — ${check.label} : ${shown}${unit} au lieu de ${check.expectedValue}${unit}.`
    );
  }

  criteria.push({
    id: `${target}-value`,
    label: `${check.cell} · ${check.label}`,
    maxPoints: valuePoints,
    awardedPoints: valueOk ? valuePoints : 0,
    outcome: valueOk ? "met" : "missed",
    justification: valueOk
      ? `Résultat calculé : ${shown}${unit}.`
      : isSpreadsheetError(value)
        ? `La formule renvoie ${value.code}.`
        : `Attendu ${check.expectedValue}${unit}, calculé ${shown}${unit}.`
  });

  // --- Method ---------------------------------------------------------------

  const method = checkMethod(spec, check, input, evaluated, byCell);

  if (method.ok) {
    feedback.correct.push(`${check.cell} : la formule résiste au changement des données.`);
  } else {
    // A hard-coded result is a method error whatever the exercise is about:
    // the learner applied no rule at all. Only a genuinely wrong method is
    // routed by `errorKind`, as the pattern evaluator already did.
    const bucket =
      !method.hardCoded && check.errorKind === "accounting-treatment"
        ? feedback.accountingTreatmentErrors
        : feedback.reasoningErrors;

    bucket.push(`${check.cell} : ${method.failure}`);
  }

  criteria.push({
    id: `${target}-method`,
    label: `${check.cell} · méthode`,
    maxPoints: methodPoints,
    awardedPoints: method.ok ? methodPoints : 0,
    outcome: method.ok ? "met" : "missed",
    justification: method.ok
      ? "La formule référence les données et reste juste quand elles changent."
      : (check.formulaHint ?? `Méthode : ${method.failure}`)
  });
}

export const spreadsheetFormulaEvaluator: Evaluator<FormulaSpreadsheetSpec, SpreadsheetSubmission> =
  {
    type: "spreadsheet_formula",
    version: "spreadsheet_formula@1",

    assertValidSpec(spec) {
      if (!spec || typeof spec !== "object") {
        throw new InvalidEvaluationSpecError("spreadsheet_formula: spec must be an object.");
      }

      const workbookEntries = Object.entries(spec.workbook ?? {});

      if (workbookEntries.length === 0) {
        throw new InvalidEvaluationSpecError(
          "spreadsheet_formula: the workbook must hold at least one given cell."
        );
      }

      for (const [key, value] of workbookEntries) {
        if (!isValidCellKey(key)) {
          throw new InvalidEvaluationSpecError(
            `spreadsheet_formula: workbook key "${key}" is not a cell reference.`
          );
        }

        if (typeof value === "number" && !Number.isFinite(value)) {
          throw new InvalidEvaluationSpecError(
            `spreadsheet_formula: workbook cell "${key}" holds a non-finite number.`
          );
        }

        if (typeof value === "string" && value.trim().startsWith("=")) {
          // Given cells are data. A formula among them would make the expected
          // values depend on the engine instead of the author, and a perturbed
          // scenario ambiguous about what it overrides.
          throw new InvalidEvaluationSpecError(
            `spreadsheet_formula: workbook cell "${key}" must be a value, not a formula.`
          );
        }
      }

      const workbookKeys = new Set(
        workbookEntries.map(([key]) => normalizeCellRef(key))
      );

      if (!Array.isArray(spec.checks) || spec.checks.length === 0) {
        throw new InvalidEvaluationSpecError(
          "spreadsheet_formula: at least one cell check is required."
        );
      }

      const checkCells = new Set<string>();

      for (const check of spec.checks) {
        const cell = normalizeCellRef(check.cell ?? "");

        if (!isValidCellKey(cell)) {
          throw new InvalidEvaluationSpecError(
            `spreadsheet_formula: "${check.cell}" is not an A1-style cell reference.`
          );
        }

        if (checkCells.has(cell)) {
          throw new InvalidEvaluationSpecError(
            `spreadsheet_formula: duplicate check for cell "${cell}".`
          );
        }

        if (workbookKeys.has(cell)) {
          throw new InvalidEvaluationSpecError(
            `spreadsheet_formula: "${cell}" is both a given cell and a checked cell.`
          );
        }

        checkCells.add(cell);

        if (!Number.isFinite(check.points) || check.points <= 0) {
          throw new InvalidEvaluationSpecError(
            `spreadsheet_formula: "${cell}" must carry a finite number of points greater than zero.`
          );
        }

        if (typeof check.expectedValue === "number" && !Number.isFinite(check.expectedValue)) {
          throw new InvalidEvaluationSpecError(
            `spreadsheet_formula: "${cell}" has a non-finite expected value.`
          );
        }

        if (typeof check.expectedValue === "string" && check.expectedValue.trim() === "") {
          throw new InvalidEvaluationSpecError(
            `spreadsheet_formula: "${cell}" has an empty expected text.`
          );
        }

        for (const [name, tolerance] of [
          ["tolerancePct", check.tolerancePct],
          ["toleranceAbs", check.toleranceAbs]
        ] as const) {
          if (typeof tolerance === "number" && (!Number.isFinite(tolerance) || tolerance < 0)) {
            throw new InvalidEvaluationSpecError(
              `spreadsheet_formula: "${cell}" has an invalid ${name}; it must be finite and non-negative.`
            );
          }
        }

        for (const ref of [...(check.requiredRefs ?? []), ...(check.forbiddenRefs ?? [])]) {
          if (!isValidRefConstraint(ref)) {
            throw new InvalidEvaluationSpecError(
              `spreadsheet_formula: "${cell}" constrains "${ref}", which is neither a cell nor a range.`
            );
          }
        }

        for (const name of [
          ...(check.requiredFunctions ?? []),
          ...(check.forbiddenFunctions ?? [])
        ]) {
          if (!CANONICAL_FUNCTIONS.includes(name)) {
            throw new InvalidEvaluationSpecError(
              `spreadsheet_formula: "${cell}" names an unsupported function "${name}".`
            );
          }
        }
      }

      if (!Array.isArray(spec.perturbations) || spec.perturbations.length === 0) {
        throw new InvalidEvaluationSpecError(
          "spreadsheet_formula: at least one perturbation is required — it is what tells a formula from a typed-in result."
        );
      }

      const names = new Set<string>();
      const coveredCells = new Set<string>();

      for (const perturbation of spec.perturbations) {
        if (!perturbation.name || names.has(perturbation.name)) {
          throw new InvalidEvaluationSpecError(
            "spreadsheet_formula: every perturbation needs a unique name."
          );
        }

        names.add(perturbation.name);

        if (!perturbation.label || perturbation.label.trim() === "") {
          throw new InvalidEvaluationSpecError(
            `spreadsheet_formula: perturbation "${perturbation.name}" needs a French label.`
          );
        }

        const overrides = Object.entries(perturbation.overrides ?? {});

        if (overrides.length === 0) {
          throw new InvalidEvaluationSpecError(
            `spreadsheet_formula: perturbation "${perturbation.name}" overrides nothing.`
          );
        }

        for (const [key, value] of overrides) {
          if (!workbookKeys.has(normalizeCellRef(key))) {
            throw new InvalidEvaluationSpecError(
              `spreadsheet_formula: perturbation "${perturbation.name}" overrides "${key}", which is not a given cell.`
            );
          }

          if (typeof value === "number" && !Number.isFinite(value)) {
            throw new InvalidEvaluationSpecError(
              `spreadsheet_formula: perturbation "${perturbation.name}" sets "${key}" to a non-finite number.`
            );
          }
        }

        for (const [cell, expected] of Object.entries(perturbation.expected ?? {})) {
          if (!checkCells.has(normalizeCellRef(cell))) {
            throw new InvalidEvaluationSpecError(
              `spreadsheet_formula: perturbation "${perturbation.name}" expects a value for "${cell}", which is not a checked cell.`
            );
          }

          if (typeof expected === "number" && !Number.isFinite(expected)) {
            throw new InvalidEvaluationSpecError(
              `spreadsheet_formula: perturbation "${perturbation.name}" expects a non-finite value for "${cell}".`
            );
          }

          coveredCells.add(normalizeCellRef(cell));
        }
      }

      for (const cell of checkCells) {
        if (!coveredCells.has(cell)) {
          // A check no perturbation covers would accept a hard-coded result's
          // method by silence. Coverage is the discipline, so it is enforced.
          throw new InvalidEvaluationSpecError(
            `spreadsheet_formula: no perturbation states the expected value of "${cell}"; a typed-in result would go undetected.`
          );
        }
      }
    },

    evaluate(spec, submission): EvaluationResult {
      spreadsheetFormulaEvaluator.assertValidSpec(spec);

      const feedback = emptyFeedback();
      const criteria: CriterionResult[] = [];
      const byCell = new Map<string, FormulaCellCheck>(
        spec.checks.map((check) => [normalizeCellRef(check.cell), check])
      );

      for (const check of spec.checks) {
        gradeCheck(spec, check, submission, byCell, feedback, criteria);
      }

      const met = criteria.filter((criterion) => criterion.outcome === "met").length;

      if (met > 0 && met < criteria.length) {
        feedback.partial.push(`${met}/${criteria.length} contrôles satisfaits.`);
      }

      return buildResult({
        evaluationType: "spreadsheet_formula",
        evaluatorVersion: spreadsheetFormulaEvaluator.version,
        criteria,
        feedback
      });
    }
  };
