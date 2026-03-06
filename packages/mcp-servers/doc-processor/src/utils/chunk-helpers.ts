import type { Section } from "../types.js";

/**
 * Splits text into chunks by paragraphs, respecting maxChunkSize.
 * Each chunk will contain complete paragraphs up to the size limit.
 */
export function chunkText(text: string, maxChunkSize: number): string[] {
  if (text.length <= maxChunkSize) return [text];

  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    // If a single paragraph exceeds maxChunkSize, split it by sentences
    if (paragraph.length > maxChunkSize) {
      if (current.length > 0) {
        chunks.push(current.trim());
        current = "";
      }
      const sentences = paragraph.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        if (
          current.length + sentence.length + 1 > maxChunkSize &&
          current.length > 0
        ) {
          chunks.push(current.trim());
          current = "";
        }
        current += (current.length > 0 ? " " : "") + sentence;
      }
      continue;
    }

    const separator = current.length > 0 ? "\n\n" : "";
    if (current.length + separator.length + paragraph.length > maxChunkSize) {
      if (current.length > 0) {
        chunks.push(current.trim());
      }
      current = paragraph;
    } else {
      current += separator + paragraph;
    }
  }

  if (current.trim().length > 0) {
    chunks.push(current.trim());
  }

  return chunks;
}

/**
 * Flattens nested sections into a linear list by recursively
 * extracting children.
 */
export function flattenSections(sections: Section[]): Section[] {
  const result: Section[] = [];

  for (const section of sections) {
    const { children, ...rest } = section;
    result.push({ ...rest });
    if (children && children.length > 0) {
      result.push(...flattenSections(children));
    }
  }

  return result;
}
