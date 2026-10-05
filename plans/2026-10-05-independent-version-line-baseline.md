---
description: "独立版本线基线：3.1.0 起引擎独立开发、上游 deepseek-harness 降为参考源（借鉴不 merge）、DSH 第三方插件兼容安装承诺、借鉴流程与版本纪律。决策记录，未动代码。"
kind: "plan"
---

# 独立版本线基线（3.1.0 起）

- 日期：2026-10-05
- 决策人：用户（本轮会话拍板）
- 状态：已决策；随 3.1.0 发布转为 implemented Agent Note（architecture 类），本文档届时归档收尾

## 1. 独立版本线

1. 基座 = 当前 main `3.0.11`（tag `v3.0.11`）。上游 `dsh 0.2.1-alpha.1` 线已随 `upgrade/dsh-0.2.1-alpha.1` 分支的合并吸收完毕，无半成品悬置——3.0.11 是该升级 saga 的闭环点，也是独立线的起点。
2. 自 3.1.0 起：版本号由本仓自主演进，**不再追上游版本号、不再执行上游 merge**；每次 main push 的 tag/release 纪律照旧（AGENTS.md 既有规则）。
3. 自家插件套件（dsh-coding-sidebar 等 npm 包）随 3.1.0 一起换线（具体号制随双工作台方案拍板）。
4. 兼容面松绑：session 格式、内部 plugin slots、client 组合按产品需要演进，不背「与上游兼容」包袱；代价是未来借鉴上游时，凡本仓改过的契约，上游补丁需手工适配。

## 2. 上游 = 参考源

1. `dsh` remote（本地 `/Users/libing/kk_Projects/deepseek-harness` 检出）**保留**，角色从「升级来源」降为「参考源」。
2. 关系只有一种：**借鉴**——摘补丁 + rescope + 适配本仓契约，落地为仓内提交；永不 merge、不追版本。
3. `@deepseek-ai/dsh*` peer 门在 QiLin 已确认惰性（`isRuntimePeer()` 只求值 `@qilin/`）；新插件一律只声明 `@qilin` 契约。S2.1 加宽过的 dsh peer 声明已随「包命名空间由 `@deepseek-ai/dsh-*` 改为 `@qilin/*`」的 rescope 提交整体改写，无可摘项——3.1.0 清理清单里这项撤销。
4. 借鉴节奏（是否定期翻上游 release notes）由用户决定，不建机制（D8）。

## 3. DSH 第三方插件兼容安装（2026-10-05 补充拍板）

1. 承诺：dsh 生态的第三方插件（如 `dsh-context`）在 QiLin 上**可安装、可加载**。`@qilin/dsh-compat` 是长期兼容面而非清理项——借鉴不 merge 的对偶面：上游代码只摘不收，上游插件要装要跑。
2. 已发现缺口（用户实机复现）：plugin-manager 的清单读取全部单通道只认 `qilin.*`，DSH 时代插件在 `dsh.bundle.patch` 下声明的组合包被安装门拒为 `not-a-bundle`。复现链：web 添加插件输入 `dsh-context` → 「这个包没有声明组合包」；该包 npm 清单（0.64.0）实际声明 `dsh.bundle.patch: "./cordis.patch.yml"`、`dsh.client.inject` 六项，**无 `qilin` 键**——UI 文案「没有声明组合包」是误导，实为「声明在 dsh 键下、安装门不认」。
3. 加载侧已就绪、管理侧欠账：app-boot profile（profile.ts:1223/1269）与客户端模块系统（`clientDeclarationOf`/`dshCompatModuleId`）已双通道；分叉点是 rescope 时只改了加载侧。`dsh.client.inject` 的六个 `@deepseek-ai/dsh-*` 名按机械映射全部落在仓内既有包（api-remotes、client-connection、client-locale、client-ui-conversation、client-ui-settings、client-ui-sidebar-right）。
4. 修复面（已落地工作区，随下次提交发布；实测 `dsh-context` 安装、启动激活全链走通）：三层——
   - **安装门（plugin-manager）**：单通道清单读取全部改走 `@qilin/dsh-compat` 共享读取器（`inspectionOf`、`bundleManifest`、reconcile、安装应用路径、`declaredRows`/`bundleRows`）；`viewProfilePackage` 的 `pnpm view` 字段清单补 `dsh` 键（registry 安装此前根本读不到 dsh 清单）；拒装 reason 对齐 profile.ts:1269 双通道措辞。app-boot `readProfilePlugins` 与 test-support roster 同步。
   - **别名表（dsh-compat）**：`DSH_PLATFORM_MODULE_ALIASES` 补 `@deepseek-ai/schemastery → @qilin/schemastery`——基础库的 rescope 改名不在机械 `dsh-` 前缀规则覆盖内，缺失导致该包连 generation 条目都进不去。
   - **运行时解析（app-boot resolver）**：runtime 模式的 fallback 路由此前只从 declarer 原生解析，被翻译的 bundle 携带 peer（`@deepseek-ai/dsh-session` → 磁盘上是 `@qilin/session` 目录）永远够不到映射目标——现按映射目录锚定解析规范名（ESM/CJS、enforce/verify 同改）。测试此前只断言失败诊断，成功路径本次补齐。
5. 排期：该切片不依赖双工作台 S2–S4，可并行；作为「兼容安装承诺」的兑现项随 3.1.0 发布（S5 的隐性依赖）。实机验证：一次性 profile 装 `dsh-context` → 真实 CLI 启动无激活告警、host 入口 import 成功；Web 端浏览器走查通过（面板条目正常呈现）。
6. 布局对齐（同切片附带）：dsh 插件的左栏动作此前与账户菜单同挤 `sidebar.footer.action` 一行；现新增 `sidebar.account` 单槽（ui-sidebar 契约/SlotMap/SidebarRoot 渲染/css），账户菜单迁入，插件动作行回到「叠加在用户区上方」的上游布局。

## 4. 借鉴流程（每次借鉴照此走）

1. **立项**：在上游检出中定位目标改动（release notes / 具体提交），登记进 `plans/` 一份短分析（动机、涉及面、与本仓契约的差异点）。
2. **摘取**：cherry-pick 或手工搬运到工作分支；凡触及本仓已演进契约（session 格式、槽位、rescope 面）的，按本仓现状改写，不做机械套用。
3. **验收**：按 qilin-pre-push-checks 选窄检查；模型可见面变化必须带快照；涉资格式变更按 persistence-type 流程声明。
4. **留痕**：提交信息注明上游来源（`dsh <sha>`）；若形成结构性决策，按 AGENTS.md 规则落 Agent Note。

## 5. 历史计划收尾说明

- `plans/` 既有上游对齐系列（2026-09-28/09-30/10-01）是历史记录，保留不动。
- `upgrade-0.2.1-alpha.1.md` 工作态计划在 KCoder 侧工作区（非本仓），其内容已全部落地（merge + S2.1 peer 加宽 + 3.0.11 重号），无遗留项。
- 09-22 的「vendor 不 fork」决策（KSRW 侧）哲学同构：拷贝 + 挑选；本文档将其升到整机级并显式废除 merge 通道。
