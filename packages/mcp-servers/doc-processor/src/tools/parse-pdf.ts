import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import type {
  ParsedDocument,
  Section,
  TableData,
  TextContent,
} from "../types.js";

/**
 * Detect if a line is a heading and return its level.
 * Returns 0 if the line is not a heading.
 */
function detectHeadingLevel(line: string): number {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length >= 100) return 0;
  // Lines ending with a period are likely sentences, not headings
  if (trimmed.endsWith(".")) return 0;

  // ALL_CAPS lines (at least 3 alphabetical chars) -> level 1
  if (/^[A-Z\s\d\-:&/]+$/.test(trimmed) && /[A-Z]{3,}/.test(trimmed)) {
    return 1;
  }

  // Numbered headings like "1.", "1.1", "1.1.1" etc.
  const numberedMatch = trimmed.match(/^(\d+(?:\.\d+)*)[.\s)]/);
  if (numberedMatch) {
    const dotCount = (numberedMatch[1].match(/\./g) || []).length;
    return Math.min(dotCount + 1, 6);
  }

  // Short lines without ending punctuation -> level 2
  if (trimmed.length < 60 && !/[.!?,;]$/.test(trimmed)) {
    return 2;
  }

  return 0;
}

/**
 * Detect table-like patterns in text lines.
 * Lines with consistent pipe delimiters or tab-separated values.
 */
function extractTablesFromLines(lines: string[]): {
  tables: TableData[];
  nonTableLines: string[];
} {
  const tables: TableData[] = [];
  const nonTableLines: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Detect pipe-delimited tables
    if (line.includes("|") && (line.match(/\|/g) || []).length >= 2) {
      const tableLines: string[] = [line];
      let j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j];
        if (
          nextLine.includes("|") &&
          (nextLine.match(/\|/g) || []).length >= 2
        ) {
          tableLines.push(nextLine);
          j++;
        } else {
          break;
        }
      }

      // Need at least 2 rows to form a table
      if (tableLines.length >= 2) {
        const parsedRows = tableLines
          .filter((l) => !/^[\s|:-]+$/.test(l)) // skip separator lines
          .map((l) =>
            l
              .split("|")
              .map((cell) => cell.trim())
              .filter((cell) => cell.length > 0),
          );

        if (parsedRows.length >= 2) {
          tables.push({
            headers: parsedRows[0],
            rows: parsedRows.slice(1),
          });
          i = j;
          continue;
        }
      }
    }

    // Detect tab-delimited tables
    if (line.includes("\t") && (line.match(/\t/g) || []).length >= 2) {
      const tableLines: string[] = [line];
      const colCount = (line.match(/\t/g) || []).length + 1;
      let j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j];
        const nextColCount = (nextLine.match(/\t/g) || []).length + 1;
        if (nextLine.includes("\t") && nextColCount === colCount) {
          tableLines.push(nextLine);
          j++;
        } else {
          break;
        }
      }

      if (tableLines.length >= 2) {
        const parsedRows = tableLines.map((l) =>
          l.split("\t").map((cell) => cell.trim()),
        );
        tables.push({
          headers: parsedRows[0],
          rows: parsedRows.slice(1),
        });
        i = j;
        continue;
      }
    }

    nonTableLines.push(line);
    i++;
  }

  return { tables, nonTableLines };
}

/**
 * Nest flat sections into a tree based on heading levels.
 */
function nestSections(flatSections: Section[]): Section[] {
  const root: Section[] = [];
  const stack: Section[] = [];

  for (const section of flatSections) {
    // Level 0 sections (no heading) stay at root
    if (section.level === 0) {
      root.push(section);
      continue;
    }

    // Pop stack until we find a parent with lower level
    while (stack.length > 0 && stack[stack.length - 1].level >= section.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(section);
    } else {
      const parent = stack[stack.length - 1];
      if (!parent.children) {
        parent.children = [];
      }
      parent.children.push(section);
    }

    stack.push(section);
  }

  return root;
}

/**
 * Build a section tree from page text lines.
 */
function buildSections(allLines: string[]): Section[] {
  const { tables: standaloneTables, nonTableLines } =
    extractTablesFromLines(allLines);

  const sections: Section[] = [];
  let currentSection: Section | null = null;
  const contentBuffer: string[] = [];

  function flushContent(): void {
    if (currentSection && contentBuffer.length > 0) {
      currentSection.content = contentBuffer.join("\n").trim();
      contentBuffer.length = 0;
    }
  }

  for (const line of nonTableLines) {
    const level = detectHeadingLevel(line);

    if (level > 0) {
      flushContent();

      if (currentSection) {
        sections.push(currentSection);
      }

      currentSection = {
        heading: line.trim(),
        level,
        content: "",
      };
    } else if (line.trim().length > 0) {
      if (!currentSection) {
        currentSection = {
          heading: "",
          level: 0,
          content: "",
        };
      }
      contentBuffer.push(line);
    }
  }

  // Flush remaining
  flushContent();
  if (currentSection) {
    sections.push(currentSection);
  }

  // Attach standalone tables to the last section, or create one for them
  if (standaloneTables.length > 0) {
    if (sections.length > 0) {
      const lastSection = sections[sections.length - 1];
      lastSection.tables = [...(lastSection.tables || []), ...standaloneTables];
    } else {
      sections.push({
        heading: "",
        level: 0,
        content: "",
        tables: standaloneTables,
      });
    }
  }

  if (sections.length === 0) {
    return [];
  }

  return nestSections(sections);
}

function countSections(sections: Section[]): number {
  let count = 0;
  for (const section of sections) {
    count++;
    if (section.children) {
      count += countSections(section.children);
    }
  }
  return count;
}

export async function parsePdf(params: {
  filePath: string;
  maxPages?: number;
}): Promise<ParsedDocument> {
  const buffer = await readFile(params.filePath);
  const uint8 = new Uint8Array(buffer);

  const pdf = await getDocumentProxy(uint8);
  const totalPages = pdf.numPages;

  // Extract all page texts in one call (unpdf handles page-by-page internally)
  const { text: pageTexts } = await extractText(uint8, { mergePages: false });

  const pagesToProcess = params.maxPages
    ? Math.min(totalPages, params.maxPages)
    : totalPages;

  const allLines: string[] = [];
  let hasAnyText = false;

  for (let i = 0; i < pagesToProcess; i++) {
    const pageText = pageTexts[i] || "";
    if (pageText.trim().length > 0) {
      hasAnyText = true;
    }
    allLines.push(...pageText.split("\n"));
  }

  let sections: Section[];

  if (!hasAnyText) {
    // Scanned PDF or PDF with no extractable text
    sections = [
      {
        heading: "Note",
        level: 1,
        content:
          "This PDF contains no extractable text. It may be a scanned document or contain only images.",
      },
    ];
  } else {
    sections = buildSections(allLines);
  }

  if (sections.length === 0) {
    sections = [{ heading: "", level: 0, content: "" }];
  }

  const textContent: TextContent = {
    type: "text",
    sections,
  };

  return {
    metadata: {
      filename: basename(params.filePath),
      format: "pdf",
      totalPages,
      totalSections: countSections(sections),
      parsedAt: new Date().toISOString(),
    },
    content: [textContent],
  };
}
