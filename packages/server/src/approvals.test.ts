import { describe, expect, test } from "bun:test";
import { ApprovalService } from "./approvals.js";

describe("ApprovalService", () => {
  test("auto mode returns allowed immediately", async () => {
    const svc = new ApprovalService({ mode: "auto", timeoutMs: 5000 });
    const result = await svc.requestApproval({
      action: "run_command",
      description: "ls -la",
    });
    expect(result.id).toBe("auto");
    expect(result.allowed).toBe(true);
  });

  test("list returns empty when no pending approvals", () => {
    const svc = new ApprovalService({ mode: "manual", timeoutMs: 5000 });
    expect(svc.list()).toEqual([]);
  });

  test("manual mode creates pending approval and respond allows it", async () => {
    const svc = new ApprovalService({ mode: "manual", timeoutMs: 5000 });
    const promise = svc.requestApproval({
      action: "run_command",
      description: "rm -rf /tmp/test",
    });

    const pending = svc.list();
    expect(pending).toHaveLength(1);
    expect(pending[0].action).toBe("run_command");

    const id = pending[0].id;
    const respondResult = svc.respond(id, "allow");
    expect(respondResult).not.toBeNull();
    expect(respondResult!.allowed).toBe(true);

    const result = await promise;
    expect(result.allowed).toBe(true);
  });

  test("respond with deny sets allowed to false", async () => {
    const svc = new ApprovalService({ mode: "manual", timeoutMs: 5000 });
    const promise = svc.requestApproval({
      action: "write_file",
      description: "test.txt",
    });

    const pending = svc.list();
    const id = pending[0].id;
    const respondResult = svc.respond(id, "deny");
    expect(respondResult).not.toBeNull();
    expect(respondResult!.allowed).toBe(false);
    expect(respondResult!.reason).toBe("denied");

    const result = await promise;
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("denied");
  });

  test("respond returns null for unknown id", () => {
    const svc = new ApprovalService({ mode: "manual", timeoutMs: 5000 });
    expect(svc.respond("nonexistent", "allow")).toBeNull();
  });

  test("times out and returns denied", async () => {
    const svc = new ApprovalService({ mode: "manual", timeoutMs: 50 });
    const result = await svc.requestApproval({
      action: "test",
      description: "timeout test",
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("timeout");
  });

  test("list is empty after respond clears pending", async () => {
    const svc = new ApprovalService({ mode: "manual", timeoutMs: 5000 });
    const promise = svc.requestApproval({
      action: "test",
      description: "test",
    });

    const id = svc.list()[0].id;
    svc.respond(id, "allow");
    await promise;
    expect(svc.list()).toEqual([]);
  });
});
