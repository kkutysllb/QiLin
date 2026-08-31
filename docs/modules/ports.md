# ports 模块（ports module）

> QiLin engine · 一切皆 port —— DSH 兼容终端与表面端口 · 双语 / Bilingual

---

## 中文版

### 职责

`qilin.ports` 是 QiLin 的 **DSH 工具协议互通层**：把 better-sidebar 的两类模型工具
（8 个 `terminal_*` 与 `sidebar_open`）以 wire 兼容契约镜像进 QiLin，让 QiLin 的
web 界面与 DSH 生态共用同一套模型工具词汇。

- **TerminalPort**：持久 PTY 终端，tmux spawn-and-detach 语义（终端活过 UI 断连，
  重挂载重连滚动缓冲）；POSIX 后端 asyncio+pty，Windows 后端 pywinpty(ConPTY)
- **SurfacePort**：文件/目录/URL 开面——附着即达、分离排队（有界丢弃）、drain 补投
- **协议规范层**（`protocol/`）：纯 pydantic wire 模型，camelCase alias +
  `extra="forbid"`，复合类型经 TypeAdapter 校验
- **消费端**：LangChain 工具（config 启用制）与 gateway REST/WS 路由，两条路径共享
  同一解析策略

### 关键文件

| 文件 | 作用 |
|------|------|
| `ports/protocol/{terminal,surface,events,capabilities}.py` | wire 契约：工具参数/结果模型、`surface.open` 事件目录、单调能力表 |
| `ports/terminal.py` | TerminalPort ABC + TerminalRegistry（所有权 assertOwned、钳制、分页、订阅扇出、tombstone 关闭语义） |
| `ports/backends/posix.py` | POSIX PTY 后端（setsid + TIOCSCTTY 前台进程组，signal=killpg） |
| `ports/backends/windows.py` | ConPTY 后端（lazy import；SIGKILL/SIGTERM 之外信号 no-op） |
| `ports/surface.py` | SurfaceRegistry + `open_surface` 共享解析助手（URL 免盘分类 / workspace 相对→cwd 回退 / 必须存在） |
| `tools/builtins/terminal_port_tools.py` | 8 个 `terminal_*` LangChain 工具（DSH 同名同 schema，owner=thread_id） |
| `tools/builtins/sidebar_open_tool.py` | `sidebar_open` 工具（open_surface 的薄包装） |
| `app/gateway/routers/ports_terminal.py` | terminal REST 8 动词 + WS `/stream` 数据面（二进制帧 `uuid\n+bytes`）+ surface 泵 |
| `app/gateway/routers/ports_surface.py` | `POST /api/threads/{tid}/surfaces`：程序化 sidebar_open（与工具同策略） |
| `web-demo/src/components/terminal/terminal-panel.tsx` | xterm 终端面板（WS 直连、重连语义、SIGINT/kill 控制面） |
| `web-demo/src/components/surface/surface-viewer.tsx` | surface 查看器（file 文本/图片、folder 列表、url 沙箱 iframe） |

### 设计要点

1. **backends 保持"哑"**：uuid 铸造、所有权、钳制、分页等策略全部收在 registry，
   后端只做 pty 读写与进程生命周期。
2. **close 幂等靠 tombstone**：owned 已关闭 → `closed=false`；foreign → `forbidden`；
   unknown → `not-found`。非 close 动词对 owned 墓碑一律 not-found。
3. **工具结果契约不动，事件可扩展**：`sidebar_open` 结果保持 DSH 原样
   （kind/target/title/delivered）；`surface.open` 事件额外携带可选 `readPath`
   （workspace 相对路径，QiLin 扩展），UI 适配器免知 workspace 根即可经 files API 取内容。
4. **数据面走二进制**：PTY 原始字节 `uuid\n + bytes` 直传（JSON 化会毁二进制输出）；
   JSON 只承载控制面与生命周期事件。
5. **单例 registry 跨端共享**：gateway 与 LangChain 工具通过
   `get_default_registry()` / `get_default_surface_registry()` 共享进程内同一实例，
   测试经 `app.state.*` seam 注入替身。

### 安装与启用

- **POSIX**（macOS/Linux）：零额外依赖（asyncio + 内置 pty）。
- **Windows**：`pip install pywinpty`（缺失时 terminal 工具返回 `pty-deps-missing`
  错误而非崩溃）。
- 工具为 config 启用制（`config.example.yaml` "Terminal ports" 注释块）：

```yaml
tools:
  - name: terminal_create      # 另有 terminal_list/send/read/wait_for/resize/signal/close
    group: ports
    use: qilin.tools.builtins.terminal_port_tools:terminal_create_tool
  - name: sidebar_open
    group: ports
    use: qilin.tools.builtins.sidebar_open_tool:sidebar_open_tool
```

### gateway 环境变量（端口场景完整清单，均已实测验证）

| 变量 | 作用 | 缺失/错误后果 |
|------|------|---------------|
| `QILIN_INTERNAL_AUTH_TOKEN` | internal token 共享密钥（模块级强校验，≥32 字符） | 拒绝启动 |
| `QILIN_AUTH_DISABLED=1` | 开发模式：跳过用户认证（仅本地） | REST/WS 401 |
| `GATEWAY_CORS_ORIGINS` | 逗号分隔的浏览器 origin 白名单 | **浏览器 WS 握手 403**——WS 升级绕过 AuthMiddleware 但 origin 检查仍生效 |
| `KMP_INIT_AT_FORK=FALSE` | uvloop `uv_spawn` fork × torch OpenMP atfork 死锁缓解 | terminal create 永久卡死事件循环（堆栈特征 `__kmp_wait_4_ptr`） |

已验证的本地启动命令（gateway :28081 + web-demo :28080）：

```bash
QILIN_AUTH_DISABLED=1 \
QILIN_INTERNAL_AUTH_TOKEN=$(python3 -c 'import secrets;print(secrets.token_urlsafe(48))') \
KMP_INIT_AT_FORK=FALSE \
GATEWAY_CORS_ORIGINS=http://127.0.0.1:28080,http://localhost:28080 \
.venv/bin/python -m uvicorn app.gateway.app:app --host 127.0.0.1 --port 28081
```

### web-demo 接线与 E2E

- 页面：`/workspace/terminal?thread=<id>`（终端 + surface 查看器分栏）。
- `web-demo/.env.local`: `NEXT_PUBLIC_GATEWAY_WS=ws://127.0.0.1:28081`——dev 模式 WS
  直连 gateway（dev WS 代理不转发数据帧）；该 origin 必须在 `GATEWAY_CORS_ORIGINS` 内。
- 新线程的 workspace 需先引导：`POST /api/files/mkdir {"thread_id":…, "path":"."}`
  （files/write 有意不创建父目录）。
- E2E：`pnpm exec playwright test tests/e2e/terminal-port.spec.ts`（gateway 缺席自动
  skip；`E2E_WEB_DEMO_HOST/PORT` 参数化复用已运行的 dev 服务，host 用 127.0.0.1 保持
  与 origin 白名单一致）。
- 单元/集成：`.venv/bin/python -m pytest tests/ports tests/test_ports_terminal_router.py
  tests/test_ports_surface_router.py -q`——POSIX pty 集成用例带 `_pty_available()`
  跳卫，无 pty 设备的环境自动 skip。

### 扩展入口

```python
# 新终端后端：实现 TerminalPort ABC，make_backend 按平台分发
from qilin.ports.terminal import TerminalPort
class MyBackend(TerminalPort): ...

# 新 surface 适配器（TUI/IM）：subscribe 会话队列即可收到 ("surface", SurfaceOpenEvent)
from qilin.ports.surface import get_default_surface_registry
queue = get_default_surface_registry().subscribe(session_id)
```

### 关联模块

- 上游：`config/`（workspace 目录、config.yaml tools 启用）
- 下游：`app/gateway`（REST/WS 暴露）、`web-demo`（首个 UI 适配器）
- 横切：`authz`（require_permission threads read/write）、`files`（readPath 内容取回）

---

## English Version

### Responsibility

`qilin.ports` is QiLin's DSH tool-protocol interop layer: it mirrors better-sidebar's
two model-tool families (eight `terminal_*` tools and `sidebar_open`) with
wire-compatible contracts so QiLin's web UI speaks the same vocabulary as the DSH
ecosystem.

- **TerminalPort** — persistent PTY terminals with tmux spawn-and-detach semantics
  (terminals outlive UI disconnects; remount reattaches to scrollback). POSIX backend:
  asyncio + pty; Windows backend: pywinpty (ConPTY).
- **SurfacePort** — file/folder/URL opens: attach = instant delivery, detach = bounded
  queueing with drain-on-attach.
- **Protocol layer** (`protocol/`) — pure pydantic wire models, camelCase aliases,
  `extra="forbid"`.
- **Consumers** — LangChain tools (config-enabled) and gateway REST/WS routes sharing
  one resolution policy (`open_surface`).

### Key Files

| File | Purpose |
|------|---------|
| `ports/protocol/*` | Wire contracts: tool arg/result models, `surface.open` event catalog, capability table |
| `ports/terminal.py` | TerminalPort ABC + TerminalRegistry (ownership, clamps, paging, fan-out, tombstone close) |
| `ports/backends/posix.py` | POSIX PTY backend (setsid + TIOCSCTTY foreground process group) |
| `ports/backends/windows.py` | ConPTY backend (lazy import; signals beyond SIGKILL/SIGTERM are no-ops) |
| `ports/surface.py` | SurfaceRegistry + shared `open_surface` resolution helper |
| `tools/builtins/terminal_port_tools.py` | Eight `terminal_*` LangChain tools (DSH-verbatim schemas) |
| `tools/builtins/sidebar_open_tool.py` | `sidebar_open` tool (thin wrapper over `open_surface`) |
| `app/gateway/routers/ports_terminal.py` | Terminal REST verbs + WS `/stream` data plane + surface pump |
| `app/gateway/routers/ports_surface.py` | `POST /api/threads/{tid}/surfaces` programmatic open |
| `web-demo/src/components/terminal/terminal-panel.tsx` | xterm panel over the WS data plane |
| `web-demo/src/components/surface/surface-viewer.tsx` | Surface viewer (file/image/folder/url) |

### Design Highlights

1. **Backends stay dumb** — uuid minting, ownership, clamping, and paging policy live
   in the registry; backends only do pty I/O and process lifecycle.
2. **Idempotent close via tombstones** — owned-closed → `closed=false`, foreign →
   `forbidden`, unknown → `not-found`.
3. **Tool results frozen, events extensible** — `sidebar_open` results keep the DSH
   shape; `surface.open` events add optional `readPath` (workspace-relative, QiLin
   extension) so adapters fetch content without knowing the workspace root.
4. **Binary data plane** — raw PTY bytes ride `uuid\n + bytes` frames; JSON carries
   only control and lifecycle events.
5. **Shared process-wide registries** — gateway and tools share singletons; tests
   inject via the `app.state.*` seam.

### Installation & Enablement

- **POSIX**: no extra dependency. **Windows**: `pip install pywinpty`.
- Enable tools via `config.yaml` `tools:` entries (see `config.example.yaml`).
- Gateway env for port scenarios (all verified): `QILIN_INTERNAL_AUTH_TOKEN` (≥32
  chars, refuses to boot otherwise), `QILIN_AUTH_DISABLED=1` (dev only),
  `GATEWAY_CORS_ORIGINS` (browser WS origin allowlist — missing it yields WS 403),
  `KMP_INIT_AT_FORK=FALSE` (uvloop × torch OpenMP fork deadlock). Verified launch
  command in the Chinese section above.
- E2E: `pnpm exec playwright test tests/e2e/terminal-port.spec.ts` (skips when the
  gateway is absent). Unit/integration: `pytest tests/ports tests/test_ports_terminal_router.py
  tests/test_ports_surface_router.py` — POSIX pty integration cases self-skip where
  no pty devices exist.

### Extension Points

```python
# New terminal backend: implement TerminalPort ABC; make_backend dispatches by platform
from qilin.ports.terminal import TerminalPort
class MyBackend(TerminalPort): ...

# New surface adapter (TUI/IM): subscribe to a session queue for SurfaceOpenEvent
from qilin.ports.surface import get_default_surface_registry
queue = get_default_surface_registry().subscribe(session_id)
```

### Related Modules

- **Upstream** — `config/` (workspace dirs, config.yaml tool enablement)
- **Downstream** — `app/gateway` (REST/WS exposure), `web-demo` (first UI adapter)
- **Cross-cutting** — `authz` (threads read/write permissions), `files` (readPath
  content fetch)
