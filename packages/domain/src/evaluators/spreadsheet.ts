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
 * Spreadsheet cells: a result, and optionally the shape of the formula that
 * should have produced it.
 *
 * THIS IS NOT A SPREADSHEET ENGINE, and the distinction is the whole design.
 * Nothing here parses, resolves or *computes* a formula: there is no cell
 * dependency graph, no recalculation, no function library. The learner types the
 * figure they arrived at, and — where the exercise asks for it — the formula
 * they would write. Those are checked as two separate things.
 *
 * WHY THEY ARE SEPARATE CRITERIA. "Got the right number" and "got it a way that
 * survives the data changing" are different skills, and a finance lab exists to
 * teach the second. A learner who computes 42 on a calculator and types it in
 * has the value and not the method; one who writes `=SUM(B2:B13)` over the wrong
 * range has the method and not the value. Collapsing them into one mark would
 * make those two indistinguishable, so each cell can carry a value check, a
 * formula check, or both, and each is scored on its own.
 *
 * FORMULA CHECKING IS PATTERN MATCHING, deliberately. `requiredFormulaPattern`
 * is a regular expression tested against the learner's normalised formula text.
 * That accepts `=B4-B5` and `=B4 - B5` alike, and rejects a hard-coded `=37500`,
 * which is exactly the discrimination worth making at this level. What it cannot
 * do is judge an equivalent formula the author did not anticipate — a real
 * limitation, recorded in `docs/adr/006-excel-finance-lab.md` rather than papered
 * over, and the reason a value check normally accompanies it.
 */

export type CellErrorKind = "calculation" | "method";

export interface CellCheck {
  /** A1-style reference, e.g. "B12". Uppercased when compared. */
  cell: string;
  label: string;
  points: number;
  /** The figure the cell must hold. Omit for a formula-only check. */
  expectedValue?: number;
  /** Fraction, not percent: 0.01 means 1%. */
  tolerancePct?: number;
  toleranceAbs?: number;
  /**
   * Source of a regular expression the formula must match. Stored as a string
   * rather than a RegExp so a specification stays serialisable to JSONB.
   */
  requiredFormulaPattern?: string;
  /** Shown when the formula is missing or does not match. Never before. */
  formulaHint?: string;
  unit?: string;
}

export interface SpreadsheetSpec {
  checks: CellCheck[];
}

export interface SpreadsheetCellSubmission {
  value?: number;
  formula?: string;
}

export interface SpreadsheetSubmission {
  cells: Record<string, SpreadsheetCellSubmission>;
}

const DEFAULT_TOLERANCE_PCT = 0.0001;

/** How a cell's points split when it carries both a value and a formula check. */
const VALUE_SHARE = 0.6;

export function normalizeCellRef(cell: string): string {
  return cell.trim().toUpperCase().replace(/\$/g, "");
}

/**
 * Normalises a formula for comparison: uppercase, no whitespace, a leading `=`
 * whether or not the learner typed one, and no absolute-reference `$`.
 *
 * Making `$` insignificant is a judgement call. Absolute references matter when
 * a formula is copied across cells, and no exercise in this lab asks for that —
 * so failing somebody for writing `$B$4` where the author wrote `B4` would be
 * marking a distinction the exercise never taught.
 */
export function normalizeFormula(formula: string): string {
  const trimmed = formula.trim().toUpperCase().replace(/\s+/g, "").replace(/\$/g, "");

  if (trimmed === "") {
    return "";
  }

  return trimmed.startsWith("=") ? trimmed : `=${trimmed}`;
}

function valueMatches(actual: number, check: CellCheck): boolean {
  if (!Number.isFinite(actual) || typeof check.expectedValue !== "number") {
    return false;
  }

  const diff = Math.abs(actual - check.expectedValue);

  if (typeof check.toleranceAbs === "number" && diff <= check.toleranceAbs) {
    return true;
  }

  const pct =
    check.tolerancePct ?? (typeof check.toleranceAbs === "number" ? undefined : DEFAULT_TOLERANCE_PCT);

  if (typeof pct !== "number") {
    return false;
  }

  // Relative to the expected magnitude, with a floor of 1 so a tolerance stays
  // meaningful when the expected value is zero — a real case here, since a
  // budget variance is legitimately 0.
  return diff <= Math.max(Math.abs(check.expectedValue), 1) * pct;
}

/**
 * Compiles an authored pattern.
 *
 * Anchored at both ends so a pattern describes the whole formula: without it,
 * `SUM\(B2:B13\)` would also accept `=SUM(B2:B13)+999`, which is precisely the
 * kind of near-miss the check exists to catch.
 */
export function compileFormulaPattern(source: string): RegExp {
  return new RegExp(`^${source}$`);
}

function checkPoints(check: CellCheck): { value: number; formula: number } {
  const hasValue = typeof check.expectedValue === "number";
  const hasFormula = typeof check.requiredFormulaPattern === "string";

  if (hasValue && hasFormula) {
    return {
      value: round2(check.points * VALUE_SHARE),
      formula: round2(check.points * (1 - VALUE_SHARE))
    };
  }

  return hasValue ? { value: check.points, formula: 0 } : { value: 0, formula: check.points };
}

function gradeValue(
  check: CellCheck,
  submitted: SpreadsheetCellSubmission | undefined,
  points: number,
  feedback: StructuredFeedback
): CriterionResult {
  const actual = submitted?.value;
  const unit = check.unit ? ` ${check.unit}` : "";

  if (typeof actual !== "number") {
    feedback.missing.push(`${check.cell} — ${check.label} : cellule vide.`);

    return {
      id: `${normalizeCellRef(check.cell)}-value`,
      label: `${check.cell} · ${check.label}`,
      maxPoints: points,
      awardedPoints: 0,
      outcome: "missed",
      justification: "Aucune valeur saisie."
    };
  }

  const ok = valueMatches(actual, check);

  if (ok) {
    feedback.correct.push(`${check.cell} — ${check.label} : ${actual}${unit}.`);
  } else {
    feedback.calculationErrors.push(
      `${check.cell} — ${check.label} : ${actual}${unit} au lieu de ${check.expectedValue}${unit}.`
    );
  }

  return {
    id: `${normalizeCellRef(check.cell)}-value`,
    label: `${check.cell} · ${check.label}`,
    maxPoints: points,
    awardedPoints: ok ? points : 0,
    outcome: ok ? "met" : "missed",
    justification: ok ? `Valeur exacte (${actual}${unit}).` : `Attendu ${check.expectedValue}${unit}.`
  };
}

function gradeFormula(
  check: CellCheck,
  submitted: SpreadsheetCellSubmission | undefined,
  points: number,
  feedback: StructuredFeedback
): CriterionResult {
  const id = `${normalizeCellRef(check.cell)}-formula`;
  const label = `${check.cell} · formule`;
  const formula = normalizeFormula(submitted?.formula ?? "");

  if (formula === "") {
    feedback.missing.push(`${check.cell} : aucune formule saisie.`);

    return {
      id,
      label,
      maxPoints: points,
      awardedPoints: 0,
      outcome: "missed",
      justification: check.formulaHint ?? "Aucune formule saisie."
    };
  }

  const ok = compileFormulaPattern(check.requiredFormulaPattern as string).test(formula);

  if (ok) {
    feedback.correct.push(`${check.cell} : formule conforme (${formula}).`);
  } else {
    // A hard-coded result is the single most common wrong answer here, and it is
    // worth naming rather than reporting as a generic mismatch: it is a method
    // error, not an arithmetic one.
    const hardCoded = /^=-?[\d.,]+$/.test(formula);

    feedback.reasoningErrors.push(
      hardCoded
        ? `${check.cell} : le résultat est saisi en dur (${formula}). Une formule doit référencer les cellules, sinon elle ne suit pas les données.`
        : `${check.cell} : la formule ${formula} ne correspond pas au calcul attendu.`
    );
  }

  return {
    id,
    label,
    maxPoints: points,
    awardedPoints: ok ? points : 0,
    outcome: ok ? "met" : "missed",
    justification: ok ? `Formule conforme : ${formula}.` : (check.formulaHint ?? `Formule inattendue : ${formula}.`)
  };
}

export const spreadsheetEvaluator: Evaluator<SpreadsheetSpec, SpreadsheetSubmission> = {
  type: "spreadsheet",
  version: "spreadsheet@1",

  assertValidSpec(spec) {
    if (!Array.isArray(spec?.checks) || spec.checks.length === 0) {
      throw new InvalidEvaluationSpecError("spreadsheet: at least one cell check is required.");
    }

    const seen = new Set<string>();

    for (const check of spec.checks) {
      const cell = normalizeCellRef(check.cell ?? "");

      if (!/^[A-Z]+\d+$/.test(cell)) {
        throw new InvalidEvaluationSpecError(
          `spreadsheet: "${check.cell}" is not an A1-style cell reference.`
        );
      }

      if (seen.has(cell)) {
        // Two checks on one cell would make the criteria ids collide and the
        // feedback ambiguous about which expectation failed.
        throw new InvalidEvaluationSpecError(`spreadsheet: duplicate check for cell "${cell}".`);
      }

      seen.add(cell);

      if (check.points <= 0) {
        throw new InvalidEvaluationSpecError(`spreadsheet: "${cell}" must carry positive points.`);
      }

      const hasValue = typeof check.expectedValue === "number";
      const hasFormula = typeof check.requiredFormulaPattern === "string";

      if (!hasValue && !hasFormula) {
        // A check that expects neither would award its points to every
        // submission, including an empty one.
        throw new InvalidEvaluationSpecError(
          `spreadsheet: "${cell}" declares neither an expected value nor a formula pattern.`
        );
      }

      if (hasValue && !Number.isFinite(check.expectedValue)) {
        throw new InvalidEvaluationSpecError(`spreadsheet: "${cell}" has a non-finite expected value.`);
      }

      if (hasFormula) {
        try {
          compileFormulaPattern(check.requiredFormulaPattern as string);
        } catch {
          throw new InvalidEvaluationSpecError(
            `spreadsheet: "${cell}" has an invalid formula pattern.`
          );
        }
      }
    }
  },

  evaluate(spec, submission): EvaluationResult {
    spreadsheetEvaluator.assertValidSpec(spec);

    const feedback = emptyFeedback();
    const criteria: CriterionResult[] = [];
    // Normalised once so a learner writing "b12" reaches the check on "B12".
    const cells = new Map<string, SpreadsheetCellSubmission>(
      Object.entries(submission?.cells ?? {}).map(([cell, entry]) => [normalizeCellRef(cell), entry])
    );

    for (const check of spec.checks) {
      const submitted = cells.get(normalizeCellRef(check.cell));
      const points = checkPoints(check);

      if (typeof check.expectedValue === "number") {
        criteria.push(gradeValue(check, submitted, points.value, feedback));
      }

      if (typeof check.requiredFormulaPattern === "string") {
        criteria.push(gradeFormula(check, submitted, points.formula, feedback));
      }
    }

    const partial = criteria.filter((criterion) => criterion.outcome === "met").length;

    if (partial > 0 && partial < criteria.length) {
      feedback.partial.push(`${partial}/${criteria.length} contrôles satisfaits.`);
    }

    return buildResult({
      evaluationType: "spreadsheet",
      evaluatorVersion: spreadsheetEvaluator.version,
      criteria,
      feedback
    });
  }
};
