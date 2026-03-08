/**
 * E2E 테스트: 서버 + LLM 프록시 동시 기동
 * 서버 health → 워크스페이스 → 스킬 CRUD → 프록시 LLM 호출 연계 검증
 *
 * LLM_ENV=local + OPENAI_API_KEY 설정 시에만 LLM 호출 테스트가 실행됩니다.
 */
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startServer } from "./server.js";
import { workspaceIdForPath } from "./workspaces.js";
import {
  startFallbackProxy,
  type FallbackProxyConfig,
} from "../../orchestrator/src/llm-fallback-proxy.js";
import type { ServerConfig } from "./types.js";

const CLIENT_TOKEN = "e2e-client-token";
const HOST_TOKEN = "e2e-host-token";
const canRunLLM =
  process.env.LLM_ENV === "local" && !!process.env.OPENAI_API_KEY;

let server: ReturnType<typeof startServer>;
let serverUrl: string;
let proxyPort: number;
let closeProxy: () => void;
let workspaceId: string;
let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "pwc-e2e-test-"));
  workspaceId = workspaceIdForPath(tempDir);

  // 서버 기동
  const config: ServerConfig = {
    host: "127.0.0.1",
    port: 0,
    token: CLIENT_TOKEN,
    hostToken: HOST_TOKEN,
    approval: { mode: "auto", timeoutMs: 5000 },
    corsOrigins: ["*"],
    workspaces: [
      {
        id: workspaceId,
        name: "e2e-workspace",
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
  serverUrl = `http://127.0.0.1:${server.port}`;

  // LLM 프록시 기동 (OpenAI API 키가 있는 경우에만)
  if (canRunLLM) {
    const proxyConfig: FallbackProxyConfig = {
      port: 0,
      baseUrl: "https://api.openai.com",
      apiKey: process.env.OPENAI_API_KEY!,
      primaryModel: "gpt-5.2",
      fallbackModel: "gpt-5-mini",
      llmEnv: "local",
    };
    const proxy = await startFallbackProxy(proxyConfig);
    proxyPort = proxy.port;
    closeProxy = proxy.close;
  }
});

afterAll(async () => {
  server?.stop(true);
  closeProxy?.();
  await rm(tempDir, { recursive: true, force: true }).catch(() => {});
});

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

// ─── E2E 시나리오 ───

describe("E2E: 서버 + 프록시 통합 시나리오", () => {
  test("1단계: 서버 health 확인", async () => {
    const res = await fetch(`${serverUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.version).toBeDefined();
  });

  test("2단계: 워크스페이스 확인", async () => {
    const res = await fetch(`${serverUrl}/workspaces`, {
      headers: clientHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.length).toBe(1);
    expect(body.items[0].id).toBe(workspaceId);
    expect(body.activeId).toBe(workspaceId);
  });

  test("3단계: 스킬 CRUD 전체 사이클", async () => {
    const skillName = "e2e-test-skill";

    // 생성
    const createRes = await fetch(
      `${serverUrl}/workspace/${workspaceId}/skills`,
      {
        method: "POST",
        headers: clientHeaders(),
        body: JSON.stringify({
          name: skillName,
          content: "# E2E Test Skill\nTest content for E2E.",
          description: "E2E integration test skill",
        }),
      },
    );
    expect(createRes.status).toBe(200);
    const created = await createRes.json();
    expect(created.name).toBe(skillName);

    // 조회 확인
    const listRes = await fetch(
      `${serverUrl}/workspace/${workspaceId}/skills`,
      { headers: clientHeaders() },
    );
    const listed = await listRes.json();
    expect(
      listed.items.some((s: { name: string }) => s.name === skillName),
    ).toBe(true);

    // 삭제
    const deleteRes = await fetch(
      `${serverUrl}/workspace/${workspaceId}/skills/${skillName}`,
      { method: "DELETE", headers: clientHeaders() },
    );
    expect(deleteRes.status).toBe(200);

    // 삭제 확인
    const verifyRes = await fetch(
      `${serverUrl}/workspace/${workspaceId}/skills`,
      { headers: clientHeaders() },
    );
    const verified = await verifyRes.json();
    expect(
      verified.items.some((s: { name: string }) => s.name === skillName),
    ).toBe(false);
  });

  test("4단계: 커맨드 CRUD 전체 사이클", async () => {
    const cmdName = "e2e-cmd";

    // 생성
    const createRes = await fetch(
      `${serverUrl}/workspace/${workspaceId}/commands`,
      {
        method: "POST",
        headers: clientHeaders(),
        body: JSON.stringify({
          name: cmdName,
          description: "E2E command",
          template: "echo e2e-test",
        }),
      },
    );
    expect(createRes.status).toBe(200);

    // 조회
    const listRes = await fetch(
      `${serverUrl}/workspace/${workspaceId}/commands`,
      { headers: clientHeaders() },
    );
    const listed = await listRes.json();
    expect(
      listed.items.some((c: { name: string }) => c.name === cmdName),
    ).toBe(true);

    // 삭제
    const deleteRes = await fetch(
      `${serverUrl}/workspace/${workspaceId}/commands/${cmdName}`,
      { method: "DELETE", headers: clientHeaders() },
    );
    expect(deleteRes.status).toBe(200);
  });

  test("5단계: 토큰 생성/삭제 via 호스트 인증", async () => {
    // 토큰 생성
    const createRes = await fetch(`${serverUrl}/tokens`, {
      method: "POST",
      headers: hostHeaders(),
      body: JSON.stringify({ scope: "viewer", label: "e2e-token" }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.token).toBeDefined();
    expect(created.scope).toBe("viewer");

    // 생성된 토큰으로 인증 확인
    const whoamiRes = await fetch(`${serverUrl}/whoami`, {
      headers: { Authorization: `Bearer ${created.token}` },
    });
    expect(whoamiRes.status).toBe(200);
    const actor = await whoamiRes.json();
    expect(actor.actor.scope).toBe("viewer");

    // 토큰 삭제
    const deleteRes = await fetch(`${serverUrl}/tokens/${created.id}`, {
      method: "DELETE",
      headers: hostHeaders(),
    });
    expect(deleteRes.status).toBe(200);

    // 삭제된 토큰으로 인증 실패 확인
    const failRes = await fetch(`${serverUrl}/whoami`, {
      headers: { Authorization: `Bearer ${created.token}` },
    });
    expect(failRes.status).toBe(401);
  });
});

// ─── LLM 프록시 연계 (OpenAI API 키가 있는 경우만) ───

describe.if(canRunLLM)(
  "E2E: LLM 프록시 연계 (서버 + 프록시 동시 기동)",
  () => {
    test("서버 health + 프록시 chat completion 연계", async () => {
      // 서버 정상 확인
      const healthRes = await fetch(`${serverUrl}/health`);
      expect(healthRes.status).toBe(200);

      // 프록시 통한 LLM 호출
      const llmRes = await fetch(
        `http://127.0.0.1:${proxyPort}/v1/chat/completions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-5.2",
            messages: [{ role: "user", content: "Reply with only: OK" }],
            max_completion_tokens: 5,
          }),
        },
      );
      expect(llmRes.status).toBe(200);
      const llmBody = await llmRes.json();
      expect(llmBody.choices).toBeDefined();
      expect(llmBody.choices[0].message.content).toBeTruthy();
      console.log("[E2E] LLM response:", llmBody.choices[0].message.content);
    }, 30_000);
  },
);
