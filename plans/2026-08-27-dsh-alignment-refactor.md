# DSH 对齐重构 · 工作区注册表 + 引擎自主循环 + 侧边栏分组

> 状态：草案（QiLin 现状小节待两份子代理分析报告回填）
> 参考源码：本仓库 `deepseek-harness/`（完整 DSH 源码，非安装产物反推）
> 约束：`.qilin/users/<uid>/threads` 既有数据零破坏；旧线程迁移后必须可见且可用。

## 0. 移植范围判定（哪些 DSH 机制进 QiLin）

| DSH 机制 | 移植 | 理由 / 裁剪 |
|---|---|---|
| Workspace 实体注册表 | ✅ 全量 | 侧边栏分组的地基；uuid id、canonical path、持久顺序、header 归组 |
| 线程 header cwd 不可变 | ✅ 全量 | 创建时定死；无任何迁移 API |
| sandbox/mode 会话事件折叠 | ✅ 裁剪版 | QiLin 沙箱现为单机全放行 → 先实现「事件记录+折叠解析」，执行端分档后接 |
| Ungrouped / archiveSession | ✅ 全量 | UI 分组完备性所需 |
| 手动排序 insertBefore / Last-updated 双模式 | ✅ 全量 | DSH sidebar 核心交互 |
| goal 领域(active/paused/blocked/complete + CAS) | ✅ 全量 | 引擎自主循环的状态地基 |
| activation(armed/disarmed) 进程本地 | ✅ 全量 | 重启后目标保留但不自动续跑——安全红线 |
| goal-round-driver | ✅ 裁剪版 | QiLangGraph 流式循环上按 idle 边界驱动；人工消息不计数照搬 |
| todo_write 整表快照 | ❌ 不移植 | web-demo 已有自有 todo 实现 |
| jobs 注册表 / subagent 森林 | ⏸ 后续 | 本轮不做，接口留缝 |

## 1. DSH 权威语义摘录（移植依据，出处 deepseek-harness/packages/*/src）

### 1.1 workspace/workspace/src/types.ts（全文已核）
- `WorkspaceId = Branded<'WorkspaceId'>`：**uuid，永不使用路径当 id**（路径归一会改写，引用锚点必须稳定）。
- `Workspace { id, path(canonical realpath), title(默认 basename，允许重名), createdAt, updatedAt, sessionIds[] }`。
- `sessionIds`：手动拥有顺序；attach 前插、`insertSessionBefore` 显式移动；**活动永不自动重排**。同步过滤非法成员（缺 header/cwd 失效/不匹配），下次变更时持久修剪。
- `status()`：实时检查 `'ok' | 'missing-dir'`，目录缺失不改记录（可能只是临时移走）。
- `detachSession` 幂等；永不触碰会话日志本体。

### 1.2 workspace/src/index.ts bootstrap（行号锚点 88-363）
- 首启读取 `sessionPersistence.list()` 的 **header id/cwd/createdAt 三字段**做历史归组，写 initialized 标记最后落盘（半写可安全复用）。
- create/delete **先写 pending-mutation 标记**再动记录/顺序；失败回滚先还原记录再清标记；双失败 fail loud。
- `delete(id)` 仅删注册记录+顺序项+会话账户；目录、文件、会话日志不动 → 会话转 Ungrouped。
- 存储域不可用则插件 pending，绝不提交空 initialized 标记。

### 1.3 goal/goal/src/types.ts
- `GoalPhase = active | paused | blocked | complete`；blocked 必带 `{ code(lower-kebab), explanation }`。
- `GoalRef { id, revision }`：一切变更的 CAS 封栏；陈旧引用拒绝。
- `GoalView`：snapshot + `roundsStarted` + 时间戳 + `activation('armed'|'disarmed')`。
- **activation 是进程本地授权，从不持久化、不在投影中**；每次 `session-start` 一律 disarm。
- 投影 `GoalProjection` 故意不含 activation —— 持久面只见 durable 相位。

### 1.4 goal-round-driver
- 续跑 prompt 模板（prompt.ts 全文）：`<goal_round>` 包裹 + objective JSON.stringify 防注入 + `Round: n/max` + 工作区与工具结果为准 + 要求证据后才许 complete。
- 人为消息不消耗轮数配额；混合批次中人优先、自动让位。
- idle 检查点：checkpoint mutation → 预留 n+1 → flush 持久 → 复验 revision 与竞争输入 → 入账才计数。
- 取消不留活口：取消发生时把 armed goal 转 paused，防自动复活。
- 自报 blocked 政策门槛：同条件连续 ≥3 轮（配置值），必须写明具体阻断条件。

### 1.5 client/ui-workspace/src/client/tree.ts（前端推导层权威）
- 全部为纯函数：`deriveGroups(list, workspaces, archivedSessionIds, view): GroupNode[]` / `deriveFlat()`(平铺模式，严格最新在前) / `deriveSearchResults()`(元数据即时匹配+250ms 防抖内容搜索合并去重，上限 20 条)。
- 常量约定：`UNGROUPED_KEY = ''`、`UNGROUPED_LABEL = 'Ungrouped'`。
- GroupNode 含 `{ key, cwd, label, sessionCount, expanded, containsCurrent, sessions[] }` —— expanded 由 view.expandedGroups Set 提供；containsCurrent 用于高亮当前会话所在组。
- 归组排序接受 `view.ungroupedOrder` 注入；会话行按 recency 排（byRecency），Manual 模式顺序来自 workspace sessionIds 账户序。
- 相对时间分桶 `relativeTime(): 'now'|minutes|hours|days|months|years'`。
- 移植形态：web-demo 新建 `src/lib/workspace-tree.ts` 承载同构纯函数（TS 直接可移植，去 subagent 折叠逻辑）。



### 1.6 goal/goal/src/domain.ts（动词与错误码词汇，API 设计直接对齐）
- 七动词：`create | edit | pause | resume | complete | block | clear`。
- 变更事件为**整快照**（post-change 全量 GoalSnapshot + roundsStarted + 时间戳）；clear 是带 `cleared: GoalRef` 的版本化 tombstone；fold=last-wins。
- 轮次归因 `GoalMessageSource { kind:'goal', goalId, revision, round }` —— 计数递增的唯一凭据。
- 九个稳定错误码（移植为 API 错误响应 code）：`GOAL_AGENT_NOT_LIVE / GOAL_NOT_FOUND / GOAL_ALREADY_EXISTS / GOAL_STALE_REVISION / GOAL_INVALID_OBJECTIVE / GOAL_INVALID_MAX_ROUNDS / GOAL_INVALID_BLOCK_REASON / GOAL_INVALID_EDIT / GOAL_INVALID_TRANSITION`。
- `GoalChanged { operation, ref, goal? }` 为变更后广播形态（QiLin 对应为 SSE 推送载荷）。

## 2. QiLin 现状（待子代理报告回填）

### 2.1 后端（qilin/ + app/）—— 已取证（子代理 08caf106 + 主线复核）

**线程生命周期**：无独立 `/api/threads` CRUD；线程经 `app/gateway/routers/runs.py:38-70` 的 SSE 流式接口在 `start_run()`（`app/gateway/services.py:1204-1388`）中隐式物化——从 `config.configurable.thread_id` 取 ID（缺省生成 UUID），写 threads_meta 首行 + RunRow（部分唯一索引保证每线程一个 pending/running）+ `asyncio.create_task(worker)`。运行循环在 `qilin/runtime/runs/worker.py:568-624`（bridge/manager/context/graph input/checkpoint/journal），RunManager 有心跳与孤儿恢复。

**引擎已有每线程数据目录**：`.qilin/threads/{thread_id}/user-data/{workspace,uploads,outputs}`（`qilin/config/paths.py:104-128`），middleware 注入 ThreadDataState 三路径（`qilin/agents/middlewares/thread_data_middleware.py:81-118`），sandbox 把 `/mnt/user-data/workspace/*` 映射进去、shell 命令以字符串前置 `cd <workspace> &&`（`qilin/sandbox/tools.py:1302-1314`）。**这是暂存区概念，非 DSH「真实外部项目目录」** —— 与注册表分层并存，边界写入 §3.7。

**关键更正**：`user_workspace_path` 在后端 grep 为零命中——它是纯前端状态（threads-api 测试锁定的是前端类型形状）。前端传的 context 到 LangGraph config 之间该字段被丢弃。→ 重设计可自由定义新契约而不破坏后端；旧字段仅作前端兼容读取。

**权限现状**：非全放行但分散——run 级 thread ownership 校验（services.py:1214-1240）、ID 字符集白名单（paths.py:27-37）、ACP workspace 写拒绝（sandbox/tools.py:888-899）、LocalSandbox 杀进程组超时（local_sandbox.py:556-632）。无 DSH 式 read-only/workspace-write 模位 → 沙箱事件化先做记录+折叠层（§0 裁剪理由成立）。

**编排现状**：multi 模式 orchestrator+worker（tests/test_mode_switch.py:128-149）、subagent 并发/失败/共识矩阵（test_orchestration_patterns.py:51-100）——goal 轮次驱动（P6）挂 run worker 的 idle 终态边。

**迁移敏感点清单**（子代理）：所有按 thread_id 查询 runs/threads_meta/checkpoints 的路径不受影响（加列不改键）；SSE stream/wait/cancel 路由按线程语义照旧；run 唯一约束按 thread 而非 workspace（同工作区多线程天然允许）；workspace_sessions 无外键 → 孤儿靠业务修剪（已实现 _prune_account）。


### 2.2 前端（web-demo）
TBD-REQUESTED：侧边栏渲染链与数据 hook / 线程创建流 / kworks.* localStorage 全景 / 布局上下文 / drag-drop 现状 / 命令面板注册。

### 2.3 已知存量事实（主线取证，含 SQLite 实测）
- 本地键：`kworks.thread-workspace-path.<threadId>`（""=显式默认工作区哨兵）、线程页 onStart 时写入 `saveThreadWorkspacePath`（input-box.tsx:568 已删挂载点，page.tsx:78 保存链仍在）。
- 数据目录：`.qilin/users/<uid>/{threads,agents,skills,memory.json}`、`.qilin/data/qilin.db`(SQLite+WAL)、`.qilin/.qilin/checkpoints.db`、`.qilin/channels`、`.qilin/integrations/skills`。
- 测试锁定：threads-api.test.ts 两断言（AgentThreadContext 含 user_workspace_path 字段；thread.submit context 携带该键）——重构中契约保留。
- **ORM 与迁移工具链：SQLAlchemy + Alembic**（qilin.db 存在 alembic_version 表）→ 所有 schema 变更走 Alembic revision，禁裸 ALTER。
- `threads_meta`：`thread_id PK / assistant_id / user_id(idx) / display_name / status(idle|interrupted|…) / metadata_json(JSON，title 在其中) / created_at / updated_at`。当前 5 行演示数据。
- `runs` 表：run_id/thread_id/operation_kind/model_name/status/stop_reason/message_count/first_human_message…——goal 轮次的天然记账邻居（round 归因可挂 runs.metadata_json）。

## 3. 目标架构（QiLin 语境落地）

### 3.1 后端新增表（SQLite，qilin.db）
```sql
-- 工作区注册表（DSH dsh-workspace 对齐）
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,            -- uuid4，非路径
  canonical_path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE workspace_order (   -- 持久工作区顺序（单列序列）
  ord INTEGER PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id)
);
CREATE TABLE workspace_sessions (-- 会话账户：手动顺序=prepend 语义即 list 反序
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  thread_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  UNIQUE(workspace_id, thread_id)
);
CREATE TABLE workspace_meta (    -- initialized 标记 + archive 全局集合
  key TEXT PRIMARY KEY, value TEXT
);

-- threads 表增列（迁移 M1，ADD COLUMN 兼容旧行）
ALTER TABLE threads ADD COLUMN cwd TEXT;          -- NULL=旧数据未分组
ALTER TABLE threads ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;

-- 自主循环（goal/change 事件的持久形态；QiLin 用表而非事件日志裁剪见 §5.3）
CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(thread_id),
  revision INTEGER NOT NULL,      -- CAS 封栏，初始 1
  objective TEXT NOT NULL,
  phase TEXT NOT NULL CHECK(phase IN ('active','paused','blocked','complete')),
  blocked_code TEXT, blocked_reason TEXT,
  max_goal_rounds INTEGER NOT NULL,
  rounds_started INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
```

### 3.2 线程 cwd 捕获（依后端实证修正）
- 无独立创建 API → cwd 在 **`start_run()` 首次物化 threads_meta 行时一次性写入**：运行请求 body 的 `config.configurable.workspace_id`（推荐，指向注册表实体）→ 服务端解析 canonical path 落 threads_meta.cwd；此后无更新路径。
- 请求未带 workspace_id → cwd=NULL（Ungrouped）。注册表 attach 由服务端在新线程落行后自动执行（cwd 已验证相等）。
- 兼容：已删除的输入框 selector 曾维护的 `user_workspace_path` 前端字段退役；本地存储 `kworks.thread-workspace-path.*` 冻结只读一个版本周期（M3）。

### 3.3 run context 契约保持
- `user_workspace_path` 字段名不变（测试锁定的原因）——语义从「前端临时传」变为「后端 threads.cwd 的影子输出」；过渡期前端缺省不传时由后端以 threads.cwd 补齐。

### 3.4 API 面（增量，全部挂现有 /api 前缀）
```
GET    /api/workspaces                # 持久顺序列表（含 status 实时合成字段）
POST   /api/workspaces                # {path,title?} realpath 校验、重路径幂等返回既有
PATCH  /api/workspaces/{id}           # title / reorder(beforeId?) / move_session
DELETE /api/workspaces/{id}           # 仅删注册；线程原样→Ungrouped
PUT    /api/workspaces/{id}/archive/{thread_id} | DELETE …   # 全局归档集合
GET    /api/threads?grouped=1         # 前端一次取 workspaces+threads 归组投影
POST   /api/threads/{tid}/goal        # create/edit/pause/resume/complete/blocked 动词族
GET    /api/threads/{tid}/goal        # GoalView（含 rounds_started；activation 为进程态经 SSE 心跳广播）
```

### 3.5 前端（对齐 client-ui-workspace README 描述的行为表）
- 侧边栏两级树：workspace 行（目录 basename + missing-dir 状态点）→ 会话行；顶部 Ungrouped 与「全部平铺」切换。
- 排序双模：Manual（拖拽持久，Host 写 workspace_sessions.position）/ Last updated（完全重排+即时晋升一次）。
- 展开记忆每 workspace 收合态；默认显示 5 条 + Show more。
- Delete workspace 确认框明示保留边界；Archive 无确认（非破坏）+ 可从 Ungrouped 过滤器恢复。
- 会话行 Fork/重命名不在本轮（QiLin 无 fork 语义），仅排序+archive。
- 新建会话入口收敛：工作区行 hover 出「+」（替代已删除的输入框 selector）；全局新建按钮走默认(Ungrouped)。

### 3.6 引擎自主循环（Round Driver@QiLin）
- 触发边界：SSE 流结束 + 无排队用户输入 = idle 点；gateway 内 GoalRoundDriver 订阅该边界。
- 续跑投递：复用现有 chat 补全通道，以 `<goal_round>` 系统包裹消息注入（模板逐字对齐 DSH prompt.ts）。
- 轮次记账：只有 driver 注入的消息递增 rounds_started；人在循环中的发言零消耗。
- 安全阀：连续 3 轮 blocked 门槛（`GOAL_BLOCK_AFTER_ROUNDS` 配置）；重启后 goals 表相位保留但 driver 不武装——需人类在 UI 按 Resume 才续跑（activation 位保存在 gateway 进程内存字典）。
### 3.7 概念边界：引擎暂存区 vs 注册表工作区（后端取证后新增）
- `.qilin/threads/{tid}/user-data/workspace` = 引擎沙箱暂存区（产物/上传/输出落点，挂载 `/mnt/user-data`）——**不动**。
- 注册表工作区 = 真实外部目录的分组与授权锚点（DSH 语义）。P1-P2 阶段仅承担**归组与 UI**；授权接线（sandbox 增发真实目录读写）留待 §0 jobs/subagent 同批后续。
- 命名纪律：代码中引擎侧沿用 `workspace_path`（既有），注册表侧新名 `registry workspace` / 表前缀 `workspace_*` 已就位。

## 4. 平滑迁移方案（.qilin 零破坏）

M1 schema-additive：全部变更为 Alembic revision（ADD COLUMN / CREATE TABLE），SQLite WAL 在线完成；SCHEMA 单调推进。
M2 回填：首启若无 workspace_meta.initialized → 以扫描 users/<uid>/threads 的会话头（对应 DSH 读 header 三字段的等价物）建索引；cwd 全 NULL → 全部入 Ungrouped，不虚构工作区。threads.cwd 列加 `(user_id, cwd)` 组合索引供分组投影。
M3 localStorage 变迁：`kworks.thread-workspace-path.*` 冻结读取一个版本周期（仅作只读兜底展示），新真源是 threads.cwd；`recent-workspace-paths` 已随组件删除。
M4 回滚安全：迁移前 `.qilin/data/qilin.db.bak-*` 惯例延续，脚本自动备份到 `.bak-pre-dsh-align`。

## 5. 阶段切分（每阶段独立可交付可回归）

| 阶段 | 内容 | 验收 |
|---|---|---|
| P1 后端地基 | workspaces 五表+迁移 M1/M2+API CRUD+threads.cwd 不可变写入 | pytest 迁移用例；旧库升级演练 |
| P2 分组读模型 | GET /api/threads?grouped=1 投影 | api 快照断言 |
| P3 前端侧边栏 | 树形分组/双排序/drag/archive/展开记忆 | Playwright 走查+vitest 组件测试 |
| P4 新建收敛 | 工作区行内新建+默认 Ungrouped；去孤儿入口 | 手动回归 |
| P5 goal 领域 | goals 表+CAS 动词 API+SSE 广播 | pytest 生命周期矩阵 |
| P6 轮次驱动 | idle 驱动+prompt 注入+人消息豁免+blocked 门槛 | e2e：模拟 LLM 半途停止→自动续跑 |
| P7 文档/清理 | README 差异表、验收清单第 9 节、删除 TBD 段 | doc 一致性 |

## 6. 待决问题（不阻塞 P1-P3）
- SQLite 并发写与 gateway 多实例（现单实例假设是否成立？）
- threads.cwd 对历史非空情形是否需要 CLI 手动指定工具？（默认：一律 Ungrouped，人工 GUI 归组即可，量少）
