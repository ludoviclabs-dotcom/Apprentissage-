import { describe, expect, it } from "vitest";
import { emptyJournal, parseAmount, toSubmissionLines, totalsOf } from "../components/forms/journal-entry-form";

describe("journal grid cell helpers", () => {
  it("parses French monetary input without coercing a JavaScript numeric literal", () => {
    expect(parseAmount("1 200,50")).toBe(1200.5);
    expect(parseAmount(`1${String.fromCharCode(0x00a0)}200,50`)).toBe(1200.5);

    for (const value of ["", "0x10", "1e3", "12,50 €", "-12", "12,5.0"]) {
      expect(parseAmount(value), value).toBeNull();
    }
  });

  it("keeps stable row identities while producing a clean submission and cent totals", () => {
    const [first, second] = emptyJournal(2);
    const lines = [
      { ...first, account: "607", debit: "1 200,10" },
      { ...second, account: "401", credit: "1 200,10" }
    ];

    expect(first.id).not.toBe(second.id);
    expect(toSubmissionLines(lines)).toEqual([
      { account: "607", debit: 1200.1 },
      { account: "401", credit: 1200.1 }
    ]);
    expect(totalsOf(lines)).toEqual({ debit: 1200.1, credit: 1200.1 });
  });
});
