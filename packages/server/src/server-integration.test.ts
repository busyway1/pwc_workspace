/**
 * 서버 통합 테스트
 * startServer()를 실제로 기동하고 주요 엔드포인트를 검증합니다.
 * - 비인증: /health, /w/:id/health
 * - 클라이언트 인증: /status, /capabilities, /workspaces, /whoami, CRUD
 * - 호스트 인증: /tokens, /approvals
 * - 인증 실패: 401
 */
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startServer } from "./server.js";
import { workspaceIdForPath } from "./workspaces.js";
import type { ServerConfig } from "./types.js";

const CLIENT_TOKEN = "test-client-token-integration";
const HOST_TOKEN = "test-host-token-integration";

let server: ReturnType<typeof startServer>;
let baseUrl: string;
let workspaceId: string;
let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "pwc-server-test-"));
  workspaceId = workspaceIdForPath(tempDir);

  const config: ServerConfig = {
    host: "127.0.0.1",
    port: 0, // OS가 자동으로 빈 포트 할당
    token: CLIENT_TOKEN,
    hostToken: HOST_TOKEN,
    approval: { mode: "auto", timeoutMs: 5000 },
    corsOrigins: ["*"],
    workspaces: [
      {
        id: workspaceId,
        name: "test-workspace",
        path: tempDir,
        workspaceType: "local",
      },
    ],
    authorizedRoots: [tempDir],
    readOnly: false,
    startedAt: Date.now(),
    tokenSource: "generated",
    hostTokenSource: "generated",
    logFormat: "pretty",
    logRequests: false,
  };

  server = startServer(config);
  baseUrl = `http://127.0.0.1:${server.port}`;
});

afterAll(async () => {
  server?.stop(true);
  await rm(tempDir, { recursive: true, force: true }).catch(() => {});
});

// ─── helpers ───

function clientHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${CLIENT_TOKEN}`,
    "Content-Type": "application/json",
  };
}

function hostHeaders(): Record<string, string> {
  return {
    "X-OpenWork-Host-Token": HOST_TOKEN,
    "Content-Type": "application/json",
  };
}

// ─── 비인증 엔드포인트 ───

describe("비인증 엔드포인트", () => {
  test("GET /health → 200 + version", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.version).toBeDefined();
    expect(typeof body.uptimeMs).toBe("number");
  });

  test("GET /w/:id/health → 200 + version", async () => {
    const res = await fetch(`${baseUrl}/w/${workspaceId}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.version).toBeDefined();
  });

  test("GET /nonexistent → 404", async () => {
    const res = await fetch(`${baseUrl}/nonexistent`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("not_found");
  });
});

// ─── 인증 실패 ───

describe("인증 실패", () => {
  test("GET /status 토큰 없음 → 401", async () => {
    const res = await fetch(`${baseUrl}/status`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("unauthorized");
  });

  test("GET /status 잘못된 토큰 → 401", async () => {
    const res = await fetch(`${baseUrl}/status`, {
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });

  test("GET /tokens 호스트 토큰 없음 → 401", async () => {
    const res = await fetch(`${baseUrl}/tokens`);
    expect(res.status).toBe(401);
  });

  test("GET /tokens 잘못된 호스트 토큰 → 401", async () => {
    const res = await fetch(`${baseUrl}/tokens`, {
      headers: { "X-OpenWork-Host-Token": "wrong" },
    });
    expect(res.status).toBe(401);
  });
});

// ─── 클라이언트 인증 엔드포인트 ───

describe("클라이언트 인증 엔드포인트", () => {
  test("GET /status → 200", async () => {
    const res = await fetch(`${baseUrl}/status`, {
      headers: clientHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.version).toBeDefined();
    expect(body.readOnly).toBe(false);
    expect(body.activeWorkspaceId).toBe(workspaceId);
  });

  test("GET /capabilities → 200", async () => {
    const res = await fetch(`${baseUrl}/capabilities`, {
      headers: clientHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schemaVersion).toBe(1);
    expect(body.serverVersion).toBeDefined();
    expect(body.skills).toBeDefined();
    expect(body.plugins).toBeDefined();
    expect(body.mcp).toBeDefined();
    expect(body.commands).toBeDefined();
  });

  test("GET /workspaces → 200 + items", async () => {
    const res = await fetch(`${baseUrl}/workspaces`, {
      headers: clientHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toBeDefined();
    expect(body.items.length).toBe(1);
    expect(body.activeId).toBe(workspaceId);
  });

  test("GET /whoami → 200 + actor", async () => {
    const res = await fetch(`${baseUrl}/whoami`, {
      headers: clientHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.actor).toBeDefined();
    expect(body.actor.type).toBe("remote");
    expect(body.actor.scope).toBe("collaborator");
  });

  test("GET /workspace/:id/config → 200", async () => {
    const res = await fetch(`${baseUrl}/workspace/${workspaceId}/config`, {
      headers: clientHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  test("GET /w/:id/status → 200", async () => {
    const res = await fetch(`${baseUrl}/w/${workspaceId}/status`, {
      headers: clientHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.activeWorkspaceId).toBe(workspaceId);
  });

  test("GET /w/:id/capabilities → 200", async () => {
    const res = await fetch(`${baseUrl}/w/${workspaceId}/capabilities`, {
      headers: clientHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schemaVersion).toBe(1);
  });
});

// ─── 호스트 인증 엔드포인트 ───

describe("호스트 인증 엔드포인트", () => {
  test("GET /tokens → 200 (초기 비어있음)", async () => {
    const res = await fetch(`${baseUrl}/tokens`, {
      headers: hostHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toBeDefined();
    expect(Array.isArray(body.items)).toBe(true);
  });

  test("POST /tokens → 201 (토큰 생성)", async () => {
    const res = await fetch(`${baseUrl}/tokens`, {
      method: "POST",
      headers: hostHeaders(),
      body: JSON.stringify({ scope: "viewer", label: "test-token" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.token).toBeDefined();
    expect(body.scope).toBe("viewer");
    expect(body.label).toBe("test-token");
  });

  test("POST /tokens → 400 (잘못된 scope)", async () => {
    const res = await fetch(`${baseUrl}/tokens`, {
      method: "POST",
      headers: hostHeaders(),
      body: JSON.stringify({ scope: "invalid" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalid_scope");
  });

  test("GET /approvals → 200", async () => {
    const res = await fetch(`${baseUrl}/approvals`, {
      headers: hostHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toBeDefined();
    expect(Array.isArray(body.items)).toBe(true);
  });
});

// ─── Skills CRUD ───

describe("Skills CRUD", () => {
  test("GET /workspace/:id/skills → 200 (초기 비어있음)", async () => {
    const res = await fetch(`${baseUrl}/workspace/${workspaceId}/skills`, {
      headers: clientHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toBeDefined();
    expect(Array.isArray(body.items)).toBe(true);
  });

  test("POST → GET → DELETE 스킬 생성/조회/삭제", async () => {
    // 생성
    const createRes = await fetch(
      `${baseUrl}/workspace/${workspaceId}/skills`,
      {
        method: "POST",
        headers: clientHeaders(),
        body: JSON.stringify({
          name: "test-skill",
          content: "This is a test skill.",
          description: "Integration test skill",
        }),
      },
    );
    expect(createRes.status).toBe(200);
    const created = await createRes.json();
    expect(created.name).toBe("test-skill");

    // 조회
    const listRes = await fetch(
      `${baseUrl}/workspace/${workspaceId}/skills`,
      { headers: clientHeaders() },
    );
    expect(listRes.status).toBe(200);
    const listed = await listRes.json();
    const found = listed.items.find(
      (s: { name: string }) => s.name === "test-skill",
    );
    expect(found).toBeDefined();

    // 삭제
    const deleteRes = await fetch(
      `${baseUrl}/workspace/${workspaceId}/skills/test-skill`,
      {
        method: "DELETE",
        headers: clientHeaders(),
      },
    );
    expect(deleteRes.status).toBe(200);
    const deleted = await deleteRes.json();
    expect(deleted.ok).toBe(true);

    // 삭제 확인
    const verifyRes = await fetch(
      `${baseUrl}/workspace/${workspaceId}/skills`,
      { headers: clientHeaders() },
    );
    const verified = await verifyRes.json();
    const notFound = verified.items.find(
      (s: { name: string }) => s.name === "test-skill",
    );
    expect(notFound).toBeUndefined();
  });
});

// ─── Commands CRUD ───

describe("Commands CRUD", () => {
  test("GET /workspace/:id/commands → 200", async () => {
    const res = await fetch(`${baseUrl}/workspace/${workspaceId}/commands`, {
      headers: clientHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toBeDefined();
    expect(Array.isArray(body.items)).toBe(true);
  });

  test("POST → GET → DELETE 커맨드 생성/조회/삭제", async () => {
    // 생성
    const createRes = await fetch(
      `${baseUrl}/workspace/${workspaceId}/commands`,
      {
        method: "POST",
        headers: clientHeaders(),
        body: JSON.stringify({
          name: "test-command",
          description: "Integration test command",
          template: "echo hello from test",
        }),
      },
    );
    expect(createRes.status).toBe(200);
    const created = await createRes.json();
    expect(created.items).toBeDefined();

    // 조회
    const listRes = await fetch(
      `${baseUrl}/workspace/${workspaceId}/commands`,
      { headers: clientHeaders() },
    );
    expect(listRes.status).toBe(200);
    const listed = await listRes.json();
    const found = listed.items.find(
      (c: { name: string }) => c.name === "test-command",
    );
    expect(found).toBeDefined();
    expect(found.template).toBe("echo hello from test");

    // 삭제
    const deleteRes = await fetch(
      `${baseUrl}/workspace/${workspaceId}/commands/test-command`,
      {
        method: "DELETE",
        headers: clientHeaders(),
      },
    );
    expect(deleteRes.status).toBe(200);
    const deleted = await deleteRes.json();
    expect(deleted.ok).toBe(true);
  });
});

// ─── Plugins & MCP ───

describe("Plugins & MCP 조회", () => {
  test("GET /workspace/:id/plugins → 200", async () => {
    const res = await fetch(`${baseUrl}/workspace/${workspaceId}/plugins`, {
      headers: clientHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toBeDefined();
  });

  test("GET /workspace/:id/mcp → 200", async () => {
    const res = await fetch(`${baseUrl}/workspace/${workspaceId}/mcp`, {
      headers: clientHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toBeDefined();
  });
});

// ─── 에러 핸들링 ───

describe("에러 핸들링", () => {
  test("존재하지 않는 workspace → 404", async () => {
    const res = await fetch(`${baseUrl}/workspace/nonexistent/config`, {
      headers: clientHeaders(),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("workspace_not_found");
  });

  test("OPTIONS 요청 → 204 (CORS preflight)", async () => {
    const res = await fetch(`${baseUrl}/health`, {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:3000" },
    });
    expect(res.status).toBe(204);
  });
});
