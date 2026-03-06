import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  opencodeConfigPath,
  openworkConfigPath,
  projectSkillsDir,
  projectCommandsDir,
  projectPluginsDir,
} from "./workspace-files.js";

describe("opencodeConfigPath", () => {
  test("returns jsonc path when opencode.jsonc exists", () => {
    const root = mkdtempSync(join(tmpdir(), "wf-"));
    writeFileSync(join(root, "opencode.jsonc"), "{}");
    expect(opencodeConfigPath(root)).toBe(join(root, "opencode.jsonc"));
  });

  test("returns json path when only opencode.json exists", () => {
    const root = mkdtempSync(join(tmpdir(), "wf-"));
    writeFileSync(join(root, "opencode.json"), "{}");
    expect(opencodeConfigPath(root)).toBe(join(root, "opencode.json"));
  });

  test("prefers jsonc over json when both exist", () => {
    const root = mkdtempSync(join(tmpdir(), "wf-"));
    writeFileSync(join(root, "opencode.jsonc"), "{}");
    writeFileSync(join(root, "opencode.json"), "{}");
    expect(opencodeConfigPath(root)).toBe(join(root, "opencode.jsonc"));
  });

  test("defaults to jsonc path when neither file exists", () => {
    const root = mkdtempSync(join(tmpdir(), "wf-"));
    expect(opencodeConfigPath(root)).toBe(join(root, "opencode.jsonc"));
  });
});

describe("openworkConfigPath", () => {
  test("returns correct path", () => {
    expect(openworkConfigPath("/project")).toBe(
      join("/project", ".opencode", "openwork.json"),
    );
  });
});

describe("projectSkillsDir", () => {
  test("returns correct path", () => {
    expect(projectSkillsDir("/project")).toBe(
      join("/project", ".opencode", "skills"),
    );
  });
});

describe("projectCommandsDir", () => {
  test("returns correct path", () => {
    expect(projectCommandsDir("/project")).toBe(
      join("/project", ".opencode", "commands"),
    );
  });
});

describe("projectPluginsDir", () => {
  test("returns correct path", () => {
    expect(projectPluginsDir("/project")).toBe(
      join("/project", ".opencode", "plugins"),
    );
  });
});
