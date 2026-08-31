# QiLin Ports v1 —— 「一切皆 port」接入 DSH 工具协议

**Goal:** 在 QiLin 引擎内建立 `qilin/ports/` 端口层,以线协议兼容的方式实现 DSH `terminal_*`（8 工具）与 `sidebar_open` 契约,首个 adapter 为 web-demo,Windows 进 v1 支持矩阵。

**Architecture:** 协议层（pydantic 契约镜像,零运行时依赖）→ TerminalPort/SurfacePort 接口 → 纯 Python PTY 后端（POSIX asyncio + Windows pywinpty）→ gateway WS 事件流 → web-demo xterm surface → dsh-plugin adapter（远期）。

**Tech Stack:** Python ≥3.12、pydantic v2、LangChain tool、asyncio、pywinpty（Windows ConPTY）、pytest、ruff。

---

## Task List

### P1 协议规范层（本次）—— ✅ complete
- [x] `qilin/ports/protocol/terminal.py` —— 8 个 terminal_* 工具的参数/结果 pydantic 模型（wire 兼容:输出 camelCase alias、extra=forbid）
- [x] `qilin/ports/protocol/surface.py` —— sidebar_open 契约（kind/target/title/delivered + 排队语义）
- [x] `qilin/ports/protocol/events.py` —— WS 事件目录（terminal.output / terminal.exited / surface.open …）
- [x] `qilin/ports/protocol/capabilities.py` —— 单调能力表
- [x] 一致性测试（序列化 round-trip、camelCase alias、判别联合、边界钳制）
- [x] ruff + pytest 通过（26 passed；ruff 全绿）

### P2 TerminalPort 接口 + 内存 registry + POSIX 后端 —— ✅ complete
- [x] `qilin/ports/terminal.py` —— TerminalPort ABC（所有权 assertOwned 语义）
- [x] registry：~1MiB 滚动缓冲、500 行分页、256KiB 读封顶、多字节安全截断
- [x] POSIX 后端（asyncio + pty）—— `qilin/ports/backends/posix.py`

### P3 Windows 后端 —— ✅ complete（真机验证待 CI Windows matrix）
- [x] pywinpty（ConPTY）后端；SIGKILL/SIGTERM 之外信号 no-op 语义（lazy import,缺依赖 → PortError("pty-deps-missing")）
- [x] 平台探测 + 后端选择（make_backend 平台分发;tests/ports/test_terminal_windows_backend.py 11 用例）

### P4 gateway 接线 + web-demo 终端 —— ✅ complete
- [x] gateway WS 事件流 + terminal.* REST 挂载（P4a，commit ae5032e）
- [x] 8 个 terminal_* LangChain 工具（P4a 落码;config.example.yaml 注释示例条目已随 P3 commit 0631985 补齐）
- [x] web-demo xterm.js 终端页 + WS 直连（P4b，commits f331ea5 + 8f093e4；浏览器 E2E 全链路通过）

### P5 SurfacePort + sidebar_open 工具 —— ✅ complete
- [x] qilin/ports/surface.py —— SurfaceRegistry（附着即达/分离排队/drain/有界丢弃）+ open_surface 共享解析（工具与 REST 同策略）
- [x] gateway WS surface.open 事件流（附着即 UI 适配器，teardown 注销）+ REST POST /surfaces（readPath 事件扩展，UI 免知 workspace 根）
- [x] sidebar_open LangChain 工具（DSH 契约镜像，config 启用制；收编 present_file/view_image 的文件/URL 目标解析）
- [x] web-demo surface 查看器（file 文本/图片 + folder 列表 + url 沙箱 iframe；去重聚焦/排队 drain；E2E 4 passed）

### P6 dsh-plugin adapter（QiLin-in-DSH）—— ❌ 作废（用户决策 2026-08-31）
- 原设想：registerTab 把 QiLin web-demo 嵌入 DSH 侧边栏（前置的 P5 查看器 + 安装文档均已落地，技术可行——better-sidebar 暴露 registerTab(TabDescriptor)，dsh-file-review-tab 为现成样例）。
- 作废理由（用户拍板）：QiLin 与 DSH 是不同的 agent 引擎，能做的工作基本相同，UI 嵌入无增量价值。ports v1 的价值在工具协议互通（P1-P5 已交付），不在宿主 UI 归属。

## Findings

### DSH 协议事实（源: dsh-plugins/DSH-better-sidebar src/tools.ts + agent-opens.ts + agent-pty.ts）
- 8 个 terminal 工具：terminal_create/send/read/wait_for/resize/signal/close/list；tmux spawn-and-detach 语义
- 参数风格混用：`terminal_wait_for.timeout_ms` 为 snake_case；结果统一 camelCase（totalLines/lineBegin/elapsedMs/timeoutMs/exitCode/exitSignal）
- 常量：读封顶 256KiB；scrollback ~1MiB；read 默认 500 行硬顶；resize 钳制 2..1024；wait_for 默认 10s、下钳 100ms
- wait_for 返回判别联合 kind=found{needle,line,column,elapsedMs} | timeout{needle,timeoutMs,totalLines} | exited{needle,exitCode?,exitSignal?}
- ALLOWED_SIGNALS = SIGINT/SIGTERM/SIGKILL/SIGHUP/SIGTSTP；**Windows 仅 SIGKILL/SIGTERM 有效,其余接受但可能 no-op**
- terminal_create(title, command) → {uuid,title}；uuid 不透明句柄；command 为空 = 裸 shell；宿主自动补 Enter
- terminal_send(uuid,text,submit?) → {uuid,bytes}；submit=true 追加 \r；禁止 \n/\r 手拼
- terminal_read(uuid,offset?,count?) → {text,totalLines,lineBegin,lineEnd,truncated}；offset 负数=从尾部
- terminal_close 幂等 → {uuid,closed}；terminal_list → 快照数组 {uuid,title,command,exited,exitCode?,exitSignal?}
- sidebar_open(target,title?) → {kind:file|folder|url, target(绝对), title(默认 basename/hostname), delivered}
  - delivered=false 语义：会话侧边栏未连接 → 排队,下次展示时投递
  - 目标 tab 被禁用时报错给模型（不静默成功）
- 所有权：宿主从 exec.agent.session.id 解析,工具层 assertOwned,绝不信任客户端传参
- 工具约定 C1(schema 先校验)/C4(execute 单一 canonical JSON)/C6(执行前 abort 检查)/C10(canonical 值不含 UI 词汇)

### QiLin 现状事实
- 工具 = langchain `@tool` + `Runtime = ToolRuntime[dict, ThreadState]`（qilin/tools/types.py）；返回 Command/ToolMessage
- UI 事件通道已存在：`aemit_custom_event`；present_file_tool.py / view_image_tool.py 是 sidebar_open 雏形
- web-demo server.js 已把 /api/* 与 **WebSocket upgrade** 同源代理到 gateway(127.0.0.1:28081)
- qilin/mcp 是 MCP 客户端（client/session_pool/oauth）——远期可反向暴露 ports 为 MCP server
- plans/ 目录已存在（含一个不相关的历史任务文件）

### 已定决策（用户拍板 2026-08-31）
- 首个 adapter = **web-demo**；TUI 等 port 改造彻底后再接
- **Windows 进 v1 支持矩阵**（web 端但兼顾桌面开发场景）
- PTY 技术选型（据此修订）：主选**纯 Python**——POSIX asyncio+pty / Windows pywinpty(ConPTY)；理由:①QiLin 身份是单 pip 包,pywinpty 有预编译 wheel、零 node-pty 那种 pnpm approve-builds 摩擦 ②TUI adapter 将来不应被 node 依赖绑架 ③node-pty sidecar 降级为文档化可选后端
- 能力协商照抄 DSH 单调 features 表（只增不删）

## Progress Log
- 2026-08-31: 完成 DSH 协议盘点（tools.ts 482 行 + agent-opens.ts sidebar_open 全 schema + ALLOWED_SIGNALS）;创建本计划文件。
- 2026-08-31: P1 完成。落盘 6 个源文件（ports/__init__、protocol/{__init__,terminal,surface,events,capabilities}.py）+ tests/ports/test_protocol.py（26 用例）。验证:`.venv/bin/python -m pytest tests/ports/test_protocol.py -q` → 26 passed；`.venv/bin/ruff check qilin/ports tests/ports` → All checks passed。附加决策:复合类型（裸数组/判别联合）经 TypeAdapter 校验——协议模块保持纯类型别名,不预建 adapter 实例;classify_target_kind 对 Windows 盘符（单字母 scheme）显式判为文件系统路径。
- 2026-08-31: P2 完成。落盘 qilin/ports/{errors.py,terminal.py,backends/{__init__,posix}.py} + tests/ports/test_terminal.py（21 用例:TranscriptBuffer 纯逻辑 8 + registry 策略(faker backend) 7 + POSIX pty 集成 6）。验证:`pytest tests/ports/ -q` → 47 passed(含 P1 的 26)；ruff 全绿。要点:close 幂等契约靠 tombstone 实现(owned 已关闭 → closed=False,foreign → forbidden,unknown → not-found)；signal 语义 = SIGKILL 杀进程、其余 tcgetpgrp+killpg 打前台进程组；命令注入走「spawn 裸 shell + stdin 写 command+回车」（DSH 同款）；wait_for 50ms 轮询全量 retained transcript。集成测试带 _pty_available() 跳卫,无 pty 设备的环境自动 skip。
- 2026-08-31: P4a（gateway 后端）完成,commit ae5032e。落盘:①registry 升级——订阅扇出(("data",bytes)/("exit",code,sig) 队列,慢消费者丢帧、scrollback 保持权威)+ write_bytes(WS 数据面用)+ get/set_default_registry 单例;②app/gateway/routers/ports_terminal.py——8 条 REST(/api/threads/{tid}/terminals…,require_permission threads read/write,PortError→状态码映射)+ WS /stream(复用 browser 路由的 _authenticate_ws/_ws_origin_allowed,uuid\n 前缀二进制帧复用 N 终端,JSON 控制帧 subscribe/unsubscribe/resize/signal);③qilin/tools/builtins/terminal_port_tools.py——8 个 LangChain 工具(DSH 同名同 schema,owner=thread_id,结果 camelCase JSON;启用走 config.yaml tools 条目,平台惯例)。测试 +6(router REST 全动词/fake backend)。验证:53 passed + ruff 全绿。
- 2026-08-31: P4b（web-demo 前端）完成并端到端调通,commits f331ea5 + 8f093e4。落盘 web-demo/src/components/terminal/terminal-panel.tsx（xterm 动态导入、tmux 重连语义、uuid\n 二进制帧、fit→resize 控制帧、Ctrl+C/kill、exited 覆盖层）+ app/workspace/terminal/page.tsx（?thread= 挂载 + localStorage）。**端到端调通过程揪出两个真问题**:①gateway 假活——uvloop uv_spawn fork 时 torch OpenMP 在子句柄死锁（堆栈采样确认 __kmp_wait_4_ptr）,任何终端 create 都会永久卡死事件循环;缓解=启动带 KMP_INIT_AT_FORK=FALSE（安装文档需注明）。②http-proxy-middleware v4 upgrade 只转握手不转数据帧（浏览器 1006）;server.js 改手写裸 TCP 隧道双向转发 + 组件支持 NEXT_PUBLIC_GATEWAY_WS 直连 gateway（本机用此模式,.env.local 已配,gitignore 已覆盖）。**E2E 证据**:Playwright 真浏览器,/workspace/terminal?thread=e2e-ports-1 → xterm READY → 键盘输入 echo qilin-e2e-ok → REST read 断言 echoSeen=true,真 zsh 提示符与执行输出全在。遗留:server.js 隧道与 next 路由注册的长期方案、安装文档。
- 2026-08-31: P3 完成(commit 0631985)+ Playwright E2E 脚本化完成(独立提交)。E2E 三用例(echo 回环/SIGINT 控制面/new 强制新建)全绿(4.8s,复用 28080 dev 服务);期间修正:①playwright 端口/host 参数化(E2E_WEB_DEMO_PORT/HOST,网关 WS origin 检查 host 严格);②按钮 locator 需匹配 aria-label 而非可见文本;③terminal-panel "new" 按钮语义改为 attempt 状态驱动的强制新建(原实现会误重连旧终端)。**剩余遗留**:config.example.yaml 已补注释示例(已提交);安装文档(KMP_INIT_AT_FORK 说明);P5 sidebar_open SurfacePort;P6 dsh-plugin adapter。
- 2026-08-31: P5 后端完成(commit c302b97):qilin/ports/surface.py SurfaceRegistry(附着即达/分离排队 drain/有界丢弃 8 上限) + gateway WS surface.open 泵 + sidebar_open 工具(DSH 契约镜像,收编 present_file/view_image 的目标解析)。
- 2026-08-31: **断网后全面复核**(用户要求)。git 提交链完整(7 commits ahead: a2007db P1 → c302b97 P5)、23 个交付文件在位、config terminal 块在位、无残留监听进程。验证:.venv pytest tests/ports+router → 68 passed + 6 skipped(sandbox 无 pty,跳卫生效)→ danger-full-access 提权重跑 → **74 passed 全过**;`ruff check .` 全仓 35 个存量错误清零至 All checks passed(29 自动修 + 5 手修);web-demo `tsc --noEmit` 通过。顺带修复 F401 误删重导出(见 Errors)。下一步:P5 web-demo surface 查看器。
- 2026-08-31: P5 全栈完成,commits 2adacc3(后端)+ 4c079bd(前端)。后端:open_surface 共享解析助手(sidebar_open 工具瘦身为其包装)+ 新 REST 路由 POST /api/threads/{tid}/surfaces + SurfaceOpenEvent 可选 readPath(QiLin 扩展,事件侧携带 workspace 相对路径,DSH 工具结果契约不动);测试 +9。前端:SurfaceViewer(file 文本/图片、folder 列表、url 无 same-origin 沙箱 iframe;按 target 去重保最新、新开即聚焦、本地可关),TerminalPanel 以 latest-callback ref 透出 surface.open(WS 不随父重渲染重连)。**E2E 4 passed(5.5s)**,含新用例:REST 开面(detach 排队)→ 页面 attach drain → 文件内容断言 + iframe 可见。调试期间修复:①SIGINT 用例 flake——zsh 未就绪时击键落入 tty 行缓冲污染后续流程,改为先 warm-up(poll 到 echo 真执行)再走中断;②React duplicate key(兄弟组件同 key={threadId})。
- 2026-08-31: 安装文档完成:docs/modules/ports.md(双语房规)——安装依赖(Windows pywinpty/KMP_INIT_AT_FORK 死锁机理)、gateway 环境变量完整清单(INTERNAL_AUTH_TOKEN≥32/CORS_ORIGINS WS 403/已验证启动命令)、config tools 启用示例、REST/WS 端点表、web-demo 接线与 E2E 跑法;README 导航 + config.example.yaml 补 sidebar_open 条目。
- 2026-08-31: **P6 作废**(用户决策:两引擎能力重叠,UI 嵌入无增量价值)。ports v1 计划就此收束——P1-P5 + 安装文档全部交付;可选遗留仅 CI Windows matrix(pywinpty 真机验证)。
## Errors
- events.py 首版漏导入 Annotated（NameError,收集期失败）→ 已修。
- ruff UP 规则要求 PEP 604 联合（Union[...] → X | Y）→ 已改。
- 复合 wire 类型直接 .model_validate 会 AttributeError（GenericAlias/SpecialForm 无该方法）→ 测试改用 TypeAdapter;消费端同样要经 TypeAdapter。
- 环境噪音（非项目问题）:uvx ruff 触发 uv 缓存沙箱拒绝,用 .venv/bin/ruff 绕开。
- terminal.py 的 _make_backend 前向引用 TerminalPort（def 时注解即求值）→ 挪到 ABC 之后并更名 make_backend。
- **沙箱拒绝 pty 分配**（裸探针 openpty → "out of pty devices"）→ 同命令以 danger-full-access 重试一次通过;集成测试另加 _pty_available() 跳卫保证可移植。
- 分页集成测试初版断言「干净输出」,实际 pty 上 transcript 含提示符/回显（DSH 同款现实）→ 改为结构化断言(窗口切片一致性)。
- **ruff F401 误删重导出**(--fix 把 validation.py 的 ALLOWED_FRONTMATTER_PROPERTIES 导入当未用删除,而 qilin/skills/__init__ 恰从这里转发)→ 恢复导入 + `# noqa: F401 -- re-exported`。教训:对库代码跑 --fix 后必须重跑收集期测试;另:裸 `python3` 是 Xcode 系统 Python(无 ruff/依赖),一律用 `.venv/bin/python`。
- 计划文档自身欠账(本次复核发现):P3 完成后 checklist 未勾选、P4 的「config 条目待补」注记过时、Progress Log 标题+前两条目重复 → 已对账修正。
- 本地起 gateway 的完整环境(缺一不可,已验证):`QILIN_AUTH_DISABLED=1 QILIN_INTERNAL_AUTH_TOKEN=<≥32字符>`(internal_auth 模块级强校验,太短直接拒启) `KMP_INIT_AT_FORK=FALSE GATEWAY_CORS_ORIGINS=http://127.0.0.1:28080`(否则浏览器 WS 握手 403——WS 升级绕过 AuthMiddleware 但 origin 白名单仍生效)。
- **沙箱内起的 gateway 继承 pty 禁令与 workspace 写限制**(terminal create 500、files write 拒绝),E2E 全挂;同命令 danger-full-access 重启即愈。另 files/write 有意不建父目录,新线程先 POST /api/files/mkdir path="." 引导 workspace 根。
