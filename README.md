# PwC Workspace Agent

삼일PwC 내부 전용 웹 기반 AI 워크스페이스 에이전트입니다. [OpenCode](https://opencode.ai) 엔진 위에 SolidJS 프론트엔드를 결합한 모노레포 구조로 구성되어 있습니다.

PwC 사내 GenAI API(Bedrock Claude, Azure GPT)와 개발용 OpenAI API를 환경변수 하나로 전환할 수 있으며, Excel/PDF/DOCX 문서 파싱, 금융·세무·감사 도메인 스킬, 파일 승인 워크플로우 등 PwC 업무에 특화된 기능을 제공합니다.

## 목차

- [아키텍처](#아키텍처)
- [핵심 컴포넌트 상세](#핵심-컴포넌트-상세)
- [패키지 구조](#패키지-구조)
- [사전 요구사항](#사전-요구사항)
- [환경 설정](#환경-설정)
- [빠른 시작](#빠른-시작)
- [LLM 환경 전환](#llm-환경-전환-pwc--local)
- [API 엔드포인트](#api-엔드포인트)
- [개발 가이드](#개발-가이드)
- [테스트](#테스트)
- [MCP 서버: doc-processor](#mcp-서버-doc-processor)
- [플러그인: pwc-finance-legal](#플러그인-pwc-finance-legal)
- [커스텀 스킬 & 명령어](#커스텀-스킬--명령어)
- [보안 모델](#보안-모델)
- [Docker 배포](#docker-배포)
- [트러블슈팅](#트러블슈팅)
- [라이선스](#라이선스)

---

## 아키텍처

```
[Browser - SolidJS App (3000)]
           |
           v
[Orchestrator - 프로세스 관리자]
           |
     +-----+-----+
     |             |
     v             v
[OpenCode Server]  [OpenWork Server (8787)]
  (4096)            (파일시스템 API)
     |                  |
     v                  +-- 스킬/플러그인/MCP 관리
[LLM Fallback Proxy     +-- 파일 인젝션/아웃박스
  (4097)]               +-- 승인 워크플로우
     |                  +-- 토큰 인증
     v                  +-- 감사 로그
[LLM API]               +-- 예약 작업 스케줄러
  ├── PwC GenAI API (pwc 모드)
  └── OpenAI API      (local 모드)
```

### 핵심 설계 원칙

| 원칙                        | 설명                                                                       |
| --------------------------- | -------------------------------------------------------------------------- |
| **예측 가능성 > 영리함**    | 자동 감지보다 명시적 설정 선호. 사용자가 동작을 정확히 예측할 수 있어야 함 |
| **2계층 인가**              | UI 레벨(폴더 선택) + OpenCode 서버 레벨(퍼미션 이벤트) 권한 분리           |
| **Fail-Fast**               | 비즈니스 로직 실행 전 입력값 검증 우선 (`validators.ts`)                   |
| **기본 거부(Default Deny)** | `authorizedRoots` 외부 파일 접근 전면 차단                                 |

---

## 핵심 컴포넌트 상세

### LLM Fallback Proxy (`packages/orchestrator/src/llm-fallback-proxy.ts`)

OpenCode와 LLM API 사이에 위치하는 경량 HTTP 프록시로, 127.0.0.1:4097에서 동작합니다.

**동작 흐름:**

```
OpenCode 요청
    → Proxy가 primaryModel로 LLM API 호출
    → 성공 시 응답 반환
    → 429/500/502 에러 시:
        → 요청 body의 model 필드를 fallbackModel로 교체
        → 동일 API에 재시도
        → 결과 반환 (성공/실패 무관)
```

**주요 함수:**

| 함수                                                           | 설명                                                  |
| -------------------------------------------------------------- | ----------------------------------------------------- |
| `resolveProxyConfig()`                                         | `LLM_ENV` 환경변수에 따라 PwC/OpenAI 프록시 설정 반환 |
| `rewriteModelInBody(body, newModel)`                           | JSON body의 `model` 필드를 폴백 모델로 교체           |
| `startFallbackProxy(config)`                                   | HTTP 프록시 서버 시작, `{ port, close }` 반환         |
| `forwardRequest(baseUrl, apiKey, path, method, headers, body)` | 실제 LLM API 호출 및 응답 헤더 정규화                 |

**응답 헤더 정규화:** 프록시가 응답 body를 완전히 버퍼링한 뒤 전달하므로, `transfer-encoding`, `content-encoding` 헤더를 제거하고 실제 body 크기로 `content-length`를 재설정합니다.

### OpenWork Server (`packages/server/`)

파일시스템 접근, 설정 관리, 승인 워크플로우를 담당하는 HTTP API 서버입니다.

**핵심 모듈:**

| 모듈             | 파일               | 역할                                                              |
| ---------------- | ------------------ | ----------------------------------------------------------------- |
| **서버 코어**    | `server.ts`        | HTTP 라우팅, CORS, 토큰 인증 미들웨어, 60+ REST 엔드포인트        |
| **설정**         | `config.ts`        | CLI 인자 → 환경변수 → 파일 설정 3단계 우선순위 해석               |
| **승인**         | `approvals.ts`     | `auto`(자동 허용) / `manual`(타임아웃 포함 수동 승인) 모드        |
| **토큰**         | `tokens.ts`        | `owner`/`collaborator`/`viewer` 3단계 스코프 토큰 CRUD            |
| **감사**         | `audit.ts`         | 모든 쓰기 작업에 대한 감사 로그 기록/조회                         |
| **스킬**         | `skills.ts`        | `.opencode/skills/` 디렉토리의 Markdown 스킬 CRUD                 |
| **플러그인**     | `plugins.ts`       | OpenCode 플러그인 추가/삭제/목록, 전역+프로젝트 범위              |
| **MCP**          | `mcp.ts`           | MCP 서버 설정 추가/삭제/목록                                      |
| **명령어**       | `commands.ts`      | `/` 커스텀 명령어 CRUD                                            |
| **스케줄러**     | `scheduler.ts`     | macOS(launchd)/Linux(systemd)/Windows(schtasks) 예약 작업         |
| **세션**         | `file-sessions.ts` | 파일 인젝션 세션 관리 (TTL, 배치 업로드, 카탈로그)                |
| **이벤트**       | `events.ts`        | SSE 기반 설정 변경 알림 (스킬/플러그인/MCP 추가·삭제)             |
| **워크스페이스** | `workspaces.ts`    | 경로 기반 워크스페이스 ID 생성, 설정 빌드                         |
| **JSONC**        | `jsonc.ts`         | `opencode.jsonc` 파일 읽기/쓰기 (주석 보존)                       |
| **프론트매터**   | `frontmatter.ts`   | YAML 프론트매터 파싱/생성 (스킬 메타데이터용)                     |
| **검증**         | `validators.ts`    | 이름/설정값 유효성 검증 (sanitizeCommandName, validateMcpName 등) |
| **에러**         | `errors.ts`        | `ApiError` 클래스 + `formatError` 유틸리티                        |

### Orchestrator (`packages/orchestrator/`)

전체 스택의 프로세스 관리자입니다. `cli.ts` 하나의 파일(~5700줄)에 모든 로직이 포함됩니다.

**관리하는 프로세스:**

1. OpenCode 서버 (기본 4096)
2. OpenWork 서버 (기본 8787, 동적 포트 할당)
3. LLM Fallback Proxy (기본 4097)
4. 사이드카 바이너리 다운로드 및 관리

**서버 바이너리 해석 체인:**

```
번들된 바이너리 (패키지 내)
  → 다운로드된 바이너리 (~/.openwork/openwork-orchestrator/sidecars/)
    → 외부 PATH의 openwork-server
```

### SolidJS 웹 UI (`packages/app/`)

15개 페이지로 구성된 SolidJS 기반 웹 프론트엔드입니다.

| 페이지       | 파일               | 설명            |
| ------------ | ------------------ | --------------- |
| Dashboard    | `dashboard.tsx`    | 메인 대시보드   |
| Session      | `session.tsx`      | AI 대화 세션    |
| Config       | `config.tsx`       | 설정 관리       |
| Skills       | `skills.tsx`       | 스킬 목록/편집  |
| Plugins      | `plugins.tsx`      | 플러그인 관리   |
| MCP          | `mcp.tsx`          | MCP 서버 설정   |
| Commands     | `commands.tsx`     | 커스텀 명령어   |
| Instructions | `instructions.tsx` | 인스트럭션 편집 |
| Extensions   | `extensions.tsx`   | 확장 기능       |
| Settings     | `settings.tsx`     | 앱 설정         |
| Onboarding   | `onboarding.tsx`   | 온보딩          |
| Scheduled    | `scheduled.tsx`    | 예약 작업 관리  |

**상태 관리:** 11개의 SolidJS Context 제공자로 전역 상태를 관리합니다:

- `openwork-server.ts` — OpenWork 서버 연결 상태
- `session.ts` — 세션 생명주기
- `workspace.ts` — 워크스페이스 선택
- `extensions.ts` — 확장 기능 상태
- `updater.ts` — 자동 업데이트

---

## 패키지 구조

```
pwc-workspace-agent/
├── packages/
│   ├── app/                    # SolidJS 웹 UI (@different-ai/openwork-ui)
│   │   ├── src/app/
│   │   │   ├── pages/          # 15개 페이지 컴포넌트
│   │   │   ├── components/     # 재사용 UI 컴포넌트 (30+)
│   │   │   ├── context/        # 상태 관리 컨텍스트 (11개)
│   │   │   ├── lib/            # 유틸리티 (OpenCode SDK 래퍼, 파일 경로 등)
│   │   │   ├── state/          # 글로벌 상태 (extensions, sessions, system)
│   │   │   └── utils/          # 유틸 (persist, plugins, providers)
│   │   └── scripts/            # 테스트/빌드 스크립트
│   ├── orchestrator/           # 프로세스 오케스트레이터 (openwork-orchestrator)
│   │   └── src/
│   │       ├── cli.ts          # 메인 CLI 진입점 (~5700줄)
│   │       ├── llm-fallback-proxy.ts  # LLM API 프록시 (PwC/OpenAI 이중 모드)
│   │       └── tui/            # 터미널 UI (SolidJS for terminal)
│   ├── server/                 # 파일시스템 API 서버 (openwork-server)
│   │   └── src/
│   │       ├── server.ts       # HTTP API 서버 (60+ 엔드포인트)
│   │       ├── config.ts       # CLI→환경변수→파일 3단계 설정 해석
│   │       ├── types.ts        # 핵심 타입 정의 (ServerConfig, Capabilities 등)
│   │       ├── approvals.ts    # 승인 워크플로우 (auto/manual + 타임아웃)
│   │       ├── tokens.ts       # 토큰 인증 (owner/collaborator/viewer)
│   │       ├── audit.ts        # 감사 로그 기록/조회
│   │       ├── skills.ts       # 스킬 CRUD
│   │       ├── plugins.ts      # 플러그인 관리
│   │       ├── mcp.ts          # MCP 서버 설정
│   │       ├── commands.ts     # 명령어 CRUD
│   │       ├── scheduler.ts    # 예약 작업 (macOS/Linux/Windows)
│   │       ├── file-sessions.ts # 파일 인젝션 세션
│   │       ├── events.ts       # SSE 설정 변경 이벤트
│   │       ├── validators.ts   # 입력값 검증
│   │       ├── errors.ts       # ApiError + formatError
│   │       ├── jsonc.ts        # JSONC 읽기/쓰기 (주석 보존)
│   │       ├── frontmatter.ts  # YAML 프론트매터 파싱
│   │       ├── workspace-files.ts # 설정 파일 경로 해석
│   │       ├── workspaces.ts   # 워크스페이스 ID/빌드
│   │       ├── utils.ts        # 공통 유틸 (exists, ensureDir, hashToken, shortId)
│   │       └── *.test.ts       # 단위 테스트 (16개 파일, 206개 테스트)
│   ├── mcp-servers/
│   │   └── doc-processor/      # 문서 처리 MCP 서버 (@pwc/doc-processor)
│   │       └── src/
│   │           ├── index.ts    # MCP 서버 설정 (3개 도구 등록)
│   │           ├── types.ts    # ParsedDocument, SpreadsheetContent, Section 타입
│   │           ├── tools/
│   │           │   ├── parse-xlsx.ts  # Excel 파싱 (병합셀, 숨긴행/열, 헤더 자동감지)
│   │           │   ├── parse-pdf.ts   # PDF 텍스트 추출 (섹션/테이블 구조화)
│   │           │   └── parse-docx.ts  # Word HTML 변환 후 구조화
│   │           └── utils/
│   │               ├── xlsx-helpers.ts # unmerge, detectHeaders, toMarkdownTable, filterHidden, formatCellValue
│   │               └── chunk-helpers.ts # chunkText (단락→문장 분할), flattenSections
│   ├── plugins/
│   │   └── pwc-finance-legal/  # 금융/세무/감사 도메인 플러그인
│   │       ├── index.js        # 플러그인 엔트리포인트
│   │       ├── package.json
│   │       ├── skills/         # excel-analysis, tax-case-review, financial-audit
│   │       └── commands/       # analyze-excel, parse-document, review-tax-case, synthesize
│   └── docs/                   # Mintlify 문서
├── .opencode/                  # OpenCode 워크스페이스 설정
│   ├── skills/                 # 9개 커스텀 스킬
│   ├── commands/               # 3개 커스텀 명령어
│   └── agent/                  # 에이전트 정의
├── packaging/docker/           # Docker 설정
├── scripts/                    # 빌드/개발 스크립트
└── patches/                    # @solidjs/router 패치
```

### 패키지 간 의존 관계

| 패키지                      | 버전     | 설명                                 |
| --------------------------- | -------- | ------------------------------------ |
| `openwork-orchestrator`     | 0.11.133 | 전체 스택 프로세스 관리 + LLM 프록시 |
| `openwork-server`           | 0.11.133 | 파일시스템 API 서버 (60+ 엔드포인트) |
| `@different-ai/openwork-ui` | 0.11.133 | SolidJS 웹 프론트엔드 (15 페이지)    |
| `@pwc/doc-processor`        | 0.1.0    | XLSX/PDF/DOCX 문서 처리 MCP 서버     |
| `pwc-finance-legal`         | 0.1.0    | 금융/세무 도메인 플러그인            |

---

## 사전 요구사항

- **Node.js** 22+
- **pnpm** 10.27+
- **Bun** 1.3+ (서버/오케스트레이터 런타임)

---

## 환경 설정

```bash
# 환경 파일 생성
cp .env.example .env
```

### 환경변수 상세

| 변수                           | 설명                              | 기본값                                                    |
| ------------------------------ | --------------------------------- | --------------------------------------------------------- |
| `LLM_ENV`                      | LLM 환경 선택: `pwc` 또는 `local` | `pwc`                                                     |
| **PwC 모드 (LLM_ENV=pwc)**     |                                   |                                                           |
| `PWC_API_KEY`                  | PwC GenAI Shared Service API 키   | (필수)                                                    |
| `PWC_BASE_URL`                 | PwC API 엔드포인트                | `https://genai-sharedservice-americas.pwcinternal.com/v1` |
| `PRIMARY_MODEL`                | 주요 모델                         | `bedrock.anthropic.claude-sonnet-4`                       |
| `FALLBACK_MODEL`               | 폴백 모델 (429/500/502 시)        | `azure.gpt-5.2-2025-12-11`                                |
| **Local 모드 (LLM_ENV=local)** |                                   |                                                           |
| `OPENAI_API_KEY`               | OpenAI API 키                     | (필수)                                                    |
| `LOCAL_PRIMARY_MODEL`          | 주요 모델                         | `gpt-5.2`                                                 |
| `LOCAL_FALLBACK_MODEL`         | 폴백 모델                         | `gpt-5.2-mini`                                            |

### 서버 환경변수 (선택)

| 변수                           | 설명                          | 기본값      |
| ------------------------------ | ----------------------------- | ----------- |
| `OPENWORK_TOKEN`               | 클라이언트 Bearer 토큰        | 자동 생성   |
| `OPENWORK_HOST_TOKEN`          | 호스트 승인 토큰              | 자동 생성   |
| `OPENWORK_HOST`                | 서버 바인딩 호스트            | `127.0.0.1` |
| `OPENWORK_PORT`                | 서버 포트                     | `8787`      |
| `OPENWORK_APPROVAL_MODE`       | 승인 모드: `auto` / `manual`  | `manual`    |
| `OPENWORK_APPROVAL_TIMEOUT_MS` | 승인 타임아웃 (ms)            | `30000`     |
| `OPENWORK_CORS_ORIGINS`        | CORS 허용 오리진 (쉼표 구분)  | `*`         |
| `OPENWORK_READONLY`            | 읽기 전용 모드                | `false`     |
| `OPENWORK_LOG_FORMAT`          | 로그 형식: `pretty` / `json`  | `pretty`    |
| `OPENWORK_WORKSPACES`          | 워크스페이스 경로 (쉼표 구분) | -           |

---

## 빠른 시작

```bash
# 1. 의존성 설치
pnpm install

# 2. 환경 설정
cp .env.example .env
# .env 파일에서 LLM_ENV 및 API 키 설정

# 3. 백엔드 시작 (오케스트레이터 + OpenCode + 서버)
# --workspace 플래그로 프로젝트 루트를 명시 (bunfig.toml preload 충돌 방지)
pnpm dev -- --workspace $(pwd)

# 4. UI 개발 서버 시작 (별도 터미널)
pnpm dev:ui

# 5. 브라우저 접속
# http://localhost:3000
# UI 설정에서 OpenWork 서버 URL과 토큰을 입력 (콘솔 출력 참조)
```

> **Windows 참고:** PowerShell에서는 `$(pwd)` 대신 `$PWD` 또는 `(Get-Location).Path`를 사용하세요:
>
> ```powershell
> pnpm dev -- --workspace (Get-Location).Path
> ```

### `--workspace` 플래그가 필요한 이유

pnpm이 `packages/orchestrator/`를 CWD로 설정하여 서버 서브프로세스를 실행합니다. 이때 `packages/orchestrator/bunfig.toml`의 `preload = ["@opentui/solid/preload"]` 설정이 Bun 컴파일된 서버 바이너리에 적용되어 `preload not found` 에러가 발생합니다. `--workspace $(pwd)`로 프로젝트 루트를 명시하면 이 충돌을 방지합니다.

---

## LLM 환경 전환 (PwC / Local)

### PwC 모드 (사내 네트워크)

PwC GenAI Shared Service API를 통해 Bedrock Claude, Azure GPT 등 사내 승인 모델을 사용합니다.

```env
LLM_ENV=pwc
PWC_API_KEY=your-pwc-api-key
PWC_BASE_URL=https://genai-sharedservice-americas.pwcinternal.com/v1
PRIMARY_MODEL=bedrock.anthropic.claude-sonnet-4
FALLBACK_MODEL=azure.gpt-5.2-2025-12-11
```

### Local 모드 (개발 환경)

PwC 네트워크 외부에서 개발할 때 OpenAI API를 직접 사용합니다.

```env
LLM_ENV=local
OPENAI_API_KEY=sk-proj-your-openai-key
LOCAL_PRIMARY_MODEL=gpt-5.2
LOCAL_FALLBACK_MODEL=gpt-5.2-mini
```

**동작 원리:**

```typescript
// resolveProxyConfig() 핵심 로직
if (llmEnv === "local") {
  return {
    port: 4097,
    baseUrl: "https://api.openai.com", // OpenAI 직접
    apiKey: process.env.OPENAI_API_KEY,
    primaryModel: process.env.LOCAL_PRIMARY_MODEL ?? "gpt-5.2",
    fallbackModel: process.env.LOCAL_FALLBACK_MODEL ?? "gpt-5.2-mini",
  };
}
// pwc mode (default)
return {
  port: 4097,
  baseUrl: process.env.PWC_BASE_URL, // PwC GenAI API
  apiKey: process.env.PWC_API_KEY,
  primaryModel:
    process.env.PRIMARY_MODEL ?? "bedrock.anthropic.claude-sonnet-4",
  fallbackModel: process.env.FALLBACK_MODEL ?? "azure.gpt-5.2-2025-12-11",
};
```

**사용 가능한 OpenAI 모델 (2026년 3월 기준):**

- `gpt-5.2` — 추론/사고 작업용 (기본)
- `gpt-5.2-mini` — 경량 폴백
- `gpt-5.2-pro` — 전문가용 확장 추론
- `gpt-5.2-codex` — 코딩 특화

---

## API 엔드포인트

OpenWork Server는 60개 이상의 REST 엔드포인트를 제공합니다. 인증은 3단계입니다:

| 인증 모드 | 설명                                               | 예시                                  |
| --------- | -------------------------------------------------- | ------------------------------------- |
| `none`    | 인증 불필요                                        | `/health`, `/ui`                      |
| `client`  | Bearer 토큰 필요 (`Authorization: Bearer <token>`) | 대부분의 읽기/쓰기 API                |
| `host`    | 호스트 토큰 필요 (토큰 관리, 워크스페이스 활성화)  | `/tokens`, `/workspaces/:id/activate` |

### 주요 엔드포인트

| 메서드           | 경로                          | 인증   | 설명                                                    |
| ---------------- | ----------------------------- | ------ | ------------------------------------------------------- |
| GET              | `/health`                     | none   | 서버 상태                                               |
| GET              | `/capabilities`               | client | 서버 기능 목록 (스킬, 플러그인, MCP, 승인, 샌드박스 등) |
| GET              | `/workspaces`                 | client | 등록된 워크스페이스 목록                                |
| GET              | `/whoami`                     | client | 현재 토큰의 스코프 확인                                 |
| GET              | `/status`                     | client | 서버 버전, 업타임, OpenCode 연결 상태                   |
| **토큰 관리**    |                               |        |                                                         |
| GET              | `/tokens`                     | host   | 발급된 토큰 목록                                        |
| POST             | `/tokens`                     | host   | 새 토큰 발급 (`{ scope, label }`)                       |
| DELETE           | `/tokens/:id`                 | host   | 토큰 폐기                                               |
| **워크스페이스** |                               |        |                                                         |
| GET              | `/workspace/:id/config`       | client | OpenCode 설정 조회                                      |
| PATCH            | `/workspace/:id/config`       | client | OpenCode 설정 수정                                      |
| GET              | `/workspace/:id/audit`        | client | 감사 로그 조회                                          |
| GET              | `/workspace/:id/events`       | client | SSE 이벤트 스트림                                       |
| **파일 인젝션**  |                               |        |                                                         |
| POST             | `/workspace/:id/inbox`        | client | 파일 업로드 (승인 워크플로우 적용)                      |
| GET              | `/workspace/:id/inbox`        | client | 인젝션 세션 상태 조회                                   |
| GET              | `/workspace/:id/artifacts`    | client | 아티팩트 목록                                           |
| **스킬**         |                               |        |                                                         |
| GET              | `/workspace/:id/skills`       | client | 스킬 목록                                               |
| POST             | `/workspace/:id/skills`       | client | 스킬 추가/수정                                          |
| DELETE           | `/workspace/:id/skills/:name` | client | 스킬 삭제                                               |
| GET              | `/hub/skills`                 | client | 허브 스킬 검색                                          |
| **플러그인**     |                               |        |                                                         |
| GET              | `/workspace/:id/plugins`      | client | 플러그인 목록                                           |
| POST             | `/workspace/:id/plugins`      | client | 플러그인 추가                                           |
| DELETE           | `/workspace/:id/plugins`      | client | 플러그인 삭제                                           |
| **MCP**          |                               |        |                                                         |
| GET              | `/workspace/:id/mcp`          | client | MCP 서버 목록                                           |
| POST             | `/workspace/:id/mcp`          | client | MCP 서버 추가                                           |
| DELETE           | `/workspace/:id/mcp/:name`    | client | MCP 서버 삭제                                           |

### 토큰 스코프

| 스코프         | 읽기 | 쓰기 | 설명                           |
| -------------- | ---- | ---- | ------------------------------ |
| `owner`        | O    | O    | 모든 권한                      |
| `collaborator` | O    | O    | 대부분의 권한 (토큰 관리 제외) |
| `viewer`       | O    | X    | 읽기 전용                      |

---

## 개발 가이드

```bash
# 타입 체크
pnpm typecheck

# UI 빌드
pnpm build:ui

# UI 개발 서버
pnpm dev:ui

# 오케스트레이터 빌드
cd packages/orchestrator && pnpm build

# 서버 빌드
cd packages/server && pnpm build

# MCP 서버 빌드
cd packages/mcp-servers/doc-processor && pnpm build
```

### 주요 스크립트

| 스크립트         | 설명                             |
| ---------------- | -------------------------------- |
| `pnpm dev`       | 오케스트레이터 시작 (전체 스택)  |
| `pnpm dev:ui`    | SolidJS UI 개발 서버 (Vite, HMR) |
| `pnpm build`     | 프로덕션 빌드                    |
| `pnpm typecheck` | TypeScript 타입 체크             |
| `pnpm test:e2e`  | E2E 테스트 (Playwright)          |

---

## 테스트

전체 **271개 테스트** (서버 206개 + 오케스트레이터 23개 + doc-processor 42개), 0 실패.

### 단위 테스트

```bash
# 서버 패키지 테스트 (206개 테스트)
cd packages/server && bun test

# 오케스트레이터 프록시 단위 테스트 (19개 테스트)
cd packages/orchestrator && bun test src/llm-fallback-proxy.test.ts

# doc-processor MCP 서버 테스트 (42개 테스트)
cd packages/mcp-servers/doc-processor && bun test

# 전체 테스트 한번에 실행
cd packages/server && bun test && cd ../orchestrator && bun test && cd ../mcp-servers/doc-processor && bun test
```

### 통합 테스트 (실제 OpenAI API 호출)

```bash
# .env에 LLM_ENV=local 및 OPENAI_API_KEY 설정 후
export $(grep -v '^#' .env | xargs)
cd packages/orchestrator && bun test src/llm-integration.test.ts
```

> 통합 테스트는 `LLM_ENV=local`과 `OPENAI_API_KEY`가 설정된 경우에만 실행되며, 미설정 시 skip됩니다.

### 커버리지 현황

| 모듈                    | 라인 커버리지 | 비고                                       |
| ----------------------- | ------------- | ------------------------------------------ |
| `llm-fallback-proxy.ts` | 100%          | 프록시/폴백 로직 완전 커버                 |
| `approvals.ts`          | 100%          | auto/manual 모드 + 타임아웃                |
| `audit.ts`              | 100%          | 감사 로그 기록/조회/포맷                   |
| `errors.ts`             | 100%          | ApiError 생성 + formatError                |
| `events.ts`             | 100%          | ReloadEventStore CRUD                      |
| `file-sessions.ts`      | 100%          | 파일 세션 생명주기                         |
| `frontmatter.ts`        | 100%          | YAML 프론트매터 파싱/생성                  |
| `jsonc.ts`              | 100%          | JSONC 읽기/쓰기/업데이트                   |
| `workspace-files.ts`    | 100%          | 설정 경로 해석                             |
| `workspaces.ts`         | 100%          | 워크스페이스 ID/빌드                       |
| `instructions.ts`       | 98%           | 인스트럭션 CRUD                            |
| `validators.ts`         | 98%           | 이름/설정 유효성 검증                      |
| `plugins.ts`            | 97%           | 플러그인 관리                              |
| `commands.ts`           | 96%           | 명령어 CRUD                                |
| `mcp.ts`                | 93%           | MCP 설정 관리                              |
| `tokens.ts`             | 84%           | 토큰 인증 (owner/collaborator/viewer)      |
| `skills.ts`             | 80%           | 스킬 CRUD                                  |
| `scheduler.ts`          | 67%           | 예약 작업 (macOS/Linux/Windows)            |
| `chunk-helpers.ts`      | ~100%         | 텍스트 청킹 + 섹션 플래트닝                |
| `xlsx-helpers.ts`       | ~100%         | 헤더 감지, Markdown 테이블, 숨긴 행/열     |
| `parse-xlsx.ts`         | ~100%         | E2E XLSX 파싱 (병합셀, 시트 선택, 행 제한) |

### 테스트 파일 목록

**오케스트레이터 (23개 테스트)**

| 테스트 파일                  | 대상 모듈                                                  | 테스트 수 |
| ---------------------------- | ---------------------------------------------------------- | --------- |
| `llm-fallback-proxy.test.ts` | resolveProxyConfig, rewriteModelInBody, startFallbackProxy | 19        |
| `llm-integration.test.ts`    | 실제 OpenAI API 통합 (gated, 4 skip)                       | 4         |

**서버 (206개 테스트)**

| 테스트 파일               | 대상 모듈                                                     | 테스트 수 |
| ------------------------- | ------------------------------------------------------------- | --------- |
| `approvals.test.ts`       | ApprovalService (auto/manual/timeout)                         | 7         |
| `audit.test.ts`           | recordAudit, readLastAudit, readAuditEntries                  | 9         |
| `commands.test.ts`        | listCommands, upsertCommand, deleteCommand                    | 9         |
| `errors.test.ts`          | ApiError, formatError                                         | 8         |
| `events.test.ts`          | ReloadEventStore                                              | 다수      |
| `file-sessions.test.ts`   | FileSessionManager                                            | 다수      |
| `frontmatter.test.ts`     | parseFrontmatter, buildFrontmatter                            | 다수      |
| `instructions.test.ts`    | getInstructions, saveInstructions, ensureInstructionsInConfig | 8         |
| `jsonc.test.ts`           | readJsoncFile, updateJsoncTopLevel                            | 다수      |
| `mcp.test.ts`             | listMcp, addMcp, removeMcp                                    | 11        |
| `plugins.test.ts`         | normalizePluginSpec, listPlugins, addPlugin, removePlugin     | 12        |
| `scheduler.test.ts`       | listScheduledJobs, resolveScheduledJob                        | 7         |
| `skills.test.ts`          | listSkills, upsertSkill, deleteSkill                          | 10        |
| `tokens.test.ts`          | TokenService (create/revoke/scopeForToken)                    | 다수      |
| `validators.test.ts`      | sanitizeCommandName, validateMcpName 등                       | 다수      |
| `workspace-files.test.ts` | opencodeConfigPath 등 경로 함수                               | 8         |
| `workspaces.test.ts`      | workspaceIdForPath, buildWorkspaceInfos                       | 8         |

**doc-processor MCP 서버 (42개 테스트)**

| 테스트 파일             | 대상 모듈                                                                                                     | 테스트 수 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- | --------- |
| `chunk-helpers.test.ts` | chunkText (단락/문장 분할), flattenSections (중첩 해제)                                                       | 12        |
| `xlsx-helpers.test.ts`  | detectHeaders (헤더 행 탐지), toMarkdownTable (MD 변환), filterHidden (숨긴 행/열), formatCellValue (셀 서식) | 16        |
| `parse-xlsx.test.ts`    | parseXlsx E2E (단일/멀티 시트, 시트명/인덱스 선택, 행 제한, 비존재 파일 처리)                                 | 10        |

---

## MCP 서버: doc-processor

`@pwc/doc-processor`는 문서 파싱을 위한 [MCP (Model Context Protocol)](https://modelcontextprotocol.io) 서버입니다. stdio 트랜스포트를 사용하며, OpenCode가 자동으로 프로세스를 관리합니다.

### 지원 도구

| 도구         | 설명                          | 입력 파라미터                                                                                         |
| ------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| `parse_xlsx` | Excel 스프레드시트 파싱       | `filePath` (필수), `sheetName?`, `sheetIndex?`, `maxRows?` (기본 5000), `includeHidden?` (기본 false) |
| `parse_pdf`  | PDF 텍스트 추출 및 구조화     | `filePath` (필수), `maxPages?`                                                                        |
| `parse_docx` | Word 문서 HTML 변환 후 구조화 | `filePath` (필수)                                                                                     |

### parse_xlsx 상세

Excel 파싱은 다음 단계로 진행됩니다:

1. **파일 읽기** — `XLSX.read(buffer, { cellDates: true, raw: false })`로 날짜를 Date 객체로, 숫자를 포맷된 문자열로 파싱
2. **병합 셀 해제** — `unmerge(ws)`: 병합 영역의 모든 셀에 좌상단 값을 복사
3. **숨긴 행/열 감지** — `filterHidden(ws)`: `!rows`, `!cols` 메타데이터에서 hidden 플래그 확인
4. **헤더 자동 감지** — `detectHeaders(rows)`: 비어있는 행을 건너뛰고, 50% 이상의 셀이 문자열인 첫 번째 행을 헤더로 선택
5. **행 제한** — `maxRows` 초과 시 `isTruncated: true`로 표시
6. **Markdown 테이블 생성** — `toMarkdownTable(headers, rows)`: 파이프 이스케이프 처리 포함

### 출력 타입 (`ParsedDocument`)

```typescript
interface ParsedDocument {
  metadata: {
    filename: string;
    format: "xlsx" | "pdf" | "docx";
    totalPages?: number; // PDF
    totalSheets?: number; // XLSX
    totalSections?: number; // PDF/DOCX
    parsedAt: string; // ISO 8601
  };
  content: (SpreadsheetContent | TextContent)[];
}

interface SpreadsheetContent {
  type: "spreadsheet";
  sheetName: string;
  sheetIndex: number;
  headers: string[];
  rows: Record<string, string | number | null>[];
  markdown: string; // Markdown 테이블
  totalRows: number;
  isTruncated: boolean;
  mergedRegions?: MergedRegion[];
  hiddenRows?: number[];
  hiddenColumns?: number[];
}

interface TextContent {
  type: "text";
  sections: Section[]; // 중첩 트리 구조
}

interface Section {
  heading: string;
  level: number; // 0=본문, 1=h1, 2=h2, ...
  content: string;
  children?: Section[];
  tables?: TableData[];
}
```

### 실행

```bash
# 빌드
cd packages/mcp-servers/doc-processor && pnpm build

# opencode.jsonc에 등록 (이미 설정됨)
# "doc-processor": { "type": "local", "command": ["node", "./packages/mcp-servers/doc-processor/dist/index.js"] }
```

---

## 플러그인: pwc-finance-legal

PwC 금융/세무/감사 도메인에 특화된 OpenCode 플러그인입니다.

### 스킬

| 스킬              | 설명                                                           |
| ----------------- | -------------------------------------------------------------- |
| `excel-analysis`  | K-IFRS 재무제표 분석, 시산표 검증, 에이징 스케줄, Roll-forward |
| `financial-audit` | 감사 절차 및 내부통제 평가                                     |
| `tax-case-review` | 세법 및 판례 분석                                              |

### 명령어

| 명령어             | 설명                   |
| ------------------ | ---------------------- |
| `/analyze-excel`   | 스프레드시트 심층 분석 |
| `/parse-document`  | 문서 파싱 지시         |
| `/review-tax-case` | 세무 사례 분석         |
| `/synthesize`      | 분석 결과 종합         |

---

## 커스텀 스킬 & 명령어

### 스킬 (`.opencode/skills/`)

스킬은 AI 에이전트의 행동 패턴을 정의하는 Markdown 파일입니다. 각 스킬은 `SKILL.md` 파일과 선택적 메타데이터(YAML 프론트매터)로 구성됩니다.

| 스킬                         | 설명                                                      |
| ---------------------------- | --------------------------------------------------------- |
| `openwork-core`              | 핵심 시스템 스킬                                          |
| `openwork-debug`             | 디버깅 유틸리티                                           |
| `browser-setup-devtools`     | 브라우저 DevTools 연동                                    |
| `get-started`                | 온보딩 가이드                                             |
| `opencode-mirror`            | OpenCode 문서 참조                                        |
| `opencode-primitives`        | OpenCode 확장 패턴 (MCP/플러그인/스킬/명령어 선택 가이드) |
| `openwork-docker-chrome-mcp` | Docker + Chrome MCP 설정                                  |
| `powershell-guide`           | Windows PowerShell 가이드                                 |
| `solidjs-patterns`           | SolidJS 패턴 가이드                                       |

### 명령어 (`.opencode/commands/`)

| 명령어           | 설명               |
| ---------------- | ------------------ |
| `browser-setup`  | 브라우저 환경 설정 |
| `hello-stranger` | 온보딩 대화        |
| `release`        | 릴리스 프로세스    |

### 스킬 생성 예시

```
.opencode/skills/my-skill/SKILL.md
```

```markdown
---
name: my-skill
description: 커스텀 스킬 설명
trigger: "분석해줘"
---

# My Skill

이 스킬은 ...
```

---

## 보안 모델

### 2계층 인가

```
[사용자] → UI에서 폴더 선택 (1계층)
    ↓
[OpenWork Server] → authorizedRoots 확인 (2계층)
    ↓
[OpenCode Server] → 퍼미션 이벤트 발생 시 UI에서 승인/거부
```

### 파일 인젝션 워크플로우

1. 사용자가 브라우저에서 파일을 드래그 앤 드롭
2. 서버가 `FileSessionStore`에 세션 생성 (TTL 기본 15분, 최대 24시간)
3. 승인 모드에 따라:
   - `auto`: 즉시 허용
   - `manual`: 호스트의 승인/거부 대기 (타임아웃 시 자동 거부)
4. 승인 후 `authorizedRoots` 내 경로에 파일 저장
5. 모든 작업이 감사 로그에 기록

### 토큰 보안

- 토큰은 SHA-256 해시로 저장 (`hashToken()`)
- 원본 토큰은 생성 시 1회만 반환
- `tokens.json`에는 해시값만 저장

---

## Docker 배포

```bash
# 개발 환경
cd packaging/docker
docker-compose -f docker-compose.dev.yml up

# 프로덕션
docker-compose up
```

자세한 내용은 `packaging/docker/README.md` 참조.

---

## OpenCode 설정 (opencode.jsonc)

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "model": "openai/bedrock.anthropic.claude-sonnet-4",
  "mcp": {
    "doc-processor": {
      "type": "local",
      "command": ["node", "./packages/mcp-servers/doc-processor/dist/index.js"],
    },
  },
  "plugin": [],
}
```

> **참고:** `pwc-finance-legal` 플러그인은 pnpm 워크스페이스를 통해 로드됩니다. `file://` 참조는 Bun 런타임의 경로 해석 문제로 사용하지 않습니다.

---

## 트러블슈팅

### `preload not found "@opentui/solid/preload"` 에러

**원인:** `pnpm dev` 실행 시 CWD가 `packages/orchestrator/`로 설정되어, 해당 디렉토리의 `bunfig.toml` preload 설정이 서버 바이너리에 적용됩니다.

**해결:** `--workspace` 플래그로 프로젝트 루트를 명시합니다:

```bash
pnpm dev -- --workspace $(pwd)
```

### UI에서 "Unavailable" 표시

**원인:** 브라우저 localStorage에 이전 세션의 stale한 서버 URL/토큰이 남아있습니다.

**해결:** 브라우저 콘솔에서 다음 실행 후 새로고침:

```javascript
localStorage.removeItem("openwork.server.active");
localStorage.removeItem("openwork.server.list");
```

### XLSX.writeFile Bun 호환성

**원인:** SheetJS의 `writeFile()`은 내부 `File()` 생성자를 사용하며 Bun에서 동작하지 않습니다.

**해결:** 테스트 코드에서 `XLSX.write()` + `writeFileSync()` 조합을 사용합니다:

```typescript
const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
writeFileSync(filePath, buf);
```

### Windows 스케줄러

Windows에서는 `Task Scheduler`(schtasks)를 사용하여 예약 작업을 관리합니다. 작업 경로는 `\OpenCode\Jobs\` 하위에 생성됩니다.

---

## 라이선스

MIT License - [LICENSE](./LICENSE) 참조.
