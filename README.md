# PwC Workspace Agent

삼일PwC 내부 전용 웹 기반 AI 워크스페이스 에이전트입니다. [OpenCode](https://opencode.ai) 엔진 위에 SolidJS 프론트엔드를 결합한 모노레포 구조로 구성되어 있습니다.

## 목차

- [아키텍처](#아키텍처)
- [패키지 구조](#패키지-구조)
- [사전 요구사항](#사전-요구사항)
- [환경 설정](#환경-설정)
- [빠른 시작](#빠른-시작)
- [LLM 환경 전환](#llm-환경-전환-pwc--local)
- [개발 가이드](#개발-가이드)
- [테스트](#테스트)
- [MCP 서버](#mcp-서버-doc-processor)
- [플러그인](#플러그인-pwc-finance-legal)
- [커스텀 스킬](#커스텀-스킬)
- [Docker 배포](#docker-배포)
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
     |
     v
[LLM Fallback Proxy (4097)]
     |
     v
[LLM API] ─── PwC GenAI API (pwc 모드)
           └── OpenAI API      (local 모드)
```

### 핵심 설계 원칙

- **예측 가능성 > 영리함**: 자동 감지보다 명시적 설정 선호
- **2계층 인가**: UI 레벨 + OpenCode 서버 레벨 권한 분리
- **Fail-Fast**: 로직 실행 전 입력값 검증 우선
- **기본 거부(Default Deny)**: 허용된 루트 외부 접근 차단

### LLM Fallback Proxy

OpenCode와 LLM API 사이에 위치하는 경량 HTTP 프록시입니다:

1. OpenCode로부터 OpenAI-compatible 요청 수신
2. 설정된 LLM API로 포워딩 (PwC 또는 OpenAI)
3. 주요 모델이 429/500/502 에러 반환 시 폴백 모델로 자동 재시도
4. 응답 헤더 정규화 (transfer-encoding/content-encoding 제거 후 content-length 재설정)

---

## 패키지 구조

```
pwc-workspace-agent/
├── packages/
│   ├── app/                    # SolidJS 웹 UI (@different-ai/openwork-ui)
│   │   ├── src/app/
│   │   │   ├── pages/          # 페이지 컴포넌트 (15개)
│   │   │   ├── components/     # 재사용 UI 컴포넌트 (30+)
│   │   │   ├── context/        # 상태 관리 컨텍스트 (11개)
│   │   │   ├── lib/            # 유틸리티 (OpenCode SDK 래퍼 등)
│   │   │   └── state/          # 글로벌 상태
│   │   └── scripts/            # 테스트/빌드 스크립트
│   ├── orchestrator/           # 프로세스 오케스트레이터 (openwork-orchestrator)
│   │   └── src/
│   │       ├── cli.ts          # 메인 CLI 진입점
│   │       ├── llm-fallback-proxy.ts  # LLM API 프록시 (PwC/OpenAI 이중 모드)
│   │       └── tui/            # 터미널 UI
│   ├── server/                 # 파일시스템 API 서버 (openwork-server)
│   │   └── src/
│   │       ├── server.ts       # HTTP API 서버
│   │       ├── config.ts       # 설정 파싱
│   │       ├── skills.ts       # 스킬 CRUD
│   │       ├── plugins.ts      # 플러그인 관리
│   │       ├── mcp.ts          # MCP 서버 설정
│   │       ├── tokens.ts       # 토큰 인증
│   │       ├── approvals.ts    # 승인 워크플로우
│   │       └── *.test.ts       # 단위 테스트
│   ├── mcp-servers/
│   │   └── doc-processor/      # 문서 처리 MCP 서버 (@pwc/doc-processor)
│   │       └── src/
│   │           ├── index.ts    # MCP 서버 설정
│   │           └── tools/      # parse-xlsx, parse-pdf, parse-docx
│   ├── plugins/
│   │   └── pwc-finance-legal/  # 금융/세무/감사 도메인 플러그인
│   │       ├── skills/         # excel-analysis, tax-case-review, financial-audit
│   │       └── commands/       # analyze-excel, parse-document, review-tax-case
│   └── docs/                   # Mintlify 문서
├── .opencode/                  # OpenCode 워크스페이스 설정
│   ├── skills/                 # 11개 커스텀 스킬
│   ├── commands/               # 커스텀 명령어
│   └── agent/                  # 에이전트 정의
├── packaging/docker/           # Docker 설정
├── scripts/                    # 빌드/개발 스크립트
└── patches/                    # @solidjs/router 패치
```

### 패키지 간 의존 관계

| 패키지                      | 버전     | 설명                        |
| --------------------------- | -------- | --------------------------- |
| `openwork-orchestrator`     | 0.11.133 | 전체 스택 프로세스 관리     |
| `openwork-server`           | 0.11.133 | 파일시스템 API 서버         |
| `@different-ai/openwork-ui` | 0.11.133 | SolidJS 웹 프론트엔드       |
| `@pwc/doc-processor`        | 0.1.0    | XLSX/PDF/DOCX 문서 처리 MCP |
| `pwc-finance-legal`         | 0.1.0    | 금융/세무 도메인 플러그인   |

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

---

## 빠른 시작

```bash
# 1. 의존성 설치
pnpm install

# 2. 환경 설정
cp .env.example .env
# .env 파일에서 LLM_ENV 및 API 키 설정

# 3. 백엔드 시작 (오케스트레이터 + OpenCode + 서버)
pnpm dev

# 4. UI 개발 서버 시작 (별도 터미널)
pnpm dev:ui

# 5. 브라우저 접속
# http://localhost:3000
```

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

- `LLM_ENV` 환경변수에 따라 `resolveProxyConfig()`가 적절한 프록시 설정을 반환
- `local` 모드: `https://api.openai.com`으로 직접 포워딩
- `pwc` 모드: `PWC_BASE_URL`로 포워딩
- 두 모드 모두 동일한 폴백 메커니즘 적용 (429/500/502 → 자동 재시도)

**사용 가능한 OpenAI 모델 (2026년 3월 기준):**

- `gpt-5.2` - 추론/사고 작업용 (기본)
- `gpt-5.2-pro` - 전문가용 확장 추론
- `gpt-5.2-codex` - 코딩 특화
- `gpt-5.4` - 최신 모델

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

| 스크립트         | 설명                            |
| ---------------- | ------------------------------- |
| `pnpm dev`       | 오케스트레이터 시작 (전체 스택) |
| `pnpm dev:ui`    | SolidJS UI 개발 서버            |
| `pnpm build`     | 프로덕션 빌드                   |
| `pnpm typecheck` | TypeScript 타입 체크            |

---

## 테스트

전체 **227개 테스트** (서버 206개 + 오케스트레이터 21개), 0 실패.

### 단위 테스트

```bash
# 서버 패키지 테스트 (206개 테스트, 82% 라인 커버리지)
cd packages/server && bun test --coverage

# 오케스트레이터 프록시 단위 테스트 (19개 테스트, 100% 커버리지)
cd packages/orchestrator && bun test src/llm-fallback-proxy.test.ts --coverage
```

### 통합 테스트 (실제 OpenAI API 호출)

```bash
# .env에 LLM_ENV=local 및 OPENAI_API_KEY 설정 후
export $(grep -v '^#' .env | xargs)
cd packages/orchestrator && bun test src/llm-integration.test.ts
```

### 커버리지 현황

| 모듈                    | 라인 커버리지 | 비고                       |
| ----------------------- | ------------- | -------------------------- |
| `llm-fallback-proxy.ts` | 100%          | 프록시/폴백 로직 완전 커버 |
| `approvals.ts`          | 100%          | 승인 워크플로우            |
| `audit.ts`              | 100%          | 감사 로그 기록/조회        |
| `errors.ts`             | 100%          | ApiError + formatError     |
| `events.ts`             | 100%          | ReloadEventStore           |
| `file-sessions.ts`      | 100%          | 파일 세션 CRUD             |
| `frontmatter.ts`        | 100%          | YAML 프론트매터 파싱/생성  |
| `jsonc.ts`              | 100%          | JSONC 읽기/쓰기/업데이트   |
| `workspace-files.ts`    | 100%          | 설정 경로 해석             |
| `workspaces.ts`         | 100%          | 워크스페이스 ID/빌드       |
| `instructions.ts`       | 98%           | 인스트럭션 CRUD            |
| `validators.ts`         | 98%           | 이름/설정 유효성 검증      |
| `plugins.ts`            | 97%           | 플러그인 관리              |
| `commands.ts`           | 96%           | 명령어 CRUD                |
| `mcp.ts`                | 93%           | MCP 설정 관리              |
| `tokens.ts`             | 84%           | 토큰 인증                  |
| `skills.ts`             | 80%           | 스킬 CRUD                  |
| `scheduler.ts`          | 67%           | 예약 작업 관리             |

### 테스트 파일 목록

| 테스트 파일                  | 대상 모듈                                                     | 테스트 수 |
| ---------------------------- | ------------------------------------------------------------- | --------- |
| `llm-fallback-proxy.test.ts` | resolveProxyConfig, rewriteModelInBody, startFallbackProxy    | 19        |
| `llm-integration.test.ts`    | 실제 OpenAI API 통합 (gated)                                  | 2         |
| `approvals.test.ts`          | ApprovalService (auto/manual/timeout)                         | 7         |
| `audit.test.ts`              | recordAudit, readLastAudit, readAuditEntries                  | 9         |
| `commands.test.ts`           | listCommands, upsertCommand, deleteCommand                    | 9         |
| `errors.test.ts`             | ApiError, formatError                                         | 8         |
| `events.test.ts`             | ReloadEventStore                                              | 다수      |
| `file-sessions.test.ts`      | FileSessionManager                                            | 다수      |
| `frontmatter.test.ts`        | parseFrontmatter, buildFrontmatter                            | 다수      |
| `instructions.test.ts`       | getInstructions, saveInstructions, ensureInstructionsInConfig | 8         |
| `jsonc.test.ts`              | readJsoncFile, updateJsoncTopLevel                            | 다수      |
| `mcp.test.ts`                | listMcp, addMcp, removeMcp                                    | 11        |
| `plugins.test.ts`            | normalizePluginSpec, listPlugins, addPlugin, removePlugin     | 12        |
| `scheduler.test.ts`          | listScheduledJobs, resolveScheduledJob                        | 7         |
| `skills.test.ts`             | listSkills, upsertSkill, deleteSkill                          | 10        |
| `validators.test.ts`         | 모든 검증 함수                                                | 다수      |
| `workspace-files.test.ts`    | opencodeConfigPath 등 경로 함수                               | 8         |
| `workspaces.test.ts`         | workspaceIdForPath, buildWorkspaceInfos                       | 8         |

---

## MCP 서버: doc-processor

`@pwc/doc-processor`는 문서 파싱을 위한 MCP (Model Context Protocol) 서버입니다.

### 지원 도구

| 도구         | 설명                    | 주요 파라미터                                    |
| ------------ | ----------------------- | ------------------------------------------------ |
| `parse_xlsx` | Excel 스프레드시트 파싱 | `filePath`, `sheetName?`, `maxRows?` (기본 5000) |
| `parse_pdf`  | PDF 텍스트 추출         | `filePath`                                       |
| `parse_docx` | Word 문서 파싱          | `filePath`                                       |

### 출력 형식

- **스프레드시트**: 시트명, 헤더, 행 데이터, Markdown 테이블, 병합 영역 정보
- **텍스트 문서**: 섹션별 구조화 (제목, 레벨, 내용, 하위 섹션, 테이블)

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

## 커스텀 스킬

스킬은 `.opencode/skills/` 디렉토리의 Markdown 파일입니다. 에이전트의 행동 패턴을 정의합니다.

### 기본 제공 스킬 (11개)

| 스킬                         | 설명                      |
| ---------------------------- | ------------------------- |
| `openwork-core`              | 핵심 시스템 스킬          |
| `openwork-debug`             | 디버깅 유틸리티           |
| `browser-setup-devtools`     | 브라우저 DevTools 연동    |
| `get-started`                | 온보딩 가이드             |
| `opencode-mirror`            | OpenCode 문서             |
| `opencode-primitives`        | OpenCode 패턴             |
| `opencode-router`            | 라우팅                    |
| `openwork-docker-chrome-mcp` | Docker + Chrome MCP       |
| `powershell-guide`           | Windows PowerShell 가이드 |
| `solidjs-patterns`           | SolidJS 패턴              |

### 스킬 생성 예시

```
.opencode/skills/my-skill/SKILL.md
```

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
  "plugin": ["file://./packages/plugins/pwc-finance-legal"],
}
```

---

## 라이선스

MIT License - [LICENSE](./LICENSE) 참조.
