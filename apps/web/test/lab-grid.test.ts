import { describe, expect, it } from "vitest";
import {
  hasAnyEntry,
  parseCellNumber,
  toSpreadsheetCells,
  type LabCellValues
} from "@/components/forms/lab-grid";

/**
 * The grid's parsing boundary.
 *
 * Everything here is about not failing a learner for how they typed a figure —
 * the datasets and statements write amounts the French way, so the grid has to
 * read them that way.
 */

describe("parseCellNumber", () => {
  it("reads a plain number", () => {
    expect(parseCellNumber("600000")).toBe(600000);
  });

  it("reads a French-formatted amount", () => {
    expect(parseCellNumber("600 000")).toBe(600000);
    expect(parseCellNumber("37,5")).toBe(37.5);
    expect(parseCellNumber("1 200,50")).toBe(1200.5);
  });

  it("reads a non-breaking space, which is what a copy-paste produces", () => {
    // `toLocaleString("fr-FR")` emits U+202F or U+00A0 rather than a plain
    // space, so a figure pasted back out of the page must still parse.
    expect(parseCellNumber("600 000")).toBe(600000);
    expect(parseCellNumber("600 000")).toBe(600000);
  });

  it("reads a negative amount", () => {
    expect(parseCellNumber("-18 000")).toBe(-18000);
  });

  it("returns null for an empty or unreadable entry rather than zero", () => {
    // Zero is a legitimate answer — a budget variance of 0, for one — so an
    // empty box must never be submitted as one.
    expect(parseCellNumber("")).toBeNull();
    expect(parseCellNumber("   ")).toBeNull();
    expect(parseCellNumber("abc")).toBeNull();
    expect(parseCellNumber("1e3")).toBeNull();
    expect(parseCellNumber("0x10")).toBeNull();
    expect(parseCellNumber("1,2,3")).toBeNull();
    expect(parseCellNumber("0")).toBe(0);
  });
});

describe("toSpreadsheetCells", () => {
  it("drops a cell the learner never touched", () => {
    const values: LabCellValues = { B12: { value: "", formula: "" } };

    expect(toSpreadsheetCells(values)).toEqual({});
    expect(hasAnyEntry(values)).toBe(false);
  });

  it("sends a value without a formula, and a formula without a value", () => {
    const values: LabCellValues = {
      B12: { value: "600000", formula: "" },
      C12: { value: "", formula: "=B2+B3" }
    };

    expect(toSpreadsheetCells(values)).toEqual({
      B12: { value: 600000 },
      C12: { formula: "=B2+B3" }
    });
    expect(hasAnyEntry(values)).toBe(true);
  });

  it("sends both when both are typed, and trims the formula", () => {
    expect(
      toSpreadsheetCells({ B12: { value: "600 000", formula: "  =B2+B3  " } })
    ).toEqual({ B12: { value: 600000, formula: "=B2+B3" } });
  });

  it("keeps a zero value, which is a real answer", () => {
    expect(toSpreadsheetCells({ D5: { value: "0", formula: "" } })).toEqual({
      D5: { value: 0 }
    });
  });

  it("keeps a formula even when the value box holds something unreadable", () => {
    // The method still deserves its marks; the value check will report the miss.
    expect(toSpreadsheetCells({ B12: { value: "??", formula: "=B2+B3" } })).toEqual({
      B12: { formula: "=B2+B3" }
    });
  });
});
