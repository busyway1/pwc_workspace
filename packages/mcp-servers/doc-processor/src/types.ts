export interface ParsedDocument {
  metadata: {
    filename: string;
    format: "xlsx" | "pdf" | "docx";
    totalPages?: number;
    totalSheets?: number;
    totalSections?: number;
    parsedAt: string; // ISO 8601
  };
  content: DocumentContent[];
}

export interface SpreadsheetContent {
  type: "spreadsheet";
  sheetName: string;
  sheetIndex: number;
  headers: string[];
  rows: Record<string, string | number | null>[];
  markdown: string;
  totalRows: number;
  isTruncated: boolean;
  mergedRegions?: MergedRegion[];
  hiddenRows?: number[];
  hiddenColumns?: number[];
}

export interface MergedRegion {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
}

export interface TextContent {
  type: "text";
  sections: Section[];
}

export interface Section {
  heading: string;
  level: number;
  content: string;
  children?: Section[];
  tables?: TableData[];
}

export interface TableData {
  headers: string[];
  rows: string[][];
}

export type DocumentContent = SpreadsheetContent | TextContent;
