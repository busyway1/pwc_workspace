import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  normalizePluginSpec,
  listPlugins,
  addPlugin,
  removePlugin,
} from "./plugins.js";

describe("normalizePluginSpec", () => {
  test("returns spec as-is for file: prefix", () => {
    expect(normalizePluginSpec("file:./my-plugin.js")).toBe("file:./my-plugin.js");
  });

  test("returns spec as-is for http: prefix", () => {
    expect(normalizePluginSpec("http://example.com/plugin")).toBe("http://example.com/plugin");
  });

  test("returns spec as-is for https: prefix", () => {
    expect(normalizePluginSpec("https://example.com/plugin")).toBe("https://example.com/plugin");
  });

  test("returns spec as-is for absolute path", () => {
    expect(normalizePluginSpec("/usr/local/plugin")).toBe("/usr/local/plugin");
  });

  test("strips version from scoped package", () => {
    expect(normalizePluginSpec("@scope/package@1.2.3")).toBe("@scope/package");
  });

  test("returns scoped package without version as-is", () => {
    expect(normalizePluginSpec("@scope/package")).toBe("@scope/package");
  });

  test("strips version from unscoped package", () => {
    expect(normalizePluginSpec("my-plugin@2.0.0")).toBe("my-plugin");
  });

  test("returns unscoped package without version as-is", () => {
    expect(normalizePluginSpec("my-plugin")).toBe("my-plugin");
  });

  test("trims whitespace", () => {
    expect(normalizePluginSpec("  my-plugin  ")).toBe("my-plugin");
  });
});

describe("listPlugins / addPlugin / removePlugin", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "plugins-"));
    writeFileSync(join(tmpDir, "opencode.jsonc"), "{}", "utf8");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("listPlugins returns empty when no plugins configured", async () => {
    const { items } = await listPlugins(tmpDir, false);
    expect(items).toEqual([]);
  });

  test("addPlugin adds a plugin spec to config", async () => {
    const added = await addPlugin(tmpDir, "my-plugin@1.0.0");
    expect(added).toBe(true);

    const { items } = await listPlugins(tmpDir, false);
    expect(items).toHaveLength(1);
    expect(items[0].spec).toBe("my-plugin@1.0.0");
    expect(items[0].source).toBe("config");
  });

  test("addPlugin returns false for duplicate", async () => {
    await addPlugin(tmpDir, "my-plugin@1.0.0");
    const added = await addPlugin(tmpDir, "my-plugin@2.0.0");
    expect(added).toBe(false);
  });

  test("removePlugin removes the spec", async () => {
    await addPlugin(tmpDir, "to-remove@1.0.0");
    const removed = await removePlugin(tmpDir, "to-remove");
    expect(removed).toBe(true);

    const { items } = await listPlugins(tmpDir, false);
    expect(items).toEqual([]);
  });

  test("removePlugin returns false when not found", async () => {
    const removed = await removePlugin(tmpDir, "nonexistent");
    expect(removed).toBe(false);
  });

  test("addPlugin throws for empty spec", async () => {
    await expect(addPlugin(tmpDir, "")).rejects.toThrow();
  });

  test("listPlugins finds .js files in project plugins dir", async () => {
    const pluginsDir = join(tmpDir, ".opencode", "plugins");
    mkdirSync(pluginsDir, { recursive: true });
    writeFileSync(join(pluginsDir, "custom.js"), "export default {}");

    const { items } = await listPlugins(tmpDir, false);
    expect(items.some((i) => i.spec.includes("custom.js"))).toBe(true);
  });

  test("listPlugins finds .ts files in project plugins dir", async () => {
    const pluginsDir = join(tmpDir, ".opencode", "plugins");
    mkdirSync(pluginsDir, { recursive: true });
    writeFileSync(join(pluginsDir, "custom.ts"), "export default {}");

    const { items } = await listPlugins(tmpDir, false);
    expect(items.some((i) => i.spec.includes("custom.ts"))).toBe(true);
  });

  test("listPlugins loadOrder is correct", async () => {
    const { loadOrder } = await listPlugins(tmpDir, false);
    expect(loadOrder).toEqual([
      "config.global",
      "config.project",
      "dir.global",
      "dir.project",
    ]);
  });
});
