import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test";
import {
  startFallbackProxy,
  resolveProxyConfig,
  rewriteModelInBody,
  type FallbackProxyConfig,
} from "./llm-fallback-proxy.js";

// ─── resolveProxyConfig ───

describe("resolveProxyConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // 테스트마다 환경변수 초기화
    delete process.env.LLM_ENV;
    delete process.env.PWC_API_KEY;
    delete process.env.PWC_BASE_URL;
    delete process.env.PRIMARY_MODEL;
    delete process.env.FALLBACK_MODEL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.LOCAL_PRIMARY_MODEL;
    delete process.env.LOCAL_FALLBACK_MODEL;
  });

  afterEach(() => {
    // 환경변수 복원
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  test("returns null when pwc mode and no PWC_API_KEY", () => {
    process.env.LLM_ENV = "pwc";
    expect(resolveProxyConfig()).toBeNull();
  });

  test("returns null when pwc mode and no PWC_BASE_URL", () => {
    process.env.LLM_ENV = "pwc";
    process.env.PWC_API_KEY = "test-key";
    expect(resolveProxyConfig()).toBeNull();
  });

  test("returns pwc config when both PWC vars are set", () => {
    process.env.PWC_API_KEY = "pwc-key";
    process.env.PWC_BASE_URL = "https://pwc.example.com/v1";
    const config = resolveProxyConfig();
    expect(config).not.toBeNull();
    expect(config!.llmEnv).toBe("pwc");
    expect(config!.baseUrl).toBe("https://pwc.example.com/v1");
    expect(config!.apiKey).toBe("pwc-key");
    expect(config!.primaryModel).toBe("bedrock.anthropic.claude-sonnet-4");
    expect(config!.fallbackModel).toBe("azure.gpt-5.2-2025-12-11");
  });

  test("uses custom models in pwc mode", () => {
    process.env.PWC_API_KEY = "pwc-key";
    process.env.PWC_BASE_URL = "https://pwc.example.com/v1";
    process.env.PRIMARY_MODEL = "custom-primary";
    process.env.FALLBACK_MODEL = "custom-fallback";
    const config = resolveProxyConfig();
    expect(config!.primaryModel).toBe("custom-primary");
    expect(config!.fallbackModel).toBe("custom-fallback");
  });

  test("returns null when local mode and no OPENAI_API_KEY", () => {
    process.env.LLM_ENV = "local";
    expect(resolveProxyConfig()).toBeNull();
  });

  test("returns local config with OpenAI defaults", () => {
    process.env.LLM_ENV = "local";
    process.env.OPENAI_API_KEY = "sk-test";
    const config = resolveProxyConfig();
    expect(config).not.toBeNull();
    expect(config!.llmEnv).toBe("local");
    expect(config!.baseUrl).toBe("https://api.openai.com");
    expect(config!.apiKey).toBe("sk-test");
    expect(config!.primaryModel).toBe("gpt-5.2");
    expect(config!.fallbackModel).toBe("gpt-5.2-mini");
  });

  test("uses custom models in local mode", () => {
    process.env.LLM_ENV = "local";
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.LOCAL_PRIMARY_MODEL = "gpt-5.2-pro";
    process.env.LOCAL_FALLBACK_MODEL = "gpt-4o";
    const config = resolveProxyConfig();
    expect(config!.primaryModel).toBe("gpt-5.2-pro");
    expect(config!.fallbackModel).toBe("gpt-4o");
  });

  test("defaults to pwc mode when LLM_ENV is not set", () => {
    process.env.PWC_API_KEY = "pwc-key";
    process.env.PWC_BASE_URL = "https://pwc.example.com/v1";
    const config = resolveProxyConfig();
    expect(config!.llmEnv).toBe("pwc");
  });
});

// ─── rewriteModelInBody ───

describe("rewriteModelInBody", () => {
  test("rewrites model field in JSON body", () => {
    const body = Buffer.from(
      JSON.stringify({ model: "old-model", messages: [] }),
    );
    const result = rewriteModelInBody(body, "new-model");
    const parsed = JSON.parse(result.toString());
    expect(parsed.model).toBe("new-model");
    expect(parsed.messages).toEqual([]);
  });

  test("returns original body if not JSON", () => {
    const body = Buffer.from("not json");
    const result = rewriteModelInBody(body, "new-model");
    expect(result.toString()).toBe("not json");
  });

  test("returns original body if no model field", () => {
    const body = Buffer.from(JSON.stringify({ messages: [] }));
    const result = rewriteModelInBody(body, "new-model");
    const parsed = JSON.parse(result.toString());
    expect(parsed.model).toBeUndefined();
  });

  test("handles empty JSON object", () => {
    const body = Buffer.from("{}");
    const result = rewriteModelInBody(body, "new-model");
    const parsed = JSON.parse(result.toString());
    expect(parsed.model).toBeUndefined();
  });
});

// ─── startFallbackProxy ───

describe("startFallbackProxy", () => {
  test("starts and stops cleanly", async () => {
    const config: FallbackProxyConfig = {
      port: 0, // OS가 자동으로 포트 할당
      baseUrl: "https://httpbin.org",
      apiKey: "test-key",
      primaryModel: "test-primary",
      fallbackModel: "test-fallback",
    };
    const proxy = await startFallbackProxy(config);
    expect(proxy.port).toBeGreaterThan(0);
    proxy.close();
  });

  test("returns 502 when upstream is unreachable", async () => {
    const config: FallbackProxyConfig = {
      port: 0,
      baseUrl: "http://127.0.0.1:1", // 연결 불가능한 포트
      apiKey: "test-key",
      primaryModel: "test-primary",
      fallbackModel: "test-fallback",
    };
    const proxy = await startFallbackProxy(config);
    try {
      const res = await fetch(
        `http://127.0.0.1:${proxy.port}/v1/chat/completions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "test",
            messages: [{ role: "user", content: "hi" }],
          }),
        },
      );
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error.type).toBe("proxy_error");
    } finally {
      proxy.close();
    }
  });

  test("forwards request to upstream and returns response", async () => {
    // 간단한 mock upstream 서버 생성
    const { createServer } = await import("node:http");
    const upstream = createServer((req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "test-response", model: "test-model" }));
    });

    await new Promise<void>((resolve) =>
      upstream.listen(0, "127.0.0.1", resolve),
    );
    const upstreamPort = (upstream.address() as { port: number }).port;

    const config: FallbackProxyConfig = {
      port: 0,
      baseUrl: `http://127.0.0.1:${upstreamPort}`,
      apiKey: "test-key",
      primaryModel: "test-primary",
      fallbackModel: "test-fallback",
    };
    const proxy = await startFallbackProxy(config);
    try {
      const res = await fetch(
        `http://127.0.0.1:${proxy.port}/v1/chat/completions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "test-primary", messages: [] }),
        },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe("test-response");
    } finally {
      proxy.close();
      upstream.close();
    }
  });

  test("falls back to secondary model on 429", async () => {
    const { createServer } = await import("node:http");
    let requestCount = 0;
    let lastReceivedModel: string | undefined;

    const upstream = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      requestCount++;

      if (requestCount === 1) {
        // 첫 요청: 429 반환
        res.writeHead(429, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Rate limited" } }));
      } else {
        // 재시도: 성공
        lastReceivedModel = body.model;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ id: "fallback-ok", model: body.model }));
      }
    });

    await new Promise<void>((resolve) =>
      upstream.listen(0, "127.0.0.1", resolve),
    );
    const upstreamPort = (upstream.address() as { port: number }).port;

    const config: FallbackProxyConfig = {
      port: 0,
      baseUrl: `http://127.0.0.1:${upstreamPort}`,
      apiKey: "test-key",
      primaryModel: "primary-model",
      fallbackModel: "fallback-model",
    };
    const proxy = await startFallbackProxy(config);
    try {
      const res = await fetch(
        `http://127.0.0.1:${proxy.port}/v1/chat/completions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "primary-model", messages: [] }),
        },
      );
      expect(res.status).toBe(200);
      expect(requestCount).toBe(2);
      expect(lastReceivedModel).toBe("fallback-model");
    } finally {
      proxy.close();
      upstream.close();
    }
  });

  test("falls back on 500", async () => {
    const { createServer } = await import("node:http");
    let requestCount = 0;

    const upstream = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      requestCount++;
      if (requestCount === 1) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Internal error" } }));
      } else {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ id: "ok" }));
      }
    });

    await new Promise<void>((resolve) =>
      upstream.listen(0, "127.0.0.1", resolve),
    );
    const upstreamPort = (upstream.address() as { port: number }).port;

    const config: FallbackProxyConfig = {
      port: 0,
      baseUrl: `http://127.0.0.1:${upstreamPort}`,
      apiKey: "test-key",
      primaryModel: "p",
      fallbackModel: "f",
    };
    const proxy = await startFallbackProxy(config);
    try {
      const res = await fetch(`http://127.0.0.1:${proxy.port}/test`, {
        method: "POST",
        body: JSON.stringify({ model: "p" }),
      });
      expect(res.status).toBe(200);
      expect(requestCount).toBe(2);
    } finally {
      proxy.close();
      upstream.close();
    }
  });

  test("does NOT fall back on 400 (non-retryable)", async () => {
    const { createServer } = await import("node:http");
    let requestCount = 0;

    const upstream = createServer((req, res) => {
      requestCount++;
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Bad request" } }));
    });

    await new Promise<void>((resolve) =>
      upstream.listen(0, "127.0.0.1", resolve),
    );
    const upstreamPort = (upstream.address() as { port: number }).port;

    const config: FallbackProxyConfig = {
      port: 0,
      baseUrl: `http://127.0.0.1:${upstreamPort}`,
      apiKey: "test-key",
      primaryModel: "p",
      fallbackModel: "f",
    };
    const proxy = await startFallbackProxy(config);
    try {
      const res = await fetch(`http://127.0.0.1:${proxy.port}/test`, {
        method: "POST",
        body: JSON.stringify({ model: "p" }),
      });
      expect(res.status).toBe(400);
      // 400은 retryable이 아니므로 fallback 시도 없음
      expect(requestCount).toBe(1);
    } finally {
      proxy.close();
      upstream.close();
    }
  });

  test("sets Authorization header with apiKey", async () => {
    const { createServer } = await import("node:http");
    let receivedAuth: string | undefined;

    const upstream = createServer((req, res) => {
      receivedAuth = req.headers.authorization;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });

    await new Promise<void>((resolve) =>
      upstream.listen(0, "127.0.0.1", resolve),
    );
    const upstreamPort = (upstream.address() as { port: number }).port;

    const config: FallbackProxyConfig = {
      port: 0,
      baseUrl: `http://127.0.0.1:${upstreamPort}`,
      apiKey: "my-secret-key",
      primaryModel: "p",
      fallbackModel: "f",
    };
    const proxy = await startFallbackProxy(config);
    try {
      await fetch(`http://127.0.0.1:${proxy.port}/v1/models`, {
        method: "GET",
      });
      expect(receivedAuth).toBe("Bearer my-secret-key");
    } finally {
      proxy.close();
      upstream.close();
    }
  });
});
