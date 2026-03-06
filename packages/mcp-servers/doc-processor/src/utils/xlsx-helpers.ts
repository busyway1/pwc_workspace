import type { MergedRegion } from "../types.js";
import type { WorkSheet, CellObject, Range } from "xlsx";

/**
 * Fills all cells in a merged region with the top-left cell's value,
 * effectively "unmerging" the worksheet for uniform data access.
 */
export function unmerge(worksheet: WorkSheet): MergedRegion[] {
  const merges: Range[] | undefined = worksheet["!merges"];
  if (!merges || merges.length === 0) return [];

  const regions: MergedRegion[] = [];

  for (const merge of merges) {
    const { s, e } = merge;
    regions.push({
      startRow: s.r,
      endRow: e.r,
      startCol: s.c,
      endCol: e.c,
    });

    // Read the top-left cell value
    const topLeftRef = encodeCellRef(s.r, s.c);
    const topLeftCell: CellObject | undefined = worksheet[topLeftRef];
    if (!topLeftCell) continue;

    // Fill all cells in the merge range with the top-left cell's value
    for (let r = s.r; r <= e.r; r++) {
      for (let c = s.c; c <= e.c; c++) {
        if (r === s.r && c === s.c) continue;
        const ref = encodeCellRef(r, c);
        worksheet[ref] = { ...topLeftCell };
      }
    }
  }

  return regions;
}

/**
 * Detects the header row by finding the first row where >50% of cells
 * are non-empty strings.
 */
export function detectHeaders(rows: (string | number | null)[][]): {
  headerRowIndex: number;
  headers: string[];
} {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const nonEmptyStringCount = row.filter(
      (cell) => typeof cell === "string" && cell.trim().length > 0,
    ).length;

    if (nonEmptyStringCount / row.length > 0.5) {
      const headers = row.map((cell) =>
        cell != null ? String(cell).trim() : "",
      );
      return { headerRowIndex: i, headers };
    }
  }

  // Fallback: use first row or generate column letters
  if (rows.length > 0 && rows[0].length > 0) {
    const headers = rows[0].map((cell) =>
      cell != null ? String(cell).trim() : "",
    );
    return { headerRowIndex: 0, headers };
  }

  return { headerRowIndex: 0, headers: [] };
}

/**
 * Converts headers and row data into a Markdown table string.
 */
export function toMarkdownTable(
  headers: string[],
  rows: (string | number | null)[][],
): string {
  if (headers.length === 0) return "";

  const escapeCell = (val: string | number | null): string => {
    if (val == null) return "";
    return String(val).replace(/\|/g, "\\|").replace(/\n/g, " ");
  };

  const headerLine = "| " + headers.map(escapeCell).join(" | ") + " |";
  const separatorLine = "| " + headers.map(() => "---").join(" | ") + " |";

  const dataLines = rows.map(
    (row) =>
      "| " +
      headers.map((_, colIdx) => escapeCell(row[colIdx] ?? null)).join(" | ") +
      " |",
  );

  return [headerLine, separatorLine, ...dataLines].join("\n");
}

/**
 * Inspects worksheet row/col metadata for hidden rows and columns.
 */
export function filterHidden(worksheet: WorkSheet): {
  hiddenRows: number[];
  hiddenColumns: number[];
} {
  const hiddenRows: number[] = [];
  const hiddenColumns: number[] = [];

  const rowInfo = worksheet["!rows"];
  if (rowInfo) {
    for (let i = 0; i < rowInfo.length; i++) {
      if (rowInfo[i]?.hidden) {
        hiddenRows.push(i);
      }
    }
  }

  const colInfo = worksheet["!cols"];
  if (colInfo) {
    for (let i = 0; i < colInfo.length; i++) {
      if (colInfo[i]?.hidden) {
        hiddenColumns.push(i);
      }
    }
  }

  return { hiddenRows, hiddenColumns };
}

/**
 * Formats a cell value to its appropriate string representation.
 * Handles dates, numbers, booleans, and strings.
 */
export function formatCellValue(
  cell: CellObject | undefined,
): string | number | null {
  if (!cell) return null;

  // Date type
  if (cell.t === "d" && cell.v instanceof Date) {
    return cell.v.toISOString().split("T")[0];
  }

  // Number type
  if (cell.t === "n") {
    return cell.v as number;
  }

  // Boolean type
  if (cell.t === "b") {
    return cell.v ? "TRUE" : "FALSE";
  }

  // String / other - use formatted value if available, else raw value
  if (cell.w != null) return cell.w;
  if (cell.v != null) return String(cell.v);

  return null;
}

/**
 * Encodes a row/col pair into an A1-style cell reference (e.g. "A1", "B3").
 */
function encodeCellRef(row: number, col: number): string {
  let colStr = "";
  let c = col;
  do {
    colStr = String.fromCharCode(65 + (c % 26)) + colStr;
    c = Math.floor(c / 26) - 1;
  } while (c >= 0);
  return colStr + (row + 1);
}
