<p align="center">
  <img src="docs/assets/qilin-hero.png" alt="QiLin Agent Engine" width="640" />
</p>

# QiLin

[简体中文](README.md) · **English**

**QiLin** — a production-grade agent engine.
A single Python package that consolidates LangGraph state machines, model orchestration, tool/skill ecosystems, multi-agent orchestration, recursive sub-agents, sandbox isolation, fine-grained authorization, observability, and scheduled tasks — all in one binary / one process. It ships with a **Web workbench** and a **DSH-compatible plugin ecosystem**.

- **Package**: `qilin`
- **Current version**: **v2.0.3** ([release history](#️-release-history))
- **Engine codebase**: `qilin/` ~500 files · 23 subsystems; `web-demo/` ~400 files
- **Python**: ≥ 3.12
- **CLI**: `qilin`

## ✨ Core Capabilities

- **Embedded & service-mode dual runtime** — embed via `QiLinClient` in-process, or deploy as a standalone FastAPI HTTP Agent Server
- **LangGraph-compatible kernel** — state machine + middleware chain, 23 cohesive subsystems
- **Multi-provider model adapters** — OpenAI / Anthropic / DeepSeek / Gemini / Ollama, and more
- **Multi-agent orchestration** — single/multi mode switch, handoff protocol, orchestration graph, AgentInbox message bus, parallel batches, collaboration patterns (orchestrator-workers / peer-consensus)
- **Recursive sub-agents with independent checkpoints**
- **HTTP Agent Server** — REST API + JWT auth + CSRF + GitHub webhooks
- **8 IM channel adapters** — Feishu / Discord / Slack / Telegram / DingTalk / WeCom / WeChat / GitHub
- **Multi-backend sandbox** — Local / aio_sandbox / boxlite / E2B
- **RBAC-style resource authorization + multi-layer loop-detection guardrails**
- **Langfuse / Monocle trace adapters**
- **Skill catalog with static + dynamic scanning, ACP-compatible** (Agent Client Protocol)
- **Web workbench** (Next.js) — conversation stream, workspace file tree with multi-format viewers, xterm.js terminal, plugin management
- **DSH-compatible plugin host** — T1/T2/T3 plugin protocols + lifecycle CLI + npm install chain
- **"Everything-is-a-port" architecture** — terminal PTY / surface viewers / skills / language / fs-git capability bridge

## 🗺️ Release History

### v1.0.0 · Single-Agent Framework (2026-07-29)

First stable release. The engine kernel was extracted from `deer-flow` and renamed to `qilin`, establishing the "single lead agent + tool-style sub-agents" shape (hierarchical delegation via `task_tool` — call, return, discard):

- LangGraph state-machine kernel + middleware chain, embedded `QiLinClient` entry
- Multi-provider model adapters, tool/skill/MCP ecosystem, recursive sub-agents
- Sandbox isolation, memory & persistent checkpoints, safety guardrails, RBAC authorization
- Langfuse/Monocle observability, Textual TUI, scheduled tasks

### v2.0.0 · Multi-Agent Framework + Service Surface (2026-08-07)

Two leaps on top of the single-agent base (driven by `orchestration.mode`; `single` is the default with v1 behavior fully unchanged):

- **Multi-agent orchestration**: handoff protocol (`AgentHandoff/HandoffResult/HandoffError`) → OrchestratorGraph → AgentInbox message bus (per-agent queues + subscribe/broadcast) → collaboration patterns (orchestrator-workers / peer-consensus)
- **Parallel sub-agent batches**: semaphore throttling + failure isolation
- **Agent identity + per-agent token quotas + trace correlation**
- **Complete service surface `app/`**: FastAPI HTTP Agent Server (REST + JWT/CSRF/webhooks), 8 IM channel adapters, scheduled-task HTTP service; shipped in the wheel with a CI packaging gate

### v2.0.1 · Web Workbench + DSH Interaction Alignment (2026-08-29)

First delivery of the `web-demo` (Next.js) workbench, aligned with DSH interaction patterns:

- **Workspace sidebar**: workspace-grouped tree, TanStack Query data layer, mobile drawer (<768px bottom sheet)
- **File viewer suite**: Markdown (mermaid + katex) / PDF / image / HTML (sandboxed iframe) / editable CodeMirror viewers, TabBar panels + debounced persistence
- **DSH-style message stream**: thinking, prose and tool calls interleaved in true source order, card-less rendering; minimal user bubbles
- **Unified assistant footer**: copy / branch thread (copy to new session) / regenerate + response time, model and token usage metadata; URL route sync
- **Gateway engine side**: workspace registry (registry-bound threads execute in their real directory), `sandbox_mode` folded through to tool gates, goal round-driver (event-sourced CAS + SSE), terminal-edge semantics
- Icon-only collapsed sidebar rail, full-access confirmation dialog, version badge

### v2.0.2 · DSH Plugin-Host Compatibility + Everything-is-a-Port (2026-09-02)

The QiLin web workbench officially joins the **DSH plugin ecosystem**, and the "everything-is-a-port" architecture lands:

- **Plugin-host kernel**: DSH plugin protocol shim — `window.__ModuleLoader__.load` loading protocol, T1 tab panels, T2 sidebar services (`qiLin.sidebar` service bridge), T3 in-conversation file review (uiConversation event registry + full undo/redo)
- **Real third-party plugins E2E**: kcoder-git-panel, kcoder-terminal, kcoder-language (Chinese-reply acceptance), kcoder-skills (37 skills materialized)
- **Plugin lifecycle**: `dsh plugin add/remove/upgrade/list` CLI + npm install chain (`npm pack` → staging → distribution → manifest upsert) + `/workspace/plugins` management page (install / enable / disable / remove)
- **Ports architecture**: terminal port (DSH-compatible protocol + POSIX PTY + Windows ConPTY backends + 8 DSH-compatible LangChain tools + xterm.js terminal page), SurfacePort + `sidebar_open` tool, skills port, language port, tools/post-execute event surface
- **Capability bridge**: fenced fs/git services injected into the plugin host; pty→ports bridge removing native limitations
- **Brand & UX**: two-character Qilin seal logo (favicon synced), persistent message footer with like/dislike, prominent new-task button
- **Quality**: ports-surface auth-compatibility fix (403/401), repo-wide audit cleanup (−1,071 lines, zero ruff warnings); backend pytest 999+, frontend vitest 391 all green

### v2.0.3 · Steer-While-Running + Loop-Guard Rework (2026-09-12)

Steer a running agent directly, plus a full rework of the loop-detection guardrail:

- **Steer while running**: `InjectMiddleware` per-thread injection registry + `POST /api/threads/{tid}/runs/{rid}/inject` (404/409/202 semantics); injections are drained before each model call and persisted with the checkpoint; the worker's `finally` drains unconsumed injections back into thread history so nothing is lost
- **Busy-input UX**: queued-messages-bar with a collapsible count header, one-line previews and a steer button (running-only, auto-fallback to queueing on failure), `busyEnter` preference (queue / steer, `Cmd/Ctrl+Enter` inverts), new "Enter key while busy" setting on the general settings page
- **Loop-detection rework**: Layer 1 consecutive-chain semantics + exact argument canonicalization (description dropped, line ranges kept exact), tiered reminders (reminders at 3/5/8, hard stop at 12), denial-aware early break for rejected/failed repeats; Layer 2 windowed frequency retained
- **Web UX**: turn-tail `QiLin....` cinnabar shimmer status + per-turn duration stats, collapsed-sidebar trigger relocated to the brand row, topbar token badge removed
- **Plugin runtime manifest out of the tree**: manifest moved to the gitignored area behind `GET /qilin-plugins/manifest`, so installs/uninstalls no longer dirty the worktree
- **Engineering**: `release.yml` — `v*` tag pushes automatically pass the CI gate and publish a GitHub Release

> Full notes per release: [RELEASE_NOTES_v1.0.0.md](RELEASE_NOTES_v1.0.0.md) / [v2.0.0](RELEASE_NOTES_v2.0.0.md) / [v2.0.1](RELEASE_NOTES_v2.0.1.md) / [v2.0.2](RELEASE_NOTES_v2.0.2.md) / [v2.0.3](RELEASE_NOTES_v2.0.3.md).

## 📦 Installation

```bash
# Core installation (kernel only)
pip install qilin

# With TUI workbench
pip install "qilin[tui]"

# All optional features
pip install "qilin[postgres,redis,monocle,browser,boxlite]"

# Agent Server / IM channels
pip install "qilin[gateway,channels]"
```

Optional extras:

| Extra | Pulls in |
|-------|----------|
| `tui` | Textual terminal UI |
| `postgres` | asyncpg + langgraph-checkpoint-postgres |
| `redis` | Redis stream bridge |
| `monocle` | OpenTelemetry observability |
| `boxlite` | BoxLite kernel-level sandbox |
| `browser` | Playwright browser automation |
| `pymupdf` | PyMuPDF Llama-text enhancement |
| `memory-zh` | jieba Chinese tokenization |
| `ollama` | Ollama local models |
| `groundroute` | GroundRoute custom retrieval |
| `gateway` | FastAPI HTTP Agent Server (uvicorn / PyJWT / bcrypt) |
| `channels` | IM channel SDKs (DingTalk / Discord / Feishu / Slack / Telegram, etc.) |

## 🚀 Quick Start

### Python API (Embedded)

```python
from qilin.client import QiLinClient

client = QiLinClient()

# One-shot Q&A
answer = client.chat("Explain the transformer self-attention mechanism.", thread_id="my-thread")
print(answer)

# Streaming events
for event in client.stream("Continue the previous conversation"):
    print(event.type, event.data)
```

### TUI (Terminal Workbench)

```bash
# Interactive TUI (requires TTY)
qilin

# One-shot
qilin --print "What is the capital of France?"

# JSON streaming
echo "What is 2+2?" | qilin --json
```

### Web Workbench

```bash
# 1) Start the engine service surface (default port 28081)
uvicorn app.gateway.app:app --port 28081

# 2) In another terminal, start the web workbench (default http://localhost:28080, proxies the gateway)
cd web-demo
pnpm install
pnpm dev
```

### Configuration

Copy `config.example.yaml` to `config.yaml` and fill in at least one model:

```yaml
models:
  - name: openai-gpt4
    provider: openai
    model: gpt-4o
    api_key: ${OPENAI_API_KEY}

sandbox:
  type: aio_sandbox
  provider: qilin.community.aio_sandbox.aio_sandbox_provider:AioSandboxProvider
```

### Agent Server (Service Mode)

```bash
# Install server dependencies
pip install "qilin[gateway,channels]"

# Start the HTTP Agent Server
uvicorn app.gateway.app:app --port 8080
```

The server exposes agents / threads / runs / memory / skills / mcp / uploads / channels / ports REST APIs —
see the [gateway module doc](docs/modules/gateway.md); IM channel adapters are covered in the [channels module doc](docs/modules/channels.md);
terminal/surface ports are covered in the [ports module doc](docs/modules/ports.md).

## 📂 Project Layout

```
.
├── pyproject.toml         # Package metadata + CLI registration
├── qilin/                 # Core engine (~500 files / 23 subsystems)
│   ├── client.py          # QiLinClient — embedded entry
│   ├── agents/            # Lead Agent + middlewares + memory backends
│   ├── subagents/         # Sub-agent executor + registry
│   ├── orchestration/     # Multi-agent orchestration (handoff/graph/bus/patterns)
│   ├── ports/             # Everything-is-a-port (terminal PTY / surface / skills / language ports)
│   ├── tools/             # Tool registry & assembly
│   ├── skills/            # Skill system (with scanners)
│   ├── mcp/               # MCP adapters
│   ├── runtime/           # LangGraph runner + checkpoint + stream bridge
│   ├── persistence/       # Multi-backend storage
│   ├── scheduler/         # Cron / one-shot tasks
│   ├── config/            # Pydantic config + hot reload
│   ├── sandbox/           # Sandbox abstraction
│   ├── guardrails/        # Safety middleware (incl. loop detection)
│   ├── authz/             # RBAC authorization
│   ├── tracing/           # Langfuse / Monocle
│   ├── reflection/        # SkillACP variable resolution
│   ├── community/         # 3rd-party ecosystem (search, sandbox, ...)
│   ├── integrations/      # Lark, Lark CLI, ...
│   ├── models/            # Model adapters
│   ├── tui/               # Textual terminal UI
│   ├── uploads/           # Upload management
│   ├── utils/             # Generic utilities
│   └── workspace_changes/ # Workspace change tracker
├── app/                   # Service surface (HTTP Agent Server + IM channels, shipped in the wheel)
│   ├── gateway/           # FastAPI HTTP Agent Server (REST + auth + webhooks)
│   ├── channels/          # IM channel adapters (8 channels)
│   └── scheduler/         # Scheduled-task HTTP service
├── web-demo/              # Web workbench (Next.js + Tailwind: chat / file tree / terminal / plugins)
├── skills/                # Built-in skill assets
├── tests/                 # pytest suite
├── docs/                  # Project docs (architecture + 25 module docs)
│   ├── architecture.md
│   └── modules/*.md
└── scripts/               # Engineering & acceptance scripts
```

## 📑 Documentation Index

| Document | Summary |
|----------|---------|
| [Architecture overview](docs/architecture.md) | Three-layer architecture, runtime mechanics, observability, security model |
| [gateway](docs/modules/gateway.md) | HTTP Agent Server (REST API + auth) |
| [channels](docs/modules/channels.md) | IM channel adapters (8 channels) |
| [agents](docs/modules/agents.md) | Lead Agent factory & middleware chain |
| [subagents](docs/modules/subagents.md) | Sub-agent execution & registry |
| [orchestration](docs/modules/orchestration.md) | Multi-agent orchestration (handoff/graph/bus/patterns) |
| [ports](docs/modules/ports.md) | Everything-is-a-port — DSH-compatible terminal/surface ports (install, env vars, E2E) |
| [tools](docs/modules/tools.md) | Tool assembly pipeline |
| [skills](docs/modules/skills.md) | Skill system |
| [mcp](docs/modules/mcp.md) | MCP adapters |
| [runtime](docs/modules/runtime.md) | LangGraph runner + checkpoint |
| [persistence](docs/modules/persistence.md) | Storage layer |
| [scheduler](docs/modules/scheduler.md) | Scheduled tasks |
| [config](docs/modules/config.md) | Configuration & hot reload |
| [sandbox](docs/modules/sandbox.md) | Sandbox abstraction |
| [guardrails](docs/modules/guardrails.md) | Safety guardrails |
| [authz](docs/modules/authz.md) | Resource authorization |
| [tracing](docs/modules/tracing.md) | Observability tracing |
| [reflection](docs/modules/reflection.md) | Variable resolution |
| [models](docs/modules/models.md) | Model adapter layer |
| [community](docs/modules/community.md) | 3rd-party ecosystem |
| [integrations](docs/modules/integrations.md) | Channel integrations |
| [tui](docs/modules/tui.md) | Terminal UI |
| [uploads](docs/modules/uploads.md) | Upload management |
| [utils](docs/modules/utils.md) | Generic utilities |
| [workspace_changes](docs/modules/workspace_changes.md) | Workspace changes |

## ⚙️ Requirements

- Python ≥ 3.12
- macOS / Linux (WSL2 supported)
- Node.js ≥ 20 + pnpm (only for web workbench development)
- Optional: Docker (for `aio_sandbox`)
- Optional: PostgreSQL ≥ 13, Redis ≥ 5

## 📜 License

Apache-2.0
