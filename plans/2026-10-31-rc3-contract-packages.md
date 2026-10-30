---
description: "rc.3 R2（X 契约小包）：deliverable-file-references、message-quotes、file-drag 三包移植与组合接线；official-bundles 核实为 app-boot 内联覆盖（不重复移植）。含红线、验证矩阵与执行状态。"
kind: "plan"
---

# rc.3 R2：X 契约小包移植

- 日期：2026-10-31 · 前置：R1 已提交（R1 feat 提交）。上游取材源 tag `dsh-v0.2.2-alpha.2`。
- 范围：三包入树 + 组合行接线 + 目录/文档再生；official-bundles 不移植（见 §1）。

## 1. 四包核实

| 上游包 | 核实结论 |
|---|---|
| `deliverables/deliverable-file-references` | 宿主提示词插件（systemPrompt 段）；web-app 与 sdk-app 各一行。移植。 |
| `session/message-quotes` | 客户端引用插件，但整条依赖管线（ui-conversation user-text registry/两个槽位、inputActions.insertQuote、ui-primitives QuotePreview/quote-text、ui-chat 用户正文渲染切换、测试夹具）在 QiLin 缺席，且换渲染触及「本地特性不回退」红线。**延期**（见 §4）。 |
| `util/file-drag` | 浏览器传输命名契约（mime）；树内暂无消费方（client-ui-file-drag 未移植），作为契约包入树并登记延期消费。移植。 |
| `util/official-bundles` | QiLin 已在 `packages/boot/app-boot` 内联等价实现（ON_DEMAND_BUNDLES / OFFICIAL_ON_DEMAND_CATALOG / OfficialBundleCatalogEntry + 生成器 gen-official-bundle-catalog）。**不重复移植**。 |

## 2. 批次

### R2a（队友 contract-plugins）
- [x] `packages/deliverables/deliverable-file-references`：src/index.ts（提示词段）+ 测试 + README 三语 + locale en/zh + tsconfig
- [x] `packages/util/file-drag`：src/index.ts（+ mime 依赖）+ names 测试 + README 三语 + tsconfig
- 验证：两包 vitest；host face tsc（含引用）

### R2b（延期，不并入本批）
- 核实结论：整条 user-text 管线缺席（详见 §4）；lead 决定移除本批，悬空注册（base 两条 alias / client ref / web-app 行与依赖）已回退。
- 后续两路径登记于 §4，开工前先拍板。

### R2c（lead）
- [x] 共享注册（本次已完成）：tsconfig.base 三包别名（message-quotes + /client）、host refs（file-drag、deliverable-file-references）、client refs（message-quotes）
- [x] 组合行（本次已完成）：web-app 增 message-quotes（ui-approval 后）与 deliverable-file-references（ui-cordis 后）；sdk-app 增 deliverable-file-references；两包 package.json 依赖同步
- [x] 目录再生（client/config/kylin/tool/doc-graphs/module-graph）、文档门、受影响包测试、双 face tsc、oxlint
- [x] 回填本计划并提交

## 3. 红线

1. 语言面仅 en/zh（message-quotes 的 ja/es/fr/de/ru/pt 词典不移植；deliverable-file-references locale 仅保留 en/zh）。
2. 模型可见提示词为英文静态文本；不本地化 prompt。
3. 共享 tsconfig 与组合文件由 lead 独占；队友只改包内。
4. file-drag 无树内消费方，README 的 Known Limitations 如实登记（消费方为后续 client-ui-file-drag）。

## 4. 延期登记：message-quotes（2026-10-31）

证据（队友 quotes 全量 grep + 源码核对）：
- ui-primitives 缺 QuotePreview（组件 + 样式）与 markdown/quote-text.ts；
- ui-conversation 缺 UserTextRegistry/UserTextRule/UserTextFacts/conversation.userText/conversation.interactions/inputActions.insertQuote；
- 槽位 conversation.user.text.node 与 conversation.chat.text-interaction 不存在；
- 测试夹具 ui-conversation/tests/user-text-component-fixture.client.tsx 不存在。

两条后续路径（择一，开工前拍板）：
1. **R2b-pre 管线移植**（大）：ui-primitives（QuotePreview/quote-text）+ ui-conversation（text-interaction registry/user-text document/两个槽位/apply 注册）+ ui-chat 用户正文从 projectUserText 切到 renderSlot + test-runtime 夹具；与「本地特性不回退」红线正面冲突，需先确认渲染换血可接受。
2. **本地引文渲染**（小）：在 QiLin 现行 projectUserText 上实现引用选择与引文渲染（QuotePreview + quote-rule 复用），只动 ui-primitives/ui-chat，不引入 registry。

本批处理：不动代码；web-app/sdk-app 组合行只保留 deliverable-file-references。
## 5. 执行状态（2026-10-31）

- **R2a 完成（队友 contract-plugins）**：deliverable-file-references（提示词段 + 1 例测试）与 util/file-drag（15 例）入树；两包 tsc exit 0；oxlint 0；pairing 1183 对一致；model-experience 362 READMEs conform。file-drag 令牌改 application/x-qilin-file，README 登记「暂无消费方」。
- **R2b 延期（lead 决策）**：message-quotes 依赖整条上游 user-text 管线（见 §4），与本地性不回退红线冲突；悬空注册已回退（base 两条 alias / client ref / web-app 行与依赖均 grep 0）。
- **official-bundles 不移植**：QiLin app-boot 已内联等价实现（生成器 gen-official-bundle-catalog）。
- **快照口径**：snapshot 场景自带固定 composition（snapshot.yml 的 composition + 场景内 cordis.yml），组合行不改变回放；本次无需重录快照 fixture（QILIN_SNAPSHOT=refresh 在本机环境会注入会话预设导致 fixture 污染，已全部回退并清理）。
- **lead 收尾**：组合行（web-app: deliverable-file-references；sdk-app: 同）+ 两包 package.json 依赖；目录再生 6 个生成器全 OK；verify-cordis-config 224 配置全过；test:docs 21/21 全绿（doc-standard 增 file-drag 库登记、仓库引用门修正计划中的提交号）；双 face tsc exit 0；pnpm install 写入两新 importer。
