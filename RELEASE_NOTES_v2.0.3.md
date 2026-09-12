# QiLin v2.0.3 · 运行中插话 + 循环检测护栏重构 / Steer-While-Running & Loop-Guard Rework

> 发布时间 / Released: **2026-09-12**
> Tag: `v2.0.3`
> 基于 / Based on: **v2.0.2**（12 个提交 / 12 commits）

---

## ✨ 概览 / Overview

v2.0.3 把「**运行中插话（steer）**」做成前后端贯通的一等能力——agent 正在跑的时候，用户可以直接把新指令插进当前 run（不打断、不排队等下一轮），交互形态对齐 DSH 的 QueueDock；同时完成一轮**循环检测护栏重构**：Layer 1 从滑窗多重集改为「连续完全相同的 tool-call 集」链语义，提醒阶梯化并新增「被拒/失败重复调用」的提前打断，误报与烧 token 双双下降。配套 Web 工作台细节打磨（turn 尾朱砂波光状态字 + turn 用时统计、侧边栏折叠按钮归位、token 徽章去重）、插件运行时清单出库（安装卸载不再脏工作树），并落地 **`release.yml` 发布自动化**（`v*` tag 推送 → 复用 CI 全部门禁 → 发布 GitHub Release）。后端 pytest 1038 passed / 6 skipped，前端 vitest 391 全绿。

---

## 🚀 新增 / What's New

### 运行中插话（steer）/ Steer while running

- **引擎注入面 / Engine injection surface** — 新增 `qilin/agents/middlewares/inject_middleware.py`：per-thread 进程内注入注册表（enqueue / drain / count）+ `InjectMiddleware` 在每次模型调用前排空队列，产出 HumanMessage 状态更新（`add_messages` 追加、随 checkpoint 持久化、SSE 自然可见）。
- **装配位置 / Pipeline position** — `InjectMiddleware` 装配进 lead agent 中间件链（custom/configured 之后、TerminalResponse 之前），注入内容不再被 summarization / dangling 二次加工。
- **网关接口 / Gateway API** — `POST /api/threads/{tid}/runs/{rid}/inject`：404 未知 run / 409 `run_not_active`（status != running、finalizing、非属主 worker，携带结构化 detail 供前端降级）/ 202 accepted；权限沿用 `runs:create` + owner_check。
- **防丢失 / No-loss guarantee** — worker finally 阶段排空未消费注入并经 `accessor.aupdate` 回写线程历史（用户可见、下一轮自然接话）；`ownership_lost` 场景跳过。
- **前端交互 / Frontend UX** — `queued-messages-bar` 重构（多条折叠「N 条排队消息」计数头、单行省略预览、28px 圆形编辑/删除/插话按钮；插话仅运行中可用；按 DSH 移除 reorder；send-all 收进计数头）；InputBox 新增繁忙行为选择 `busyEnter`（排队 / 插话），`Cmd/Ctrl+Enter` 取反向行为；steer 失败（无 run / 409 / 404）自动降级回排队。
- **设置项 / Setting** — 通用设置页新增「繁忙时 Enter 键行为」偏好（local-settings 持久化），i18n 中英同步。

### 循环检测护栏重构 / Loop-detection guardrail rework

- **Layer 1 连续链语义 / Consecutive-chain semantics** — 判定从「滑窗 20 内同 hash 多重集 ≥3」改为「连续完全相同的 tool-call 集」链，彻底消除 200 行分桶对渐进式阅读（如逐段读文件）的折叠误报。
- **参数规范化 / Argument canonicalization** — 参数归一为深键序 JSON，剔除易变自由文本字段 `description`，行号范围精确参与比较。
- **阶梯式提醒 / Tiered reminders** — gentle@3（纯文字）→ detailed@5/@8（点名工具 + 连续次数 + 参数预览，`arguments_preview_chars` 默认 400 截断）；hard stop 默认由 5 提升到 12，作为链末兜底；Layer 2 工具频率层（30/50）保持不变。
- **turn 边界 / Turn boundary** — 新的用户 turn（human 消息变化）重置链：跨 turn 的重复不判为循环。
- **配置变更 / Config** — `LoopDetectionConfig` 移除 `warn_threshold`，新增 `reminder_thresholds` / `arguments_preview_chars`，`hard_limit` 默认 12（旧配置中的 `warn_threshold` 按额外字段忽略，不报错）。
- **被拒/失败重复调用提前打断 / Denial-aware early break** — 上一次同调用集的工具结果为失败（read-before-write gate 拒绝、权限拒绝、工具错误：`status="error"` 或 `Error:` 前缀内容）时，第 2 次原样重复即注入 `[REPEATED FAILED CALL]` 专用提醒，不再等 tier-3 阶梯；成功一次即清零、交还正常阶梯。与 `ReadBeforeWriteMiddleware`（stale 编辑拦截）职责边界在模块 docstring 中写明。
- **测试 / Tests** — 新增 `tests/test_loop_detection_middleware.py` 21 例（分桶误报回归、阶梯升级、turn 重置、hard stop 剥离 tool_calls、Layer 2 兼容、参数校验）+ denial-aware 5 例。

### Web 工作台 / Web workbench

- **turn 尾状态字 / Turn-tail status** — `QiLin....` 改为品牌朱砂基色（与麒麟方印 logo 同色），每字符 110ms 相位差波光扫过。
- **turn 用时统计 / Per-turn duration** — MessageFeed 按 `isLoading` 跳变记起点/冻结，runId 归档（`turn-timing`，200 条 FIFO）；AssistantMessageFooter 固定展示本轮总用时（历史恢复的 turn 不显示），实时/固定两处共用 `formatTurnDuration`。
- **布局收敛 / Layout cleanup** — 折叠侧边栏按钮归位到侧边栏头部品牌行右端（头部 logo 与品牌行按钮互斥渲染，共挂同一 testid）；移除 topbar 右上角 token 统计徽章（与底部「本次任务」统计行重复，组件文件一并删除）。

### 插件运行时清单出库 / Plugin manifest out of the tree

- **问题 / Problem** — manifest 原为 tracked 文件（`public/plugins/manifest.json`）且插件目录未 ignore，每次安装/卸载都脏工作树，升级还会改动被跟踪文件。
- **方案 / Fix** — 运行时清单迁至 `plugins/manifest.json`（server 非公开区，gitignored）；`readManifest` 容忍缺失（fresh clone 即净），`writeManifest` 自动建目录。
- **读取链路 / Read path** — client boot 改走 `GET /qilin-plugins/manifest`（`server.js` 分支，`no-store`），与 `/qilin-plugins/api` 同族；裸 `next dev` 下 boot 失败仍被优雅捕获，不影响外壳。
- **降级与文档 / Degradation & docs** — `initPluginServers` 对缺失/损坏清单统一降级为 info 日志；新增 `plugins/README.md`（布局 / 清单 schema / 生命周期）。
- **边界 / Boundary** — 明确约束：插件世界与用户本机 `~/.dsh` 零关联（npm 安装 `--cache` 指向 staging 私有缓存，不碰 `~/.npm`）。

### 工程与发布自动化 / Engineering & release automation

- **`release.yml`** — `v*` tag 推送自动发布 GitHub Release：先复用 `ci.yml` 全部门禁（lint / mypy / pytest / wheel / byte-compile，经 `workflow_call` 单一来源调用，避免副本漂移），再创建或原地刷新 Release（幂等），正文优先取根目录 `RELEASE_NOTES_<tag>.md`，缺失时 `--generate-notes` 兜底；`permissions` 最小化，仅 publish job 需要 `contents: write`。
- **README** — 新增版本演进章节，中英文拆分为 `README.md` / `README.en.md`，封面图替换为 landing 页面截图。

---

## 🔄 兼容性 / Compatibility

- **循环检测配置 / Loop-detection config** — `warn_threshold` 字段移除（旧配置作为额外字段被忽略，不会报错）；hard stop 默认值由 5 提升到 12，长任务更宽容。
- **插话接口 / Inject API** — 新增能力，既有 run 接口契约不变；非运行中或非属主 run 返回 404/409，前端自动降级为排队发送，不影响原有排队语义。
- **插件清单路径 / Plugin manifest path** — 由 `web-demo/public/plugins/manifest.json`（tracked）改为 `web-demo/plugins/manifest.json`（gitignored），客户端改经 `GET /qilin-plugins/manifest` 读取；插件安装/卸载不再污染工作树。
- **升级路径 / Upgrade path** — 引擎核心、REST/WS 契约与 v2.0.2 保持一致，可平滑升级。

---

## 🐛 已知限制 / Known Limitations

- 插话仅在 run 处于 `running` 且由本 worker 持有所有权时可用，其余情况降级为排队发送。
- Layer 1 为连续链语义：跨 turn 的重复调用不判为循环（有意为之，交由 Layer 2 窗口频率层兜底）。
- 插件安装/卸载仍需重启 web-demo 生效（无热插拔）。
- `next build` 在静态导出内部 `/_global-error` 路由时报 `useContext` 空值错误（Next.js 16 上游问题）；不影响 `next dev` 与运行时。
