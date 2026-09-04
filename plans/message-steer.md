# 繁忙时消息处理机制——排队发送 / 插话发送（参考 DSH）

> 用户定调：参考 DSH，麒麟引擎补齐 agent 繁忙时消息处理的选择——排队发送
> 与插话发送。前后端一起做，前端样式参考 DSH 实现。

## 已定决策

- **引擎语义对齐 DSH agent-loop**（packages/core/agent-loop/src/agent.ts）：
  Inbox 双目标——`next-turn`（排队，followup）/ `next-step`（插话，steer）。
  插话不打断当前 run，在下一次模型调用前并入上下文。
- **前端架构保持客户端队列**（queue-store localStorage + coordinator），
  仅对齐 DSH 的 QueueDock 视觉与交互；不迁移到 DSH 的服务端权威队列。
- **繁忙态回车偏好**（DSH BusyEnterBehavior）：排队发送 / 插话发送二选一，
  Cmd/Ctrl+Enter 恒取另一行为。放在通用设置页。
- **跨进程归属**：注入队列为进程本地，端点校验 run 属主 worker，非属主
  409 run_not_active → 前端降级排队（新 run 天然跨进程正确）。

## Task List

### 引擎 —— ✅ complete
- [x] `qilin/agents/middlewares/inject_middleware.py`：per-thread deque 注册表
      （enqueue/drain/count）+ InjectMiddleware（before_model/abefore_model 排空
      → HumanMessage 状态更新，additional_kwargs 带 injected 溯源）+
      injected_human_message 共用构造器
- [x] gateway `POST /api/threads/{tid}/runs/{rid}/inject`（thread_runs.py）：
      404 未知/越权 thread → 409 run_not_active（结构化 detail，含 run_status，
      前端降级链按此分支）当 status!=running / finalizing / 非属主 worker →
      202 InjectResponse{run_id, message_id, status: accepted, note}
- [x] InjectMiddleware 装配进 lead agent build_middlewares（custom/configured
      之后、TerminalResponse 之前——晚于 summarization/dangling patch，
      注入消息不被下游再加工）
- [x] worker.py finally 防丢失：排空未消费注入 → accessor.aupdate 回写线程
      历史（HumanMessage 落 checkpoint，用户可见，下一轮自然接话）；
      ownership_lost 时跳过（fenced worker 不写持久历史）

### 前端 —— ✅ complete
- [x] queued-messages-bar.tsx 按 DSH QueueDock 重构：多条折叠计数头
      （「N 条排队消息」+ chevron，默认收起）+ 单行省略预览 + 28px 圆形
      编辑/删除/插话按钮；插话按钮仅运行中可用；保留 error 重试与
      injected 清理；send-all 收进计数头；去掉 reorder（DSH 无此交互）
- [x] InputBox：busyEnter/onSteer props + onKeyDownCapture 捕获 Cmd/Ctrl+
      Enter + 繁忙分支「偏好 XOR 修饰键 → 插话，失败降级排队」
- [x] controller handleSteer：直调 injectMessage，409/404/无 run 返回 false
- [x] 设置页通用分区加「繁忙时 Enter 键行为」Select（local-settings 持久化）
- [x] i18n zh/en/types：queue.count/steer/steerUnavailable/save/cancelEdit +
      settings.composer 五键；移除 queue.action.moveUp

## Findings

- **前端原本只有半个机制**：queue-store/coordinator/inject.ts 早已存在
  （按 KWorks 契约预设计），但引擎无 /inject 端点——每次插话 404 恒降级
  排队。本次补的正是引擎三件套 + 前端偏好与样式。
- **DSH 参考要点**（agent.ts）：send(message, target, wakeup)；
  followup=next-turn+wake；steer=next-step+wake；inject=next-step 无 wake；
  竞态重分类（abort 后 steer→next-turn）由 send 入口处理。
- **竞态窗口**：202 后 run 在下一次模型调用前结束 → 未消费注入。DSH 用
  重分类；麒麟 v1 用端点 finalizing 检查（收窄）+ worker finally 回写
  （无静默丢失），不自动接续新 run（避免在收尾热路径上做复杂决策）。
- **注入消息可见性**：HumanMessage 进图状态 → checkpoint 持久化 → SSE
  消息流自然到达前端，无需专门事件。
- **多 worker**：注入队列进程本地；属主校验复用 RunManager 既有
  worker_id property（原本就有，无需新增）。

## Progress Log

- 2026-09-03: 设计确认（前后端一起，样式参考 DSH）。引擎四件套 + 前端
  QueueDock 重构 + busyEnter 偏好 + i18n 落地。引擎测试 13 用例全绿
  （registry FIFO/摘除、中间件消费序、端点守卫矩阵）；前端 tsc 0 错、
  eslint 清、vitest 68 文件 391 用例全绿；ruff 全绿。
