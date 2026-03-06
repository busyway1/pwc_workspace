import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import mammoth from "mammoth";
import type {
  ParsedDocument,
  Section,
  TableData,
  TextContent,
} from "../types.js";

/**
 * Strip HTML tags from a string, returning plain text.
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

/**
 * Decode common HTML entities.
 */
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Extract tables from HTML string and return TableData array.
 */
function extractTables(html: string): TableData[] {
  const tables: TableData[] = [];
  const tableRegex = /<table[^>]*>(.*?)<\/table>/gis;

  let tableMatch: RegExpExecArray | null;
  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const tableHtml = tableMatch[1];
    const rows: string[][] = [];

    const rowRegex = /<tr[^>]*>(.*?)<\/tr>/gis;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      const rowHtml = rowMatch[1];
      const cells: string[] = [];

      const cellRegex = /<t[dh][^>]*>(.*?)<\/t[dh]>/gi;
      let cellMatch: RegExpExecArray | null;
      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        cells.push(decodeEntities(stripHtml(cellMatch[1])));
      }

      if (cells.length > 0) {
        rows.push(cells);
      }
    }

    if (rows.length >= 1) {
      tables.push({
        headers: rows[0],
        rows: rows.slice(1),
      });
    }
  }

  return tables;
}

interface HtmlHeading {
  level: number;
  text: string;
  index: number;
}

/**
 * Nest flat sections into a tree based on heading levels.
 * h1 contains h2, h2 contains h3, etc.
 */
function nestSections(flatSections: Section[]): Section[] {
  const root: Section[] = [];
  const stack: Section[] = [];

  for (const section of flatSections) {
    if (section.level === 0) {
      root.push(section);
      continue;
    }

    // Pop stack until we find a parent with a strictly lower level
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
 * Extract sections from HTML by finding headings and content between them.
 */
function extractSections(html: string): Section[] {
  // Remove tables from html before section extraction
  // (tables are extracted separately and attached later)
  const htmlWithoutTables = html.replace(/<table[^>]*>.*?<\/table>/gis, "");

  // Find all headings
  const headingRegex = /<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi;
  const headings: HtmlHeading[] = [];

  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(htmlWithoutTables)) !== null) {
    headings.push({
      level: parseInt(match[1], 10),
      text: decodeEntities(stripHtml(match[2])),
      index: match.index,
    });
  }

  // No headings: return all content as a single section
  if (headings.length === 0) {
    const content = decodeEntities(stripHtml(htmlWithoutTables));
    if (content.length === 0) {
      return [];
    }
    return [
      {
        heading: "",
        level: 0,
        content,
      },
    ];
  }

  const flatSections: Section[] = [];

  // Content before first heading
  const contentBeforeFirst = htmlWithoutTables.substring(0, headings[0].index);
  const preContent = decodeEntities(stripHtml(contentBeforeFirst));
  if (preContent.length > 0) {
    flatSections.push({
      heading: "",
      level: 0,
      content: preContent,
    });
  }

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const closingTag = `</h${heading.level}>`;
    const headingEndIndex =
      htmlWithoutTables.indexOf(closingTag, heading.index) + closingTag.length;

    const nextIndex =
      i + 1 < headings.length
        ? headings[i + 1].index
        : htmlWithoutTables.length;

    const contentBetween = htmlWithoutTables.substring(
      headingEndIndex,
      nextIndex,
    );
    const sectionContent = decodeEntities(stripHtml(contentBetween));

    flatSections.push({
      heading: heading.text,
      level: heading.level,
      content: sectionContent,
    });
  }

  return nestSections(flatSections);
}

/**
 * Recursively count all sections including nested children.
 */
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

/**
 * Attach tables to the deepest last section in the tree.
 */
function attachTablesToSections(
  sections: Section[],
  tables: TableData[],
): void {
  if (tables.length === 0 || sections.length === 0) return;

  const lastSection = sections[sections.length - 1];
  if (lastSection.children && lastSection.children.length > 0) {
    attachTablesToSections(lastSection.children, tables);
  } else {
    lastSection.tables = [...(lastSection.tables || []), ...tables];
  }
}

export async function parseDocx(params: {
  filePath: string;
}): Promise<ParsedDocument> {
  const buffer = await readFile(params.filePath);
  const result = await mammoth.convertToHtml({ buffer });
  const html = result.value;

  // Extract tables before removing them from the HTML for section extraction
  const tables = extractTables(html);
  const sections = extractSections(html);

  // Attach tables to sections
  if (tables.length > 0) {
    if (sections.length > 0) {
      attachTablesToSections(sections, tables);
    } else {
      // No sections but has tables: create a section to hold them
      sections.push({
        heading: "",
        level: 0,
        content: "",
        tables,
      });
    }
  }

  const textContent: TextContent = {
    type: "text",
    sections:
      sections.length > 0 ? sections : [{ heading: "", level: 0, content: "" }],
  };

  return {
    metadata: {
      filename: basename(params.filePath),
      format: "docx",
      totalSections: countSections(sections),
      parsedAt: new Date().toISOString(),
    },
    content: [textContent],
  };
}
