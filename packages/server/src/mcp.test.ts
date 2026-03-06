import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { listMcp, addMcp, removeMcp } from "./mcp.js";

describe("mcp", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "mcp-"));
    writeFileSync(join(tmpDir, "opencode.jsonc"), "{}", "utf8");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("listMcp returns no project MCPs when none configured", async () => {
    const items = await listMcp(tmpDir);
    const projectItems = items.filter((i) => i.source === "config.project");
    expect(projectItems).toEqual([]);
  });

  test("addMcp adds a local MCP config", async () => {
    const result = await addMcp(tmpDir, "test-mcp", {
      type: "local",
      command: ["node", "server.js"],
    });
    expect(result.action).toBe("added");

    const items = await listMcp(tmpDir);
    const projectItems = items.filter((i) => i.source === "config.project");
    expect(projectItems).toHaveLength(1);
    expect(projectItems[0].name).toBe("test-mcp");
  });

  test("addMcp updates existing MCP", async () => {
    await addMcp(tmpDir, "test-mcp", {
      type: "local",
      command: ["node", "v1.js"],
    });
    const result = await addMcp(tmpDir, "test-mcp", {
      type: "local",
      command: ["node", "v2.js"],
    });
    expect(result.action).toBe("updated");
  });

  test("removeMcp removes a configured MCP", async () => {
    await addMcp(tmpDir, "to-remove", {
      type: "local",
      command: ["npx", "server"],
    });
    const removed = await removeMcp(tmpDir, "to-remove");
    expect(removed).toBe(true);

    const items = await listMcp(tmpDir);
    const projectItems = items.filter((i) => i.source === "config.project");
    expect(projectItems).toEqual([]);
  });

  test("removeMcp returns false when not found", async () => {
    const removed = await removeMcp(tmpDir, "nonexistent");
    expect(removed).toBe(false);
  });

  test("addMcp throws for invalid name (starting with -)", async () => {
    await expect(
      addMcp(tmpDir, "-bad-name", { type: "local", command: ["node"] }),
    ).rejects.toThrow();
  });

  test("addMcp throws for invalid config type", async () => {
    await expect(addMcp(tmpDir, "test", { type: "invalid" })).rejects.toThrow();
  });

  test("addMcp throws for local MCP without command", async () => {
    await expect(addMcp(tmpDir, "test", { type: "local" })).rejects.toThrow();
  });

  test("addMcp throws for remote MCP without url", async () => {
    await expect(addMcp(tmpDir, "test", { type: "remote" })).rejects.toThrow();
  });

  test("addMcp accepts valid remote MCP", async () => {
    const result = await addMcp(tmpDir, "remote-mcp", {
      type: "remote",
      url: "https://example.com/mcp",
    });
    expect(result.action).toBe("added");
  });

  test("listMcp reads MCPs from config file", async () => {
    const config = {
      mcp: {
        "my-server": { type: "local", command: ["node", "index.js"] },
        "my-remote": { type: "remote", url: "https://api.example.com" },
      },
    };
    writeFileSync(
      join(tmpDir, "opencode.jsonc"),
      JSON.stringify(config),
      "utf8",
    );

    const items = await listMcp(tmpDir);
    const projectItems = items.filter((i) => i.source === "config.project");
    expect(projectItems).toHaveLength(2);
    const names = projectItems.map((i) => i.name).sort();
    expect(names).toEqual(["my-remote", "my-server"]);
  });
});
