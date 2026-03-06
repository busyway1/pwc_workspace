import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { listCommands, upsertCommand, deleteCommand } from "./commands.js";

describe("commands", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "cmds-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("listCommands returns empty for non-existent dir", async () => {
    const result = await listCommands(tmpDir, "workspace");
    expect(result).toEqual([]);
  });

  test("upsertCommand creates a command file", async () => {
    const path = await upsertCommand(tmpDir, {
      name: "test-cmd",
      description: "A test command",
      template: "echo hello",
    });
    expect(path).toContain("test-cmd.md");

    const content = readFileSync(path, "utf8");
    expect(content).toContain("test-cmd");
    expect(content).toContain("echo hello");
  });

  test("listCommands finds created commands", async () => {
    await upsertCommand(tmpDir, {
      name: "my-cmd",
      description: "desc",
      template: "do something",
    });
    const cmds = await listCommands(tmpDir, "workspace");
    expect(cmds).toHaveLength(1);
    expect(cmds[0].name).toBe("my-cmd");
    expect(cmds[0].template).toBe("do something");
    expect(cmds[0].scope).toBe("workspace");
  });

  test("upsertCommand throws on empty template", async () => {
    await expect(
      upsertCommand(tmpDir, { name: "bad", template: "" }),
    ).rejects.toThrow();
  });

  test("upsertCommand throws on whitespace-only template", async () => {
    await expect(
      upsertCommand(tmpDir, { name: "bad", template: "   " }),
    ).rejects.toThrow();
  });

  test("deleteCommand removes the file", async () => {
    await upsertCommand(tmpDir, {
      name: "to-delete",
      template: "temp",
    });
    const before = await listCommands(tmpDir, "workspace");
    expect(before).toHaveLength(1);

    await deleteCommand(tmpDir, "to-delete");
    const after = await listCommands(tmpDir, "workspace");
    expect(after).toEqual([]);
  });

  test("upsertCommand sanitizes leading slashes", async () => {
    const path = await upsertCommand(tmpDir, {
      name: "/my-cmd",
      template: "test",
    });
    expect(path).toContain("my-cmd.md");
    expect(path).not.toContain("//");
  });

  test("listCommands skips non-md files", async () => {
    const dir = join(tmpDir, ".opencode", "commands");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "readme.txt"), "not a command");
    writeFileSync(join(dir, "valid-cmd.md"), "---\nname: valid-cmd\n---\ntemplate body\n");
    const cmds = await listCommands(tmpDir, "workspace");
    expect(cmds).toHaveLength(1);
    expect(cmds[0].name).toBe("valid-cmd");
  });

  test("upsertCommand preserves agent and model fields", async () => {
    await upsertCommand(tmpDir, {
      name: "agent-cmd",
      template: "run this",
      agent: "my-agent",
      model: "gpt-5",
    });
    const cmds = await listCommands(tmpDir, "workspace");
    const cmd = cmds.find((c) => c.name === "agent-cmd");
    expect(cmd).toBeDefined();
    expect(cmd!.agent).toBe("my-agent");
    expect(cmd!.model).toBe("gpt-5");
  });
});
