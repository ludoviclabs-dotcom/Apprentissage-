import { describe, expect, it } from "vitest";
import {
  InvalidEvaluationSpecError,
  isBalanced,
  journalEntryEvaluator,
  totalsOf,
  type JournalEntrySpec
} from "../src";

/** Purchase with VAT: 607 debit 1000, 44566 debit 200, 401 credit 1200. */
const PURCHASE: JournalEntrySpec = {
  expectedLines: [
    { account: "607", debit: 1000, label: "Achats de marchandises" },
    { account: "44566", debit: 200, label: "TVA déductible" },
    { account: "401", credit: 1200, label: "Fournisseurs" }
  ]
};

const PERFECT = {
  lines: [
    { account: "607", debit: 1000 },
    { account: "44566", debit: 200 },
    { account: "401", credit: 1200 }
  ]
};

describe("totalsOf / isBalanced", () => {
  it("sums both sides", () => {
    expect(totalsOf(PERFECT.lines)).toEqual({ debit: 1200, credit: 1200 });
  });

  it("treats an entry within a cent as balanced", () => {
    expect(isBalanced([{ account: "1", debit: 100 }, { account: "2", credit: 100.01 }])).toBe(true);
    expect(isBalanced([{ account: "1", debit: 100 }, { account: "2", credit: 100.5 }])).toBe(false);
  });

  it("treats an empty entry as balanced, since zero equals zero", () => {
    expect(isBalanced([])).toBe(true);
  });
});

describe("journalEntryEvaluator.assertValidSpec", () => {
  it("accepts a balanced specification", () => {
    expect(() => journalEntryEvaluator.assertValidSpec(PURCHASE)).not.toThrow();
  });

  it("rejects a specification that does not balance", () => {
    // An unbalanced expectation would teach the wrong thing and make the balance
    // criterion unsatisfiable.
    expect(() =>
      journalEntryEvaluator.assertValidSpec({
        expectedLines: [
          { account: "607", debit: 1000 },
          { account: "401", credit: 900 }
        ]
      })
    ).toThrow(/does not balance/);
  });

  it("rejects a line with no side and a line with no account", () => {
    expect(() =>
      journalEntryEvaluator.assertValidSpec({ expectedLines: [{ account: "607" }] })
    ).toThrow(/exactly one side/);
    expect(() =>
      journalEntryEvaluator.assertValidSpec({ expectedLines: [{ account: "  ", debit: 10 }] })
    ).toThrow(/no account/);
  });

  it("rejects an empty specification", () => {
    expect(() => journalEntryEvaluator.assertValidSpec({ expectedLines: [] })).toThrow(
      InvalidEvaluationSpecError
    );
  });
});

describe("journalEntryEvaluator.evaluate", () => {
  it("awards full marks for the exact entry", () => {
    const result = journalEntryEvaluator.evaluate(PURCHASE, PERFECT);

    expect(result.score).toBe(20);
    expect(result.criteria.every((criterion) => criterion.outcome === "met")).toBe(true);
    expect(result.feedback.accountingTreatmentErrors).toHaveLength(0);
  });

  it("accepts an account written with its label", () => {
    const result = journalEntryEvaluator.evaluate(PURCHASE, {
      lines: [
        { account: "607 Achats de marchandises", debit: 1000 },
        { account: "44566 TVA déductible", debit: 200 },
        { account: "401 Fournisseurs", credit: 1200 }
      ]
    });

    expect(result.score).toBe(20);
  });

  it("ignores line order", () => {
    const reversed = { lines: [...PERFECT.lines].reverse() };

    expect(journalEntryEvaluator.evaluate(PURCHASE, reversed).score).toBe(20);
  });

  it("names a direction error as such, and does not credit the amount on that line", () => {
    // Debit and credit swapped on one line. The account is still recognised, and
    // the mistake is reported as a treatment error rather than an arithmetic one
    // — but a magnitude posted to the wrong side is not a correct amount, so it
    // earns nothing.
    const result = journalEntryEvaluator.evaluate(PURCHASE, {
      lines: [
        { account: "607", credit: 1000 },
        { account: "44566", debit: 200 },
        { account: "401", credit: 1200 }
      ]
    });

    const byId = Object.fromEntries(result.criteria.map((criterion) => [criterion.id, criterion]));

    expect(byId.accounts.outcome).toBe("met");
    expect(byId.direction.outcome).toBe("partial");
    expect(byId.amounts.outcome).toBe("partial");
    expect(byId.balance.outcome).toBe("missed");
    expect(result.feedback.accountingTreatmentErrors.some((message) => message.includes("607"))).toBe(true);
    // The learner is not told the amount is wrong, because it is not.
    expect(result.feedback.calculationErrors.some((message) => message.includes("607"))).toBe(false);
  });

  it("scores a wholly reversed entry as a failure", () => {
    // The mistake double-entry exists to catch must not keep most of the marks.
    const result = journalEntryEvaluator.evaluate(PURCHASE, {
      lines: [
        { account: "607", credit: 1000 },
        { account: "44566", credit: 200 },
        { account: "401", debit: 1200 }
      ]
    });

    expect(result.score).toBeLessThan(10);
  });

  it("separates an amount error from the treatment being right", () => {
    const result = journalEntryEvaluator.evaluate(PURCHASE, {
      lines: [
        { account: "607", debit: 900 },
        { account: "44566", debit: 200 },
        { account: "401", credit: 1100 }
      ]
    });

    const byId = Object.fromEntries(result.criteria.map((criterion) => [criterion.id, criterion]));

    expect(byId.accounts.outcome).toBe("met");
    expect(byId.direction.outcome).toBe("met");
    expect(byId.amounts.outcome).toBe("partial");
    // The entry still balances at 1100/1100, which is worth saying.
    expect(byId.balance.outcome).toBe("met");
    expect(result.feedback.calculationErrors.length).toBeGreaterThan(0);
  });

  it("reports an unbalanced entry as a calculation error", () => {
    const result = journalEntryEvaluator.evaluate(PURCHASE, {
      lines: [
        { account: "607", debit: 1000 },
        { account: "44566", debit: 200 },
        { account: "401", credit: 1000 }
      ]
    });

    expect(result.feedback.calculationErrors.some((message) => message.includes("équilibrée"))).toBe(true);
  });

  it("penalises an unexpected account by default", () => {
    const result = journalEntryEvaluator.evaluate(PURCHASE, {
      lines: [...PERFECT.lines, { account: "512", debit: 0, credit: 0 }]
    });

    expect(result.score).toBeLessThan(20);
    expect(result.feedback.accountingTreatmentErrors.some((message) => message.includes("512"))).toBe(true);
  });

  it("tolerates an extra account when the specification allows it", () => {
    const result = journalEntryEvaluator.evaluate(
      { ...PURCHASE, allowExtraLines: true },
      { lines: [...PERFECT.lines, { account: "512", debit: 0, credit: 0 }] }
    );

    expect(result.score).toBe(20);
  });

  it("scores an empty submission at zero without crashing", () => {
    const result = journalEntryEvaluator.evaluate(PURCHASE, { lines: [] });

    // Balance is the one criterion an empty entry satisfies: 0 = 0. Saying it
    // is met is honest; the other three carry the failure.
    const byId = Object.fromEntries(result.criteria.map((criterion) => [criterion.id, criterion]));
    expect(byId.accounts.awardedPoints).toBe(0);
    expect(byId.direction.awardedPoints).toBe(0);
    expect(byId.amounts.awardedPoints).toBe(0);
    expect(result.feedback.missing).toContain("Aucune ligne d'écriture saisie.");
  });

  it("treats a line posted on both sides as directionless", () => {
    const result = journalEntryEvaluator.evaluate(PURCHASE, {
      lines: [
        { account: "607", debit: 1000, credit: 1000 },
        { account: "44566", debit: 200 },
        { account: "401", credit: 1200 }
      ]
    });

    const direction = result.criteria.find((criterion) => criterion.id === "direction");
    expect(direction?.outcome).toBe("partial");
  });

  it("reports a missing account rather than silently rescaling", () => {
    const result = journalEntryEvaluator.evaluate(PURCHASE, {
      lines: [
        { account: "607", debit: 1000 },
        { account: "401", credit: 1000 }
      ]
    });

    expect(result.feedback.accountingTreatmentErrors.some((message) => message.includes("44566"))).toBe(true);
    expect(result.score).toBeLessThan(20);
  });

  it("accepts a declared synonym account", () => {
    const spec: JournalEntrySpec = {
      expectedLines: [
        { account: "607", debit: 1000, alsoAccept: ["6071"] },
        { account: "401", credit: 1000 }
      ]
    };

    const result = journalEntryEvaluator.evaluate(spec, {
      lines: [
        { account: "6071", debit: 1000 },
        { account: "401", credit: 1000 }
      ]
    });

    expect(result.score).toBe(20);
  });

  it("accepts a declared account variant with its label, without weakening other lines", () => {
    const spec: JournalEntrySpec = {
      expectedLines: [
        { account: "6815", debit: 14000, alsoAccept: ["681"], label: "Dotations" },
        { account: "1511", credit: 14000, label: "Provisions" }
      ]
    };

    const result = journalEntryEvaluator.evaluate(spec, {
      lines: [
        { account: "681 Dotations aux provisions", debit: 14000 },
        { account: "1511 Provision pour litige", credit: 14000 }
      ]
    });

    expect(result.score).toBe(20);
  });

  it("does not accept an undeclared neighbouring account as a variant", () => {
    const result = journalEntryEvaluator.evaluate(PURCHASE, {
      lines: [
        { account: "6072", debit: 1000 },
        { account: "44566", debit: 200 },
        { account: "401", credit: 1200 }
      ]
    });

    expect(result.criteria.find((criterion) => criterion.id === "accounts")?.outcome).not.toBe("met");
  });

  it("is deterministic", () => {
    expect(journalEntryEvaluator.evaluate(PURCHASE, PERFECT)).toEqual(
      journalEntryEvaluator.evaluate(PURCHASE, PERFECT)
    );
  });
});
