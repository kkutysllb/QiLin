# Agent Note: 上游 0.2.0-rc.1 对齐决策门

Status: implemented

[English](2026-09-28-upstream-0-2-0-rc-1-alignment-decisions.md) | 中文

## 问题

覆盖 B0–B9 批次的[升级计划](../../../../plans/2026-09-28-upstream-0.2.0-rc.1-alignment.md)需要先拍板十一项 owner 决策，依赖批次才能开工：落地方式、目标版本、遥测默认值、账号边界、插件分发约定与产品埋点。

## 决策

全部决策门于 2026-09-29 按计划推荐默认采纳，记录于计划 §3.1。

- **D0-a**：直接落 `main`，每批一次提交。
- **D0-b**：目标版本 `3.0.6`。
- **D1**：`session-log-deepseek.enabled` 保持默认 `true`，改为逐请求 `Volatile<boolean>` + General 设置行开关 + 合规文案。
- **D2**：切换新端点 `dsh-otel-collector.deepseeksvc.com` 并引入共享 `otel` 行；环境变量沿用 `QILIN_TELEMETRY_OTLP_URL` 前缀。
- **D3**：不移植账号搜索主机路；只摘四块解耦件（`SearchAuth` 判别、`x-dsh-auth-token` 头、401-account 文案、`available()` 放宽），`resolveAccountToken` 保留为可选入参且 QiLin 侧不注入。
- **D4**：插件 peer 围栏写成 dsh-plugins README 的显式分发约定；不恢复 `isRuntimePeer` 判定。
- **D5**：本轮只落机制；12 个卫星插件的 icon/locale 补件推迟。
- **D6**：采上游可选 bundle 机制，撤回 QiLin `bundle/web-app` 自有的 `time-context`/`schedule`/`ui-schedule` 开启行；与 `dsh-kylin-automation` 的功能重叠单独立项。
- **D7**：预览版说明自拟文案（QiLin 版本串 + 自有反馈渠道）；机制（设置文档键 + 精确相等）照搬。
- **D8**：本轮不采产品埋点；QiLin 代码不出现 `ctx.get('productAnalytics')?.track(...)` 调用，仅有埋点消费方的模块跳过而非留孤儿。
- **D9**：不改设置保存路径；上游发布说明中 `boot/config-editor` 一条记为不适用。
- **D10**：采 `agent-experience` 技能内容，落到 QiLin 自有预设技能层级 `packages/preset/agent-presets/presets/cordis/skills/`；执行归 B8 卫星批，随之推迟。

## 落选方案

**为 peer 围栏恢复 `isRuntimePeer`（D4）。** 拒绝：该判定把分发要求藏进插件代码；README 显式约定让每个卫星仓的 owner 在发布时点担责。

**随遥测批一并采纳产品埋点（D8）。** 拒绝：该栈依赖 QiLin 从不移植的上游账号面；保留调用意味着死代码与孤儿模块。

## 后果

B0–B9 全程对一份记录意图执行，计划 §9.1 将每批与验收命令、结果相互链接。执行期内出现的轮内决策变化单独留档，尤其是[运行态扫光重新采纳](../feature/2026-09-29-running-status-shimmer-redecision.zh.md)。推迟项在计划中保持可见：`agent-experience` 技能采入（D10，随 B8）、卫星插件 icon/locale 补件、`dsh-kylin-automation` 重叠立项、B7 浏览器基建测试，以及由各仓 own 的 B8 卫星仓执行。

## 验证

计划 §3.1 记录每项决策及日期；计划 §9.1 记录各批状态、上游覆盖、验收命令与遗留。B9 发布执行了全量门禁聚合，生成物重跑无漂移，`v3.0.6` 标签与工作区版本一致。
