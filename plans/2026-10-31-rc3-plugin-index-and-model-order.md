---
description: "rc.3 R3：G 插件市场→插件索引文案统一（上游 5b0e089f40/6c07e02afa）与 E 设置页模型拖拽排序（上游 5d3ea87d28/ec387796af）。含批次、红线、验证矩阵与执行状态。"
kind: "plan"
---

# rc.3 R3：插件索引文案统一 + 模型拖拽排序

- 日期：2026-10-31 · 前置：R1/R2 已提交。上游取材源 tag `dsh-v0.2.2-alpha.2`。
- 范围：G（纯文案/文档重命名）与 E（设置页模型行拖拽排序 + 拖拽行为抽到 ui-primitives）两批并行。

## 1. 上游来源

| 簇 | 上游提交 | 内容 |
|---|---|---|
| G | `5b0e089f40` `6c07e02afa`（及 `07ef8a20b8` 合并） | custom plugin market → custom plugin index：ui-plugin-market 文案/README/locale、boot/plugin-market locale/README/tools 描述、docs/user/guide/plugin-market、tool-catalog、cookbook 与 expected 文本；不改包名/目录/服务名。 |
| E | `5d3ea87d28` `ec387796af` | 把 ui-workspace 的 AnimatedRows/useRowDragPreview/RowDragPreview 抽到 ui-primitives；ui-settings-models 的模型行支持拖拽排序（DeepSeekModelsEditor/ModelListEditor/ModelRow/useModelRows/CSS + model-order/animated-rows/row-drag-preview spec）；ui-workspace 改用共享原语；providers 指南补充说明。 |

## 2. 批次

### R3a（队友 index-copy）
- [x] ui-plugin-market：locales（en/zh）与 tests 断言、README 三语（i18n.yaml 重录）
- [x] boot/plugin-market：locale en/zh、README 三语、src/tools.ts 描述
- [x] 设置侧引用（ui-settings-plugins 等）中同义文案对齐；全仓 grep「plugin market / 插件市场」仅保留内部标识
- [x] docs/user/guide/plugin-market en+zh（成对）+ cookbook adding-a-package 提及 + tool-catalog 由生成器再生
- [x] apps/web/tests 相关 expected（plugin-config / plugin-manager）与断言同步
- 验证：两包 client/boot spec；受影响 expected 同步；文档门

### R3b（队友 model-order）
- [x] ui-primitives：新增 AnimatedRows.tsx(+css)、RowDragPreview.module.css、useRowDragPreview.ts 与 index 导出、README 两行
- [x] ui-settings-models：模型行拖拽排序（编辑器/行/状态/CSS），适配 QiLin 现行结构；新增 model-order 等 spec
- [ ] ui-workspace：改用手势原语（Rows/WorkspaceBrowser/测试同步）——**延期**：QiLin workspace 早于该特性，改用共享原语等于整包补动画+预览（新行为），已登记 §5
- [x] docs/user/guide/providers en+zh 补说明；i18n.yaml 重录
- 验证：ui-primitives / ui-settings-models / ui-workspace spec 全绿；client tsc

### R3c（lead）
- [x] 复核两队友 diff；目录再生（client/kylin/tool/doc-graphs/module-graph）
- [x] 双 face `tsc -b`；受影响包测试；test:docs；oxlint
- [x] 回填本计划并分两笔提交（feat + docs/plans）

## 3. 红线

1. G 只改用户可见文案与文档，不改包名、服务名、目录、identifier。
2. E 不改模型选择/请求语义，只改排序呈现与持久化顺序（如涉及配置键须与上游一致）。
3. 语言面仅 en/zh；README 成对重录。
4. 共享文件（ui-primitives/src/index.ts）仅 R3b 修改；两批写范围互斥。
5. 快照：场景 composition 固定，文案类改动不改 fixture；若 client spec 断言受影响须同步。

## 4. 执行状态

- 2026-10-31：开工；两批派队友并行。
## 5. 执行状态（2026-10-31）

- **R3a 完成（队友 index-copy）**：15 文件文案/文档/测试断言统一为「插件索引」；ui-plugin-market 149 例绿；README 成对重录；包名/服务名/事件/路由/工具名等内部标识不变（对齐上游口径）。
- **R3b 完成（队友 model-order）**：ui-primitives 新增 AnimatedRows/useRowDragPreview/RowDragPreview + 拖拽手柄图标 + 19 例 spec；ui-settings-models 实现模型行拖拽排序（useModelRows/ModelRow/两个编辑器/CSS/locale + 19 例 spec）；三包 99 文件 1962 例绿、tsc exit 0、oxlint 0。
- **延期（独立批次）**：ui-workspace 改用共享原语——QiLin workspace 无该特性，属新增侧栏动画+预览行为，不并入本批；apps/web e2e（models-settings）需构建后补跑。
- **lead 收口**：dir 再生 6 项全 OK；gen-doc-graphs 服务标题改 Plugin index reader；verify-cordis-config 224 配置全过；test:docs 21/21 全绿（capability-seams mermaid 中英同步、tool-catalog 成对重录）；双 face tsc exit 0；快照零改动。
