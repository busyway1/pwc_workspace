import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

export type LlmEnv = "pwc" | "local";

export interface FallbackProxyConfig {
  port: number;
  baseUrl: string;
  apiKey: string;
  primaryModel: string;
  fallbackModel: string;
  /** "pwc" = PwC GenAI API (default), "local" = OpenAI API direct */
  llmEnv?: LlmEnv;
}

// /v1을 포함하지 않음 — 프록시가 받는 경로에 이미 /v1이 포함되어 있으므로
const OPENAI_BASE_URL = "https://api.openai.com";
const OPENAI_DEFAULT_MODEL = "gpt-5.2";

/**
 * LLM_ENV 환경변수에 따라 프록시 설정을 결정합니다.
 * - "pwc": PWC_API_KEY + PWC_BASE_URL 사용
 * - "local": OPENAI_API_KEY + OpenAI API 사용
 */
export function resolveProxyConfig(): FallbackProxyConfig | null {
  const llmEnv = (process.env.LLM_ENV ?? "pwc") as LlmEnv;

  if (llmEnv === "local") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn("[LLM Proxy] LLM_ENV=local but OPENAI_API_KEY is not set");
      return null;
    }
    return {
      port: 4097,
      baseUrl: OPENAI_BASE_URL,
      apiKey,
      primaryModel: process.env.LOCAL_PRIMARY_MODEL ?? OPENAI_DEFAULT_MODEL,
      fallbackModel: process.env.LOCAL_FALLBACK_MODEL ?? "gpt-5-mini",
      llmEnv: "local",
    };
  }

  // pwc mode (default)
  const apiKey = process.env.PWC_API_KEY;
  const baseUrl = process.env.PWC_BASE_URL;
  if (!apiKey || !baseUrl) {
    return null;
  }
  return {
    port: 4097,
    baseUrl,
    apiKey,
    primaryModel:
      process.env.PRIMARY_MODEL ?? "bedrock.anthropic.claude-sonnet-4",
    fallbackModel: process.env.FALLBACK_MODEL ?? "azure.gpt-5.2-2025-12-11",
    llmEnv: "pwc",
  };
}

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502]);

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

async function forwardRequest(
  baseUrl: string,
  apiKey: string,
  path: string,
  method: string,
  headers: Record<string, string>,
  body: Buffer,
): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      ...headers,
      Authorization: `Bearer ${apiKey}`,
      Host: new URL(baseUrl).host,
    },
    body: method !== "GET" && method !== "HEAD" ? body : undefined,
  });

  const responseBody = Buffer.from(await response.arrayBuffer());
  const responseHeaders: Record<string, string> = {};
  // 프록시가 본문을 버퍼로 완전히 읽은 뒤 전달하므로, 원본의 chunked/encoding 헤더는 제거
  const skipHeaders = new Set([
    "transfer-encoding",
    "content-encoding",
    "content-length",
  ]);
  response.headers.forEach((value, key) => {
    if (!skipHeaders.has(key.toLowerCase())) {
      responseHeaders[key] = value;
    }
  });
  // 실제 바디 크기로 content-length 설정
  responseHeaders["content-length"] = String(responseBody.length);

  return {
    status: response.status,
    headers: responseHeaders,
    body: responseBody,
  };
}

export function rewriteModelInBody(body: Buffer, newModel: string): Buffer {
  try {
    const parsed = JSON.parse(body.toString("utf-8"));
    if (parsed && typeof parsed === "object" && "model" in parsed) {
      parsed.model = newModel;
      return Buffer.from(JSON.stringify(parsed), "utf-8");
    }
  } catch {
    // Not JSON or can't parse — return original
  }
  return body;
}

export function startFallbackProxy(
  config: FallbackProxyConfig,
): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve, reject) => {
    const server = createServer(
      async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const path = req.url ?? "/";
          const method = req.method ?? "GET";

          // Collect request headers (exclude host, it'll be rewritten)
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(req.headers)) {
            if (
              key.toLowerCase() === "host" ||
              key.toLowerCase() === "authorization"
            )
              continue;
            if (typeof value === "string") headers[key] = value;
            else if (Array.isArray(value)) headers[key] = value.join(", ");
          }
          headers["content-type"] =
            headers["content-type"] ?? "application/json";

          const body = await readBody(req);

          // First attempt with primary model
          const primaryResult = await forwardRequest(
            config.baseUrl,
            config.apiKey,
            path,
            method,
            headers,
            body,
          );

          if (!RETRYABLE_STATUS_CODES.has(primaryResult.status)) {
            // Success or non-retryable error — return as-is
            res.writeHead(primaryResult.status, primaryResult.headers);
            res.end(primaryResult.body);
            return;
          }

          // Fallback: rewrite model and retry
          console.log(
            `[Fallback] ${config.primaryModel} failed (HTTP ${primaryResult.status}), retrying with ${config.fallbackModel}`,
          );

          const fallbackBody = rewriteModelInBody(body, config.fallbackModel);
          const fallbackResult = await forwardRequest(
            config.baseUrl,
            config.apiKey,
            path,
            method,
            headers,
            fallbackBody,
          );

          res.writeHead(fallbackResult.status, fallbackResult.headers);
          res.end(fallbackResult.body);
        } catch (error) {
          console.error("[Fallback Proxy] Request error:", error);
          res.writeHead(502, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              error: { message: "Proxy error", type: "proxy_error" },
            }),
          );
        }
      },
    );

    server.on("error", reject);
    server.listen(config.port, "127.0.0.1", () => {
      const addr = server.address();
      const actualPort =
        typeof addr === "object" && addr ? addr.port : config.port;
      console.log(`[Fallback Proxy] Listening on 127.0.0.1:${actualPort}`);
      resolve({
        port: actualPort,
        close: () => server.close(),
      });
    });
  });
}
