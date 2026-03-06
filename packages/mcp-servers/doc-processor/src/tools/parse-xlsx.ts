import { readFileSync } from "node:fs";
import { basename } from "node:path";
import * as XLSX from "xlsx";
import type { ParsedDocument, SpreadsheetContent } from "../types.js";
import {
  unmerge,
  detectHeaders,
  toMarkdownTable,
  filterHidden,
} from "../utils/xlsx-helpers.js";

export interface ParseXlsxParams {
  filePath: string;
  sheetName?: string;
  sheetIndex?: number;
  maxRows?: number;
  includeHidden?: boolean;
}

const DEFAULT_MAX_ROWS = 5000;

export async function parseXlsx(
  params: ParseXlsxParams,
): Promise<ParsedDocument> {
  const {
    filePath,
    sheetName,
    sheetIndex,
    maxRows = DEFAULT_MAX_ROWS,
    includeHidden = false,
  } = params;

  const buffer = readFileSync(filePath);
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
    raw: false,
  });

  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) {
    throw new Error(`No sheets found in ${filePath}`);
  }

  // Determine which sheets to process
  let targetSheets: { name: string; index: number }[];
  if (sheetName != null) {
    const idx = sheetNames.indexOf(sheetName);
    if (idx === -1) {
      throw new Error(
        `Sheet "${sheetName}" not found. Available: ${sheetNames.join(", ")}`,
      );
    }
    targetSheets = [{ name: sheetName, index: idx }];
  } else if (sheetIndex != null) {
    if (sheetIndex < 0 || sheetIndex >= sheetNames.length) {
      throw new Error(
        `Sheet index ${sheetIndex} out of range (0-${sheetNames.length - 1})`,
      );
    }
    targetSheets = [{ name: sheetNames[sheetIndex], index: sheetIndex }];
  } else {
    targetSheets = sheetNames.map((name, index) => ({ name, index }));
  }

  const content: SpreadsheetContent[] = [];

  for (const { name, index } of targetSheets) {
    const ws = workbook.Sheets[name];
    if (!ws) continue;

    // Handle merged cells
    const mergedRegions = unmerge(ws);

    // Detect hidden rows/columns
    const { hiddenRows, hiddenColumns } = filterHidden(ws);

    // Convert to 2D array
    const rawRows: (string | number | null)[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      blankrows: false,
      raw: false,
      dateNF: "yyyy-mm-dd",
    });

    // Filter hidden rows/columns if not including them
    let filteredRows = rawRows;
    if (!includeHidden) {
      const hiddenRowSet = new Set(hiddenRows);
      const hiddenColSet = new Set(hiddenColumns);

      filteredRows = rawRows
        .filter((_, rowIdx) => !hiddenRowSet.has(rowIdx))
        .map((row) => row.filter((_, colIdx) => !hiddenColSet.has(colIdx)));
    }

    if (filteredRows.length === 0) {
      content.push({
        type: "spreadsheet",
        sheetName: name,
        sheetIndex: index,
        headers: [],
        rows: [],
        markdown: "",
        totalRows: 0,
        isTruncated: false,
        mergedRegions: mergedRegions.length > 0 ? mergedRegions : undefined,
        hiddenRows: hiddenRows.length > 0 ? hiddenRows : undefined,
        hiddenColumns: hiddenColumns.length > 0 ? hiddenColumns : undefined,
      });
      continue;
    }

    // Detect header row
    const { headerRowIndex, headers } = detectHeaders(filteredRows);

    // Data rows start after the header
    const dataRows = filteredRows.slice(headerRowIndex + 1);
    const totalRows = dataRows.length;
    const isTruncated = totalRows > maxRows;
    const truncatedDataRows = isTruncated
      ? dataRows.slice(0, maxRows)
      : dataRows;

    // Build row records keyed by header name
    const rowRecords: Record<string, string | number | null>[] =
      truncatedDataRows.map((row) => {
        const record: Record<string, string | number | null> = {};
        for (let colIdx = 0; colIdx < headers.length; colIdx++) {
          const key = headers[colIdx] || `_col${colIdx}`;
          record[key] = row[colIdx] ?? null;
        }
        return record;
      });

    // Build markdown table
    const markdown = toMarkdownTable(headers, truncatedDataRows);

    content.push({
      type: "spreadsheet",
      sheetName: name,
      sheetIndex: index,
      headers,
      rows: rowRecords,
      markdown,
      totalRows,
      isTruncated,
      mergedRegions: mergedRegions.length > 0 ? mergedRegions : undefined,
      hiddenRows: hiddenRows.length > 0 ? hiddenRows : undefined,
      hiddenColumns: hiddenColumns.length > 0 ? hiddenColumns : undefined,
    });
  }

  return {
    metadata: {
      filename: basename(filePath),
      format: "xlsx",
      totalSheets: sheetNames.length,
      parsedAt: new Date().toISOString(),
    },
    content,
  };
}
