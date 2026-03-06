import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  auditLogPath,
  legacyAuditLogPath,
  recordAudit,
  readLastAudit,
  readAuditEntries,
} from "./audit.js";
import type { AuditEntry } from "./types.js";

describe("auditLogPath", () => {
  const origEnv = process.env.OPENWORK_DATA_DIR;

  afterEach(() => {
    if (origEnv !== undefined) {
      process.env.OPENWORK_DATA_DIR = origEnv;
    } else {
      delete process.env.OPENWORK_DATA_DIR;
    }
  });

  test("uses OPENWORK_DATA_DIR when set", () => {
    process.env.OPENWORK_DATA_DIR = "/custom/data";
    const path = auditLogPath("ws_abc");
    expect(path).toBe(join("/custom/data", "audit", "ws_abc.jsonl"));
  });

  test("expands ~ in OPENWORK_DATA_DIR", () => {
    process.env.OPENWORK_DATA_DIR = "~/mydata";
    const path = auditLogPath("ws_abc");
    expect(path).toContain("mydata");
    expect(path).toContain("audit");
    expect(path).toContain("ws_abc.jsonl");
  });
});

describe("legacyAuditLogPath", () => {
  test("returns path under .opencode/openwork", () => {
    const path = legacyAuditLogPath("/project");
    expect(path).toBe(
      join("/project", ".opencode", "openwork", "audit.jsonl"),
    );
  });
});

describe("recordAudit + readLastAudit + readAuditEntries", () => {
  let tmpDir: string;
  const origEnv = process.env.OPENWORK_DATA_DIR;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "audit-"));
    process.env.OPENWORK_DATA_DIR = tmpDir;
  });

  afterEach(() => {
    if (origEnv !== undefined) {
      process.env.OPENWORK_DATA_DIR = origEnv;
    } else {
      delete process.env.OPENWORK_DATA_DIR;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("recordAudit writes and readLastAudit reads the last entry", async () => {
    const entry: AuditEntry = {
      workspaceId: "ws_test1",
      action: "run_command",
      timestamp: Date.now(),
    };
    await recordAudit(tmpDir, entry);

    const last = await readLastAudit(tmpDir, "ws_test1");
    expect(last).not.toBeNull();
    expect(last!.action).toBe("run_command");
    expect(last!.workspaceId).toBe("ws_test1");
  });

  test("recordAudit appends multiple entries", async () => {
    const entry1: AuditEntry = {
      workspaceId: "ws_multi",
      action: "action1",
      timestamp: 1,
    };
    const entry2: AuditEntry = {
      workspaceId: "ws_multi",
      action: "action2",
      timestamp: 2,
    };
    await recordAudit(tmpDir, entry1);
    await recordAudit(tmpDir, entry2);

    const entries = await readAuditEntries(tmpDir, "ws_multi", 10);
    expect(entries).toHaveLength(2);
    // readAuditEntries returns newest first
    expect(entries[0].action).toBe("action2");
    expect(entries[1].action).toBe("action1");
  });

  test("readLastAudit returns null when no file exists", async () => {
    const result = await readLastAudit(tmpDir, "ws_nonexistent");
    expect(result).toBeNull();
  });

  test("readAuditEntries returns empty for missing file", async () => {
    const result = await readAuditEntries(tmpDir, "ws_nonexistent");
    expect(result).toEqual([]);
  });

  test("readAuditEntries respects limit parameter", async () => {
    for (let i = 0; i < 5; i++) {
      await recordAudit(tmpDir, {
        workspaceId: "ws_limit",
        action: `action${i}`,
        timestamp: i,
      });
    }
    const entries = await readAuditEntries(tmpDir, "ws_limit", 3);
    expect(entries).toHaveLength(3);
  });

  test("recordAudit uses legacy path when workspaceId is empty", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "audit-legacy-"));
    const entry: AuditEntry = {
      workspaceId: "",
      action: "legacy_action",
      timestamp: Date.now(),
    };
    await recordAudit(workspaceRoot, entry);

    const legacyPath = legacyAuditLogPath(workspaceRoot);
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(legacyPath, "utf8");
    expect(content).toContain("legacy_action");
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  test("readLastAudit handles malformed JSON gracefully", async () => {
    const auditDir = join(tmpDir, "audit");
    mkdirSync(auditDir, { recursive: true });
    writeFileSync(join(auditDir, "ws_bad.jsonl"), "not valid json\n");
    const result = await readLastAudit(tmpDir, "ws_bad");
    expect(result).toBeNull();
  });

  test("readAuditEntries skips malformed lines", async () => {
    const auditDir = join(tmpDir, "audit");
    mkdirSync(auditDir, { recursive: true });
    const lines = [
      JSON.stringify({ workspaceId: "ws_mix", action: "good1", timestamp: 1 }),
      "bad json",
      JSON.stringify({ workspaceId: "ws_mix", action: "good2", timestamp: 2 }),
    ];
    writeFileSync(join(auditDir, "ws_mix.jsonl"), lines.join("\n") + "\n");
    const entries = await readAuditEntries(tmpDir, "ws_mix", 10);
    expect(entries).toHaveLength(2);
  });
});
