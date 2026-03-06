import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { workspaceIdForPath, buildWorkspaceInfos } from "./workspaces.js";

describe("workspaceIdForPath", () => {
  test("returns deterministic id prefixed with ws_", () => {
    const id = workspaceIdForPath("/some/path");
    expect(id).toMatch(/^ws_[0-9a-f]{12}$/);
  });

  test("returns same id for same path", () => {
    expect(workspaceIdForPath("/a")).toBe(workspaceIdForPath("/a"));
  });

  test("returns different ids for different paths", () => {
    expect(workspaceIdForPath("/a")).not.toBe(workspaceIdForPath("/b"));
  });
});

describe("buildWorkspaceInfos", () => {
  test("resolves paths relative to cwd", () => {
    const result = buildWorkspaceInfos(
      [{ path: "my-project" }],
      "/home/user",
    );
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe(resolve("/home/user", "my-project"));
  });

  test("uses workspace name if provided", () => {
    const result = buildWorkspaceInfos(
      [{ path: "proj", name: "My Project" }],
      "/cwd",
    );
    expect(result[0].name).toBe("My Project");
  });

  test("falls back to basename when name is not provided", () => {
    const result = buildWorkspaceInfos([{ path: "my-app" }], "/cwd");
    expect(result[0].name).toBe("my-app");
  });

  test("defaults workspaceType to local", () => {
    const result = buildWorkspaceInfos([{ path: "." }], "/cwd");
    expect(result[0].workspaceType).toBe("local");
  });

  test("preserves workspaceType when provided", () => {
    const result = buildWorkspaceInfos(
      [{ path: ".", workspaceType: "remote" }],
      "/cwd",
    );
    expect(result[0].workspaceType).toBe("remote");
  });

  test("passes through optional fields", () => {
    const result = buildWorkspaceInfos(
      [{
        path: ".",
        baseUrl: "https://api.example.com",
        directory: "/dir",
        opencodeUsername: "user",
        opencodePassword: "pass",
      }],
      "/cwd",
    );
    expect(result[0].baseUrl).toBe("https://api.example.com");
    expect(result[0].directory).toBe("/dir");
    expect(result[0].opencodeUsername).toBe("user");
    expect(result[0].opencodePassword).toBe("pass");
  });

  test("generates correct id from resolved path", () => {
    const result = buildWorkspaceInfos([{ path: "proj" }], "/home/user");
    const expectedId = workspaceIdForPath(resolve("/home/user", "proj"));
    expect(result[0].id).toBe(expectedId);
  });

  test("handles empty array", () => {
    expect(buildWorkspaceInfos([], "/cwd")).toEqual([]);
  });
});
