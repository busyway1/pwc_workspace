import { describe, expect, test } from "bun:test";
import { chunkText, flattenSections } from "./chunk-helpers.js";
import type { Section } from "../types.js";

describe("chunkText", () => {
  test("returns single chunk for short text", () => {
    const result = chunkText("Hello world", 100);
    expect(result).toEqual(["Hello world"]);
  });

  test("splits by double newline (paragraphs)", () => {
    const text =
      "Paragraph one is long enough.\n\nParagraph two is also long.\n\nParagraph three is here too.";
    const result = chunkText(text, 40);
    expect(result.length).toBeGreaterThan(1);
    // Each chunk should respect paragraph boundaries
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(60);
    }
  });

  test("splits long paragraph by sentences", () => {
    const text =
      "First sentence. Second sentence. Third sentence. Fourth sentence.";
    const result = chunkText(text, 35);
    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(35 + 20); // some tolerance for sentence boundaries
    }
  });

  test("returns empty array elements trimmed", () => {
    const result = chunkText("a\n\nb", 100);
    expect(result).toEqual(["a\n\nb"]);
  });

  test("handles empty string", () => {
    const result = chunkText("", 100);
    expect(result).toEqual([""]);
  });

  test("handles text exactly at maxChunkSize", () => {
    const text = "x".repeat(50);
    const result = chunkText(text, 50);
    expect(result).toEqual([text]);
  });

  test("combines small paragraphs into one chunk", () => {
    const text = "A.\n\nB.\n\nC.";
    const result = chunkText(text, 100);
    expect(result).toEqual(["A.\n\nB.\n\nC."]);
  });
});

describe("flattenSections", () => {
  test("flattens nested sections", () => {
    const sections: Section[] = [
      {
        heading: "H1",
        level: 1,
        content: "Content 1",
        children: [{ heading: "H2", level: 2, content: "Content 2" }],
      },
    ];
    const result = flattenSections(sections);
    expect(result).toHaveLength(2);
    expect(result[0].heading).toBe("H1");
    expect(result[1].heading).toBe("H2");
  });

  test("returns empty array for empty input", () => {
    expect(flattenSections([])).toEqual([]);
  });

  test("handles deeply nested sections", () => {
    const sections: Section[] = [
      {
        heading: "L1",
        level: 1,
        content: "",
        children: [
          {
            heading: "L2",
            level: 2,
            content: "",
            children: [{ heading: "L3", level: 3, content: "deep" }],
          },
        ],
      },
    ];
    const result = flattenSections(sections);
    expect(result).toHaveLength(3);
    expect(result[2].heading).toBe("L3");
    expect(result[2].content).toBe("deep");
  });

  test("flattened sections have no children property", () => {
    const sections: Section[] = [
      {
        heading: "Parent",
        level: 1,
        content: "",
        children: [{ heading: "Child", level: 2, content: "" }],
      },
    ];
    const result = flattenSections(sections);
    for (const s of result) {
      expect(s.children).toBeUndefined();
    }
  });

  test("handles multiple root sections", () => {
    const sections: Section[] = [
      { heading: "A", level: 1, content: "a" },
      { heading: "B", level: 1, content: "b" },
    ];
    const result = flattenSections(sections);
    expect(result).toHaveLength(2);
  });
});
