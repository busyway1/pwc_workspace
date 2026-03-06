import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as XLSX from "xlsx";
import { parseXlsx } from "./parse-xlsx.js";

describe("parseXlsx", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "xlsx-test-"));
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function createTestXlsx(
    data: Record<string, (string | number | null)[][]>,
    filename = "test.xlsx",
  ): string {
    const wb = XLSX.utils.book_new();
    for (const [sheetName, rows] of Object.entries(data)) {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }
    const filePath = join(tmpDir, filename);
    // XLSX.writeFile doesn't work in Bun; use write() + writeFileSync instead
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    writeFileSync(filePath, buf);
    return filePath;
  }

  test("parses single sheet xlsx", async () => {
    const filePath = createTestXlsx({
      Sheet1: [
        ["Name", "Department", "Amount"],
        ["Kim", "Finance", 1000],
        ["Lee", "Legal", 2000],
      ],
    });

    const result = await parseXlsx({ filePath });
    expect(result.metadata.format).toBe("xlsx");
    expect(result.metadata.totalSheets).toBe(1);
    expect(result.content).toHaveLength(1);

    const sheet = result.content[0];
    if (sheet.type !== "spreadsheet") throw new Error("Expected spreadsheet");
    expect(sheet.headers).toEqual(["Name", "Department", "Amount"]);
    expect(sheet.rows).toHaveLength(2);
    expect(sheet.rows[0]["Name"]).toBe("Kim");
    expect(sheet.totalRows).toBe(2);
    expect(sheet.isTruncated).toBe(false);
  });

  test("parses multi-sheet xlsx", async () => {
    const filePath = createTestXlsx(
      {
        Finance: [
          ["Item", "Value"],
          ["Revenue", 100],
        ],
        Legal: [
          ["Case", "Status"],
          ["Case1", "Open"],
        ],
      },
      "multi.xlsx",
    );

    const result = await parseXlsx({ filePath });
    expect(result.metadata.totalSheets).toBe(2);
    expect(result.content).toHaveLength(2);
  });

  test("selects sheet by name", async () => {
    const filePath = createTestXlsx(
      {
        A: [["ColA"], ["a1"]],
        B: [["ColB"], ["b1"]],
      },
      "byname.xlsx",
    );

    const result = await parseXlsx({ filePath, sheetName: "B" });
    expect(result.content).toHaveLength(1);
    const sheet = result.content[0];
    if (sheet.type !== "spreadsheet") throw new Error("Expected spreadsheet");
    expect(sheet.sheetName).toBe("B");
    expect(sheet.headers).toEqual(["ColB"]);
  });

  test("selects sheet by index", async () => {
    const filePath = createTestXlsx(
      {
        First: [["H1"], ["v1"]],
        Second: [["H2"], ["v2"]],
      },
      "byindex.xlsx",
    );

    const result = await parseXlsx({ filePath, sheetIndex: 1 });
    expect(result.content).toHaveLength(1);
    const sheet = result.content[0];
    if (sheet.type !== "spreadsheet") throw new Error("Expected spreadsheet");
    expect(sheet.sheetName).toBe("Second");
  });

  test("throws on invalid sheet name", async () => {
    const filePath = createTestXlsx({ Sheet1: [["A"]] }, "badname.xlsx");
    await expect(
      parseXlsx({ filePath, sheetName: "NonExistent" }),
    ).rejects.toThrow("not found");
  });

  test("throws on out-of-range sheet index", async () => {
    const filePath = createTestXlsx({ Sheet1: [["A"]] }, "badindex.xlsx");
    await expect(parseXlsx({ filePath, sheetIndex: 5 })).rejects.toThrow(
      "out of range",
    );
  });

  test("truncates rows when maxRows exceeded", async () => {
    const rows: (string | number)[][] = [["ID", "Value"]];
    for (let i = 0; i < 100; i++) {
      rows.push([i, `val-${i}`]);
    }
    const filePath = createTestXlsx({ Data: rows }, "truncate.xlsx");

    const result = await parseXlsx({ filePath, maxRows: 10 });
    const sheet = result.content[0];
    if (sheet.type !== "spreadsheet") throw new Error("Expected spreadsheet");
    expect(sheet.rows).toHaveLength(10);
    expect(sheet.totalRows).toBe(100);
    expect(sheet.isTruncated).toBe(true);
  });

  test("generates markdown table", async () => {
    const filePath = createTestXlsx(
      {
        Sheet1: [
          ["Name", "Score"],
          ["Alice", 95],
          ["Bob", 87],
        ],
      },
      "markdown.xlsx",
    );

    const result = await parseXlsx({ filePath });
    const sheet = result.content[0];
    if (sheet.type !== "spreadsheet") throw new Error("Expected spreadsheet");
    expect(sheet.markdown).toContain("| Name | Score |");
    expect(sheet.markdown).toContain("| --- | --- |");
    expect(sheet.markdown).toContain("Alice");
  });

  test("handles empty sheet", async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([]);
    XLSX.utils.book_append_sheet(wb, ws, "Empty");
    const filePath = join(tmpDir, "empty.xlsx");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    writeFileSync(filePath, buf);

    const result = await parseXlsx({ filePath });
    const sheet = result.content[0];
    if (sheet.type !== "spreadsheet") throw new Error("Expected spreadsheet");
    expect(sheet.headers).toEqual([]);
    expect(sheet.rows).toEqual([]);
    expect(sheet.totalRows).toBe(0);
  });

  test("throws on non-existent file", async () => {
    await expect(
      parseXlsx({ filePath: "/tmp/nonexistent.xlsx" }),
    ).rejects.toThrow();
  });
});
