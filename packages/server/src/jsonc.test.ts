import { describe, expect, test, beforeEach } from "bun:test";
import { readJsoncFile, updateJsoncTopLevel, writeJsoncFile } from "./jsonc.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

function tmp(suffix: string): string {
  return join(
    tmpdir(),
    `openwork-jsonc-test-${Date.now()}-${Math.random().toString(36).slice(2)}-${suffix}`,
  );
}

describe("readJsoncFile", () => {
  test("reads valid JSONC and returns parsed data + raw string", async () => {
    const dir = tmp("read-valid");
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, "config.jsonc");
    const content = '{\n  // a comment\n  "key": "value",\n  "num": 42\n}\n';
    await writeFile(filePath, content, "utf8");

    const result = await readJsoncFile<{ key: string; num: number }>(filePath, {
      key: "",
      num: 0,
    });
    expect(result.data).toEqual({ key: "value", num: 42 });
    expect(result.raw).toBe(content);
  });

  test("returns fallback when file is missing", async () => {
    const filePath = join(tmp("read-missing"), "does-not-exist.jsonc");
    const fallback = { hello: "world" };

    const result = await readJsoncFile(filePath, fallback);
    expect(result.data).toEqual(fallback);
    expect(result.raw).toBe("");
  });

  test("handles trailing commas", async () => {
    const dir = tmp("read-trailing");
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, "trailing.jsonc");
    await writeFile(filePath, '{ "a": 1, "b": 2, }', "utf8");

    const result = await readJsoncFile<{ a: number; b: number }>(filePath, {
      a: 0,
      b: 0,
    });
    expect(result.data).toEqual({ a: 1, b: 2 });
  });

  test("throws ApiError on invalid JSONC", async () => {
    const dir = tmp("read-invalid");
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, "bad.jsonc");
    // Missing value after colon — invalid JSON/JSONC
    await writeFile(filePath, '{ "key": }', "utf8");

    try {
      await readJsoncFile(filePath, {});
      expect(true).toBe(false); // should not reach
    } catch (err: any) {
      expect(err.status).toBe(422);
      expect(err.code).toBe("invalid_jsonc");
      expect(err.message).toBe("Failed to parse JSONC");
      expect(Array.isArray(err.details)).toBe(true);
      expect(err.details.length).toBeGreaterThan(0);
      expect(err.details[0]).toHaveProperty("code");
      expect(err.details[0]).toHaveProperty("offset");
      expect(err.details[0]).toHaveProperty("length");
    }
  });
});

describe("updateJsoncTopLevel", () => {
  test("creates new file when missing", async () => {
    const dir = tmp("update-create");
    const filePath = join(dir, "sub", "new.jsonc");

    await updateJsoncTopLevel(filePath, { name: "test", count: 5 });

    const content = await readFile(filePath, "utf8");
    const parsed = JSON.parse(content);
    expect(parsed).toEqual({ name: "test", count: 5 });
    expect(content.endsWith("\n")).toBe(true);
  });

  test("updates existing fields in a file", async () => {
    const dir = tmp("update-existing");
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, "config.jsonc");
    await writeFile(filePath, '{\n  "name": "old",\n  "count": 1\n}\n', "utf8");

    await updateJsoncTopLevel(filePath, { name: "new", extra: true });

    const result = await readJsoncFile<{
      name: string;
      count: number;
      extra: boolean;
    }>(filePath, { name: "", count: 0, extra: false });
    expect(result.data.name).toBe("new");
    expect(result.data.count).toBe(1); // unchanged
    expect(result.data.extra).toBe(true); // added
  });

  test("preserves comments in existing file", async () => {
    const dir = tmp("update-comments");
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, "config.jsonc");
    const original = '{\n  // This is a comment\n  "name": "test"\n}\n';
    await writeFile(filePath, original, "utf8");

    await updateJsoncTopLevel(filePath, { name: "updated" });

    const raw = await readFile(filePath, "utf8");
    // The comment should still be present in the file
    expect(raw).toContain("// This is a comment");
    // The value should have been updated
    expect(raw).toContain('"updated"');
  });

  test("ensures file ends with newline", async () => {
    const dir = tmp("update-newline");
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, "config.jsonc");
    // Write a file without trailing newline
    await writeFile(filePath, '{"a": 1}', "utf8");

    await updateJsoncTopLevel(filePath, { b: 2 });

    const raw = await readFile(filePath, "utf8");
    expect(raw.endsWith("\n")).toBe(true);
  });
});

describe("writeJsoncFile", () => {
  test("creates file with JSON content", async () => {
    const dir = tmp("write-new");
    const filePath = join(dir, "deep", "nested", "file.jsonc");

    await writeJsoncFile(filePath, { hello: "world", nested: { a: 1 } });

    const raw = await readFile(filePath, "utf8");
    expect(raw.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual({ hello: "world", nested: { a: 1 } });
  });

  test("overwrites existing file", async () => {
    const dir = tmp("write-overwrite");
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, "data.json");
    await writeFile(filePath, '{"old": true}\n', "utf8");

    await writeJsoncFile(filePath, { new: true });

    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual({ new: true });
  });

  test("formats with 2-space indent", async () => {
    const dir = tmp("write-indent");
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, "formatted.json");

    await writeJsoncFile(filePath, { key: "value" });

    const raw = await readFile(filePath, "utf8");
    expect(raw).toBe('{\n  "key": "value"\n}\n');
  });
});
