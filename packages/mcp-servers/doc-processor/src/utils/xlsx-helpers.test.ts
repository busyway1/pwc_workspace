import { describe, expect, test } from "bun:test";
import {
  detectHeaders,
  toMarkdownTable,
  filterHidden,
  formatCellValue,
} from "./xlsx-helpers.js";
import type { WorkSheet, CellObject } from "xlsx";

describe("detectHeaders", () => {
  test("detects header row where >50% cells are non-empty strings", () => {
    const rows: (string | number | null)[][] = [
      ["Name", "Age", "City"],
      ["Kim", 30, "Seoul"],
    ];
    const result = detectHeaders(rows);
    expect(result.headerRowIndex).toBe(0);
    expect(result.headers).toEqual(["Name", "Age", "City"]);
  });

  test("skips empty rows to find header", () => {
    const rows: (string | number | null)[][] = [
      [null, null, null],
      ["Name", "Department", "Amount"],
      ["Kim", "Finance", 1000],
    ];
    const result = detectHeaders(rows);
    expect(result.headerRowIndex).toBe(1);
    expect(result.headers).toEqual(["Name", "Department", "Amount"]);
  });

  test("falls back to first row if no good header found", () => {
    const rows: (string | number | null)[][] = [
      [1, 2, 3],
      [4, 5, 6],
    ];
    const result = detectHeaders(rows);
    expect(result.headerRowIndex).toBe(0);
    expect(result.headers).toEqual(["1", "2", "3"]);
  });

  test("returns empty headers for empty rows", () => {
    const result = detectHeaders([]);
    expect(result.headers).toEqual([]);
    expect(result.headerRowIndex).toBe(0);
  });

  test("trims header values", () => {
    const rows: (string | number | null)[][] = [["  Name  ", " Age ", "City"]];
    const result = detectHeaders(rows);
    expect(result.headers).toEqual(["Name", "Age", "City"]);
  });
});

describe("toMarkdownTable", () => {
  test("generates valid markdown table", () => {
    const headers = ["Name", "Value"];
    const rows: (string | number | null)[][] = [
      ["A", 1],
      ["B", 2],
    ];
    const result = toMarkdownTable(headers, rows);
    const lines = result.split("\n");
    expect(lines).toHaveLength(4); // header + separator + 2 data rows
    expect(lines[0]).toBe("| Name | Value |");
    expect(lines[1]).toBe("| --- | --- |");
    expect(lines[2]).toBe("| A | 1 |");
  });

  test("returns empty string for no headers", () => {
    expect(toMarkdownTable([], [])).toBe("");
  });

  test("escapes pipe characters in cells", () => {
    const headers = ["Col"];
    const rows: (string | number | null)[][] = [["A|B"]];
    const result = toMarkdownTable(headers, rows);
    expect(result).toContain("A\\|B");
  });

  test("handles null values", () => {
    const headers = ["A", "B"];
    const rows: (string | number | null)[][] = [[null, "val"]];
    const result = toMarkdownTable(headers, rows);
    expect(result).toContain("|  | val |");
  });

  test("handles rows shorter than headers", () => {
    const headers = ["A", "B", "C"];
    const rows: (string | number | null)[][] = [["only"]];
    const result = toMarkdownTable(headers, rows);
    expect(result).toContain("| only |  |  |");
  });
});

describe("filterHidden", () => {
  test("returns empty arrays when no hidden rows/cols", () => {
    const ws: WorkSheet = { "!ref": "A1:B2" } as WorkSheet;
    const result = filterHidden(ws);
    expect(result.hiddenRows).toEqual([]);
    expect(result.hiddenColumns).toEqual([]);
  });

  test("detects hidden rows", () => {
    const ws: WorkSheet = {
      "!ref": "A1:A3",
      "!rows": [undefined, { hidden: true }, undefined] as any,
    } as WorkSheet;
    const result = filterHidden(ws);
    expect(result.hiddenRows).toEqual([1]);
  });

  test("detects hidden columns", () => {
    const ws: WorkSheet = {
      "!ref": "A1:C1",
      "!cols": [undefined, undefined, { hidden: true }] as any,
    } as WorkSheet;
    const result = filterHidden(ws);
    expect(result.hiddenColumns).toEqual([2]);
  });
});

describe("formatCellValue", () => {
  test("returns null for undefined cell", () => {
    expect(formatCellValue(undefined)).toBeNull();
  });

  test("returns number for numeric cell", () => {
    const cell = { t: "n", v: 42 } as CellObject;
    expect(formatCellValue(cell)).toBe(42);
  });

  test("returns TRUE/FALSE for boolean cell", () => {
    expect(formatCellValue({ t: "b", v: true } as CellObject)).toBe("TRUE");
    expect(formatCellValue({ t: "b", v: false } as CellObject)).toBe("FALSE");
  });

  test("returns formatted value (w) when available", () => {
    const cell = { t: "s", v: "raw", w: "formatted" } as CellObject;
    expect(formatCellValue(cell)).toBe("formatted");
  });

  test("returns string of raw value when no w", () => {
    const cell = { t: "s", v: "hello" } as CellObject;
    expect(formatCellValue(cell)).toBe("hello");
  });

  test("returns null for cell with no v or w", () => {
    const cell = { t: "s" } as CellObject;
    expect(formatCellValue(cell)).toBeNull();
  });

  test("formats date cell as ISO date string", () => {
    const cell = { t: "d", v: new Date("2024-01-15") } as CellObject;
    expect(formatCellValue(cell)).toBe("2024-01-15");
  });
});
