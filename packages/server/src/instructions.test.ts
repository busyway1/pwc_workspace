import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  getInstructions,
  saveInstructions,
  ensureInstructionsInConfig,
} from "./instructions.js";

describe("instructions", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "instr-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("getInstructions returns empty content when file doesn't exist", async () => {
    const result = await getInstructions(tmpDir);
    expect(result.content).toBe("");
    expect(result.lastModified).toBeNull();
    expect(result.path).toContain("instructions.md");
  });

  test("saveInstructions creates the file", async () => {
    const result = await saveInstructions(tmpDir, "Hello instructions");
    expect(result.action).toBe("created");
    expect(result.path).toContain("instructions.md");

    const got = await getInstructions(tmpDir);
    expect(got.content).toBe("Hello instructions\n");
    expect(got.lastModified).not.toBeNull();
  });

  test("saveInstructions updates existing file", async () => {
    await saveInstructions(tmpDir, "first version");
    const result = await saveInstructions(tmpDir, "second version");
    expect(result.action).toBe("updated");

    const got = await getInstructions(tmpDir);
    expect(got.content).toBe("second version\n");
  });

  test("saveInstructions appends newline if not present", async () => {
    await saveInstructions(tmpDir, "no trailing newline");
    const got = await getInstructions(tmpDir);
    expect(got.content.endsWith("\n")).toBe(true);
  });

  test("saveInstructions preserves existing trailing newline", async () => {
    await saveInstructions(tmpDir, "has newline\n");
    const got = await getInstructions(tmpDir);
    expect(got.content).toBe("has newline\n");
  });

  test("saveInstructions throws on non-string content", async () => {
    await expect(
      saveInstructions(tmpDir, 123 as any),
    ).rejects.toThrow();
  });

  test("ensureInstructionsInConfig adds instructions to empty config", async () => {
    // Create an opencode.jsonc config
    writeFileSync(join(tmpDir, "opencode.jsonc"), "{}", "utf8");
    await ensureInstructionsInConfig(tmpDir);

    const { readFile } = await import("node:fs/promises");
    const content = await readFile(join(tmpDir, "opencode.jsonc"), "utf8");
    const config = JSON.parse(content);
    expect(config.instructions).toContain(".opencode/instructions.md");
  });

  test("ensureInstructionsInConfig is idempotent", async () => {
    writeFileSync(
      join(tmpDir, "opencode.jsonc"),
      JSON.stringify({ instructions: [".opencode/instructions.md"] }),
      "utf8",
    );
    await ensureInstructionsInConfig(tmpDir);

    const { readFile } = await import("node:fs/promises");
    const content = await readFile(join(tmpDir, "opencode.jsonc"), "utf8");
    const config = JSON.parse(content);
    // Should not duplicate the entry
    const arr = Array.isArray(config.instructions) ? config.instructions : [config.instructions];
    const count = arr.filter((x: string) => x === ".opencode/instructions.md").length;
    expect(count).toBe(1);
  });

  test("ensureInstructionsInConfig appends to existing string", async () => {
    writeFileSync(
      join(tmpDir, "opencode.jsonc"),
      JSON.stringify({ instructions: "existing.md" }),
      "utf8",
    );
    await ensureInstructionsInConfig(tmpDir);

    const { readFile } = await import("node:fs/promises");
    const content = await readFile(join(tmpDir, "opencode.jsonc"), "utf8");
    const config = JSON.parse(content);
    expect(Array.isArray(config.instructions)).toBe(true);
    expect(config.instructions).toContain("existing.md");
    expect(config.instructions).toContain(".opencode/instructions.md");
  });

  test("ensureInstructionsInConfig skips if already present as string", async () => {
    writeFileSync(
      join(tmpDir, "opencode.jsonc"),
      JSON.stringify({ instructions: ".opencode/instructions.md" }),
      "utf8",
    );
    await ensureInstructionsInConfig(tmpDir);

    const { readFile } = await import("node:fs/promises");
    const content = await readFile(join(tmpDir, "opencode.jsonc"), "utf8");
    const config = JSON.parse(content);
    // Should remain a string, not converted to array
    expect(config.instructions).toBe(".opencode/instructions.md");
  });
});
