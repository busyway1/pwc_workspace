# PwC Workspace Agent Architecture

## Design Principle: Predictable > Clever

PwC Workspace Agent optimizes for **predictability** over "clever" auto-detection. Users should be able to form a correct mental model of what will happen.

Guidelines:

- Prefer **explicit configuration** (a single setting or env var) over heuristics.
- Auto-detection is acceptable as a convenience, but must be:
  - explainable (we can tell the user what we tried)
  - overrideable (one obvious escape hatch)
  - safe (no surprising side effects)
- When a prerequisite is missing, surface the **exact failing check** and a concrete next step.

## opencode Primitives

How to pick the right extension abstraction for opencode:

opencode has extensibility options:
mcp / plugins / skills / bash / agents / commands

- **mcp** - Use when you need authenticated third-party flows (oauth) and want to expose that safely to end users.
- **bash / raw cli** - Use only for advanced users or internal power workflows.
- **plugins** - Use when you need real tools in code and want to scope permissions around them.
- **skills** - Use when you want reliable plain-english patterns that shape behavior.
- **agents** - Use when you need tasks executed by different models with extra context.
- **commands** - `/` commands that trigger tools.

## Core Architecture

PwC Workspace Agent is a web-only client experience that consumes server surfaces.

```
[Browser - SolidJS App]  -->  [Orchestrator]  -->  [OpenCode Server]
                                    |                      |
                                    v                      v
                            [OpenWork Server]    [LLM Fallback Proxy]
                            (Filesystem API)           |
                                                       v
                                            [PwC GenAI API]
                                            (OpenAI-compatible)
```

### Runtime Mode: Web Host

- The orchestrator starts OpenCode locally.
- The OpenCode server runs on loopback (default `127.0.0.1:4096`).
- The SolidJS UI connects via the official SDK and listens to events.
- The LLM Fallback Proxy sits between OpenCode and PwC's GenAI API.

### LLM Fallback Proxy

A lightweight HTTP proxy that:
1. Receives OpenAI-compatible requests from OpenCode
2. Forwards to `PWC_BASE_URL` with `Authorization: Bearer <PWC_API_KEY>`
3. On 429/500/502 from primary model, retries with the fallback model
4. Returns the response to OpenCode

## Web Parity + Filesystem Actions

The browser runtime cannot read or write arbitrary local files. Any feature that:

- reads skills/commands/plugins from `.opencode/`
- edits `SKILL.md` / command templates / `opencode.json`
- opens folders / reveals paths

is routed through the server (`packages/server`).

## OpenCode Integration (SDK + APIs)

Uses the official JavaScript/TypeScript SDK:

- Package: `@opencode-ai/sdk/v2` (UI imports `@opencode-ai/sdk/v2/client`)
- Purpose: type-safe client generated from OpenAPI spec

### Key APIs

- **Health**: `client.global.health()`
- **Events (SSE)**: `client.event.subscribe()`
- **Sessions**: `client.session.create()`, `.list()`, `.get()`, `.messages()`, `.prompt()`, `.abort()`
- **Files**: `client.find.text()`, `.files()`, `.symbols()`, `client.file.read()`, `.status()`
- **Permissions**: `client.permission.reply({ requestID, reply })`
- **Config**: `client.config.get()`, `.providers()`
- **Skills/Plugins**: Installed into `.opencode/skills/*`

## Folder Authorization Model

Two-layer authorization:

1. **UI authorization** - User explicitly selects allowed folders
2. **OpenCode server permissions** - OpenCode requests permissions as needed via events

Rules:
- Default deny for anything outside allowed roots.
- "Allow once" never expands persistent scope.
- "Allow for session" applies only to the session ID.
