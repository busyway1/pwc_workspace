/**
 * 실제 OpenAI API 호출 통합 테스트
 * LLM_ENV=local + OPENAI_API_KEY 설정 시에만 실행됩니다.
 */
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import {
  startFallbackProxy,
  type FallbackProxyConfig,
} from "./llm-fallback-proxy.js";

const canRunIntegration =
  process.env.LLM_ENV === "local" && !!process.env.OPENAI_API_KEY;

describe.if(canRunIntegration)("LLM Integration (real OpenAI API)", () => {
  let proxyPort: number;
  let closeProxy: () => void;

  beforeAll(async () => {
    const config: FallbackProxyConfig = {
      port: 0, // OS가 자동으로 빈 포트 할당
      baseUrl: "https://api.openai.com",
      apiKey: process.env.OPENAI_API_KEY!,
      primaryModel: "gpt-5.2",
      fallbackModel: "gpt-5.2-mini",
      llmEnv: "local",
    };
    const proxy = await startFallbackProxy(config);
    proxyPort = proxy.port;
    closeProxy = proxy.close;
  });

  afterAll(() => {
    closeProxy?.();
  });

  test("프록시를 통한 OpenAI chat completion 호출", async () => {
    const res = await fetch(
      `http://127.0.0.1:${proxyPort}/v1/chat/completions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-5.2",
          messages: [{ role: "user", content: "Say hello in one word." }],
          max_completion_tokens: 10,
        }),
      },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.choices).toBeDefined();
    expect(body.choices.length).toBeGreaterThan(0);
    expect(body.choices[0].message.content).toBeTruthy();
    console.log("[Integration] Response:", body.choices[0].message.content);
  }, 30_000);

  test("프록시를 통한 OpenAI models 목록 조회", async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/v1/models`, {
      method: "GET",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    const modelIds = body.data.map((m: { id: string }) => m.id);
    console.log(
      "[Integration] Available models (sample):",
      modelIds.slice(0, 5),
    );
  }, 15_000);
});
