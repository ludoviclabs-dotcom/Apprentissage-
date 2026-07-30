import { normalizeForMatching } from "../text";
import {
  InvalidEvaluationSpecError,
  buildResult,
  emptyFeedback,
  outcomeFor,
  round2,
  type CriterionResult,
  type Evaluator,
  type EvaluationResult
} from "./types";

/**
 * Double-entry bookkeeping.
 *
 * Four things are checked separately, because they are four different mistakes
 * and a learner needs to know which one they made: the accounts used, the
 * direction of each posting, the amounts, and whether the entry balances.
 *
 * Balance is checked on the entry as submitted, independently of whether the
 * accounts are the ones expected. An entry can be internally consistent and still
 * wrong, and it can use the right accounts and not balance; conflating the two
 * hides the actual error.
 */

export interface JournalLineSpec {
  account: string;
  /** Exactly one of the two is non-zero on a well-formed line. */
  debit?: number;
  credit?: number;
  label?: string;
  /** Accepted synonyms for the account, e.g. a sub-account. */
  alsoAccept?: string[];
}

export interface JournalEntrySpec {
  expectedLines: JournalLineSpec[];
  /** Cents. Amounts within this of the expectation are accepted. */
  amountToleranceAbs?: number;
  /** When false, a line the specification does not expect costs points. */
  allowExtraLines?: boolean;
  points?: {
    accounts?: number;
    direction?: number;
    amounts?: number;
    balance?: number;
  };
}

export interface JournalLineSubmission {
  account: string;
  debit?: number;
  credit?: number;
}

export interface JournalEntrySubmission {
  lines: JournalLineSubmission[];
}

const DEFAULT_POINTS = { accounts: 4, direction: 3, amounts: 4, balance: 2 } as const;
const DEFAULT_AMOUNT_TOLERANCE = 0.01;

function amountOf(line: { debit?: number; credit?: number }): { side: "debit" | "credit" | "none"; value: number } {
  const debit = line.debit ?? 0;
  const credit = line.credit ?? 0;

  if (debit > 0 && credit > 0) {
    // A line posted on both sides is malformed; treat it as directionless so it
    // fails the direction check rather than silently picking one side.
    return { side: "none", value: debit + credit };
  }

  if (debit > 0) {
    return { side: "debit", value: debit };
  }

  if (credit > 0) {
    return { side: "credit", value: credit };
  }

  return { side: "none", value: 0 };
}

/** Account codes are compared on their normalised form; "411" and "411 Clients" match. */
function accountMatches(expected: JournalLineSpec, actual: string): boolean {
  const candidate = normalizeForMatching(actual);
  const accepted = [expected.account, ...(expected.alsoAccept ?? [])].map(normalizeForMatching);

  return accepted.some((value) => candidate === value || candidate.startsWith(`${value} `));
}

export function totalsOf(lines: JournalLineSubmission[]): { debit: number; credit: number } {
  return lines.reduce(
    (totals, line) => ({
      debit: round2(totals.debit + (line.debit ?? 0)),
      credit: round2(totals.credit + (line.credit ?? 0))
    }),
    { debit: 0, credit: 0 }
  );
}

export function isBalanced(lines: JournalLineSubmission[], tolerance = DEFAULT_AMOUNT_TOLERANCE): boolean {
  const totals = totalsOf(lines);

  // Round the difference before comparing: |100 − 100.01| is 0.010000000000005
  // in IEEE-754, so an entry exactly one cent apart would fail a one-cent
  // tolerance. Money comparisons have to be made at the precision of the money.
  return Math.abs(round2(totals.debit - totals.credit)) <= tolerance;
}

/** Same rounding discipline for comparing an individual amount. */
function amountsMatch(actual: number, expected: number, tolerance: number): boolean {
  return Math.abs(round2(actual - expected)) <= tolerance;
}

export const journalEntryEvaluator: Evaluator<JournalEntrySpec, JournalEntrySubmission> = {
  type: "journal_entry",
  version: "journal_entry@1",

  assertValidSpec(spec) {
    if (spec.expectedLines.length === 0) {
      throw new InvalidEvaluationSpecError("journal_entry: at least one expected line is required.");
    }

    for (const line of spec.expectedLines) {
      if (!line.account.trim()) {
        throw new InvalidEvaluationSpecError("journal_entry: an expected line has no account.");
      }

      const { side } = amountOf(line);

      if (side === "none") {
        throw new InvalidEvaluationSpecError(
          `journal_entry: expected line "${line.account}" must post to exactly one side.`
        );
      }
    }

    // An unbalanced expectation would teach the wrong thing and make the balance
    // criterion unsatisfiable.
    if (!isBalanced(spec.expectedLines, spec.amountToleranceAbs ?? DEFAULT_AMOUNT_TOLERANCE)) {
      const totals = totalsOf(spec.expectedLines);
      throw new InvalidEvaluationSpecError(
        `journal_entry: the expected entry does not balance (débit ${totals.debit}, crédit ${totals.credit}).`
      );
    }
  },

  evaluate(spec, submission): EvaluationResult {
    journalEntryEvaluator.assertValidSpec(spec);

    const points = { ...DEFAULT_POINTS, ...spec.points };
    const tolerance = spec.amountToleranceAbs ?? DEFAULT_AMOUNT_TOLERANCE;
    const feedback = emptyFeedback();

    const remaining = [...submission.lines];
    let accountHits = 0;
    let directionHits = 0;
    let amountHits = 0;

    for (const expected of spec.expectedLines) {
      const index = remaining.findIndex((line) => accountMatches(expected, line.account));

      if (index === -1) {
        feedback.accountingTreatmentErrors.push(`Compte manquant : ${expected.account}.`);
        feedback.missing.push(expected.label ?? expected.account);
        continue;
      }

      const [actual] = remaining.splice(index, 1);
      accountHits += 1;

      const expectedSide = amountOf(expected);
      const actualSide = amountOf(actual);

      const rightSide = actualSide.side === expectedSide.side;

      if (rightSide) {
        directionHits += 1;
      } else {
        feedback.accountingTreatmentErrors.push(
          `${expected.account} : sens inversé (${actualSide.side === "none" ? "aucun montant" : actualSide.side} au lieu de ${expectedSide.side}).`
        );
      }

      // Amounts count only on a line posted to the correct side. Crediting the
      // magnitude of a reversed line let a wholly inverted entry — the one
      // mistake double-entry exists to catch — keep three quarters of the marks.
      if (rightSide && amountsMatch(actualSide.value, expectedSide.value, tolerance)) {
        amountHits += 1;
      } else if (rightSide) {
        feedback.calculationErrors.push(
          `${expected.account} : montant ${actualSide.value} au lieu de ${expectedSide.value}.`
        );
      }
    }

    const allowExtra = spec.allowExtraLines ?? false;

    for (const extra of remaining) {
      if (allowExtra) {
        continue;
      }

      feedback.accountingTreatmentErrors.push(`Compte non attendu : ${extra.account}.`);
    }

    const expectedCount = spec.expectedLines.length;
    const extraPenalty = allowExtra ? 0 : remaining.length;
    const accountRatio = Math.max(0, (accountHits - extraPenalty) / expectedCount);
    const balanced = isBalanced(submission.lines, tolerance);

    if (!balanced) {
      const totals = totalsOf(submission.lines);
      feedback.calculationErrors.push(
        `L'écriture n'est pas équilibrée : débit ${totals.debit}, crédit ${totals.credit}.`
      );
    }

    if (accountHits > 0) {
      feedback.correct.push(`${accountHits}/${expectedCount} comptes correctement identifiés.`);
    }

    if (submission.lines.length === 0) {
      feedback.missing.push("Aucune ligne d'écriture saisie.");
    }

    const criteria: CriterionResult[] = [
      {
        id: "accounts",
        label: "Comptes utilisés",
        maxPoints: points.accounts,
        awardedPoints: round2(points.accounts * accountRatio),
        outcome: outcomeFor(round2(points.accounts * accountRatio), points.accounts),
        justification: `${accountHits}/${expectedCount} attendus${extraPenalty > 0 ? `, ${extraPenalty} en trop` : ""}.`
      },
      {
        id: "direction",
        label: "Sens débit/crédit",
        maxPoints: points.direction,
        awardedPoints: round2((points.direction * directionHits) / expectedCount),
        outcome: outcomeFor(directionHits, expectedCount),
        justification: `${directionHits}/${expectedCount} lignes au bon sens.`
      },
      {
        id: "amounts",
        label: "Montants",
        maxPoints: points.amounts,
        awardedPoints: round2((points.amounts * amountHits) / expectedCount),
        outcome: outcomeFor(amountHits, expectedCount),
        justification: `${amountHits}/${expectedCount} montants exacts.`
      },
      {
        id: "balance",
        label: "Équilibre",
        maxPoints: points.balance,
        awardedPoints: balanced ? points.balance : 0,
        outcome: balanced ? "met" : "missed",
        justification: balanced ? "Débit = crédit." : "Débit ≠ crédit."
      }
    ];

    return buildResult({
      evaluationType: "journal_entry",
      evaluatorVersion: journalEntryEvaluator.version,
      criteria,
      feedback
    });
  }
};
