import { describe, expect, test, beforeEach } from "bun:test";
import { parseFrontmatter, buildFrontmatter } from "./frontmatter.js";

describe("parseFrontmatter", () => {
  test("parses content with valid frontmatter", () => {
    const content = "---\ntitle: Hello\ncount: 42\n---\nBody text here.";
    const result = parseFrontmatter(content);
    expect(result.data).toEqual({ title: "Hello", count: 42 });
    expect(result.body).toBe("Body text here.");
  });

  test("returns empty data and full body when no frontmatter present", () => {
    const content = "Just regular content\nwith multiple lines.";
    const result = parseFrontmatter(content);
    expect(result.data).toEqual({});
    expect(result.body).toBe(content);
  });

  test("handles empty frontmatter data", () => {
    const content = "---\n\n---\nBody after empty frontmatter.";
    const result = parseFrontmatter(content);
    expect(result.data).toEqual({});
    expect(result.body).toBe("Body after empty frontmatter.");
  });

  test("handles CRLF line endings", () => {
    const content = "---\r\ntitle: CRLF Test\r\n---\r\nBody with CRLF.";
    const result = parseFrontmatter(content);
    expect(result.data).toEqual({ title: "CRLF Test" });
    expect(result.body).toBe("Body with CRLF.");
  });

  test("handles frontmatter with trailing newline after closing delimiter", () => {
    const content = "---\nkey: value\n---\n\nSome body.";
    const result = parseFrontmatter(content);
    expect(result.data).toEqual({ key: "value" });
    expect(result.body).toBe("\nSome body.");
  });

  test("handles complex YAML values in frontmatter", () => {
    const content = "---\ntags:\n  - a\n  - b\nnested:\n  key: val\n---\nBody.";
    const result = parseFrontmatter(content);
    expect(result.data.tags).toEqual(["a", "b"]);
    expect(result.data.nested).toEqual({ key: "val" });
    expect(result.body).toBe("Body.");
  });

  test("does not match if --- is not at the start", () => {
    const content = "Some text\n---\ntitle: not frontmatter\n---\nBody.";
    const result = parseFrontmatter(content);
    expect(result.data).toEqual({});
    expect(result.body).toBe(content);
  });

  test("handles content with no body after frontmatter", () => {
    const content = "---\ntitle: Only Frontmatter\n---\n";
    const result = parseFrontmatter(content);
    expect(result.data).toEqual({ title: "Only Frontmatter" });
    expect(result.body).toBe("");
  });
});

describe("buildFrontmatter", () => {
  test("generates correct YAML frontmatter with delimiters", () => {
    const result = buildFrontmatter({ title: "Test", count: 5 });
    expect(result).toContain("---\n");
    expect(result).toContain("title: Test");
    expect(result).toContain("count: 5");
    expect(result.startsWith("---\n")).toBe(true);
    expect(result.endsWith("\n---\n")).toBe(true);
  });

  test("handles empty data object", () => {
    const result = buildFrontmatter({});
    expect(result).toBe("---\n{}\n---\n");
  });

  test("handles nested objects", () => {
    const result = buildFrontmatter({ nested: { a: 1, b: "two" } });
    expect(result.startsWith("---\n")).toBe(true);
    expect(result.endsWith("\n---\n")).toBe(true);
    expect(result).toContain("nested:");
  });

  test("handles arrays", () => {
    const result = buildFrontmatter({ items: ["x", "y", "z"] });
    expect(result).toContain("items:");
    expect(result).toContain("- x");
    expect(result).toContain("- y");
    expect(result).toContain("- z");
  });

  test("roundtrips with parseFrontmatter", () => {
    const data = { title: "Round Trip", version: 3 };
    const frontmatter = buildFrontmatter(data);
    const content = frontmatter + "The body content.";
    const parsed = parseFrontmatter(content);
    expect(parsed.data).toEqual(data);
    expect(parsed.body).toBe("The body content.");
  });
});
