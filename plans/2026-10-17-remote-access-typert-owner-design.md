# remote-access → typert 主线引入设计（多租户 owner 语义归一）

- 日期：2026-10-17 · 决策依据：用户拍板「引入」（对齐计划 §0 决策 1）
- 上游参照：dsh-v0.2.1-rc.1 的 packages/api/remote-access（src/index.ts 424 行 + types 137 + client 三件 340）+ gateway/access.ts 170 行 + typert 资源声明（remote-access.ts/remote-info.ts/tool-schema 生成）+ docs/upgrade-guide/v0.2.1-alpha.2/operator-connect
- QiLin 基线：main 8dfafbeb55 + upgrade/upstream-0.2.1-rc.1 分支（B0–B5 已落）

## 1. 两侧模型对照

| 维度 | 上游 dsh（rc.1） | QiLin（3.1.6-rc.2） |
|---|---|---|
| 部署前提 | **单运行时多操作员**：一个 Harness 运行时，owner（Session/Agent 发起者）之外可有多个 Remote 操作员（浏览器用户、passive connection） | **运行时级隔离**：qilin tenants serve 每账号一个隔离 Web 运行时，账号间不共享运行时；账号门禁（用户名+密码，accounts-local） |
| 身份 | principal（caller 身份随显式 peer/user message source 传递）+ operator（connection 级交互参与） | 账号会话 cookie（accounts-local session）；运行时内当前**无 caller 身份概念**（全连接同权） |
| 访问控制 | RemoteAccessRole/Binding/Condition + gateway/access.ts 在 typert 校验后按资源裁决非 owner 调用与事件；列表按访问过滤；AccessSnapshot 流 | 无（连接即全权）；仅账号门禁挡在运行时入口 |
| API 基建 | typert 资源声明（method/event resources、lazy RemoteMethodInfo、tool-schema 生成、build-output-guard） | 无（typert 停在窗口前形态） |
| 非页面连接 | operator-connect：非页面 Connection 默认 interactions:none，不开 $events，$on/$stream 不可用 | 无该模式（所有连接同交互面） |

## 2. 归一判断（为什么引入、引到哪一层）

1. **两套隔离不在同一层，不互替**：QiLin 租户隔离解决「账号间」；上游 remote-access 解决「同一运行时内 owner 与操作员间」。引入后者不改变租户模型，而是在运行时内补上「同运行时多连接」的访问语义——这正是 QiLin 公有部署形态下「同账号多设备/多标签页」已存在但无差别放行的面。
2. **typert 资源声明是纯增益前置**：remote method/event 资源声明 + lazy RemoteMethodInfo 同时服务 remote-access 的资源枚举与 tool-schema 生成改进（上游 4b/4c 相关面），与 RBAC 解耦可先行。
3. **owner 语义映射**：QiLin 运行时内「owner」取发起该 Session/Agent 的账号会话身份（accounts-local session → 运行时内唯一账号）。单账号运行时内所有连接默认同 owner ⇒ 默认策略等价于现行为（零行为回归）；RBAC 机制就位后，协作/共享场景按 Binding/Condition 配置收紧。
4. **principal 落点**：user message source 记录非 owner caller（session-controller）、connection 级 operator 隔离、显式 peer principal——单账号部署下这些记录恒为 owner（不产生行为差异），为多操作员与审计提供数据面。

## 3. 实施切片（每片独立可验证）

- **S1 typert 前置**：remote-access.ts/remote-info.ts（lazy method info）+ generator 的 tool-schema 产出 + build-output-guard/generate-typert 门禁 + 6 个依附 fix（上游 9c6374909/efdaa86 的 tag 终态）。验证：typert/api spec + 生成门禁。
- **S2 remote-access 包与 gateway 裁决**：remote-access 四件 + gateway/access.ts（RBAC 决策、非 owner 调用/事件门禁、列表过滤、快照流）+ 10 包依赖接线 + client hooks（ui-session/ui-workspace 的共享面挂点按 QiLin 结构对位）+ bundle/base 组合行。QiLin 特有：接入点读 accounts-local 账号身份作为 owner/principal 来源。验证：rbac 拒绝路径用例 + gateway spec + 双运行时冒烟。
- **S3 principal 组**：user-rpc-principal 持久化记录（session-controller 记 non-owner principal）+ connection operator 隔离 + client-connection 显式 peer principal + operator-connect guide 落地（interactions:none 默认）。验证：session-controller spec + 持久化 catalog 门 + 快照。
- **S4 文档与门禁**：subsystems 页（remote-access/api-gateway/typert）、config-catalog 增量、verify 家族接入。

## 4. 开放问题（已拍板，2026-10-17 用户确认）

| # | 问题 | 决策 |
|---|---|---|
| 1 | 非 owner 连接默认策略 | **默认全权**（保持现行为；RBAC 表达力留给部署配置） |
| 2 | 跨账号协作者（share） | **不进第一版**（S1–S3 只铺机制，share 面待产品需求） |
| 3 | desktop/SDK/ACP 连接 | **套用 operator-connect 的 interactions:none**（与上游一致） |

原开放问题记录：

1. **默认策略**：单账号运行时的非 owner 连接（同账号第二台设备）默认全权（现行为）还是默认只读？建议：默认全权（保持现行为），RBAC 表达力留给部署配置。
2. **跨账号协作者（share）**：上游的共享/协作者模型是否进入第一版？建议：第一版不进（S1–S3 只铺机制），share 面待产品需求。
3. **desktop/SDK/ACP 连接**是否套 operator-connect 的 interactions:none？建议：套用（与上游一致）。

## 5. 与既有批次的衔接

- B5 已落 SDK session/resume 与 jobs 生命周期记录——remote-access 的快照流与事件门禁在其上叠加，无冲突。
- B8（cua/inspector/mods）与 B7 无文件交集，可并行排期。
- 上游 61 文件 provider-data 集群已由 B3 吸收，typert 生成管线（S1）复用其 build-output-guard 形态。
