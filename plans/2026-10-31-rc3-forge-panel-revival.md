---
description: "rc.3 R1（AB/C6 复工）：client-ui-forge 面板与 forge-bundle 重新入树。含四前置核实结论（仅 ui-primitives code-highlighting + util/code-language 真实需要）、批次、红线与验证矩阵。"
kind: "plan"
---

# rc.3 R1：forge 面板复工（AB/C6）

- 日期：2026-10-31 · 前置：rc.2 已发布；AB 登记册（2026-10-28 计划 §4.2）与两份备份（/tmp/qilin-client-ui-forge-port、/tmp/qilin-forge-bundle-rebuilt）。
- 目标：把 `@qilin-agent/experimental-client-ui-forge` 与 `@qilin-agent/experimental-forge-bundle` 放回工作树并跑绿，作为 rc.3 主批。
- 不进本批：上游 DiffBlock/CodeToolbar 变更、六语言、vendor 升版。

## 1. 四前置核实（关键收窄）

| 前置 | 移植件实际用法 | 结论 |
|---|---|---|
| session-projection ProjectionHandle | `projection-reader.ts` 用现行 `ctx.sessionProjections.stateOf(session,key)` + 同步 disposer；`register()` 结果为 disposer | **不需要**投影重构 |
| ui-primitives useCodeHighlighter/languageForPath | `DiffFile.tsx` 真实 import（Menu/MenuItemButton 已有） | **需要**：新增 `code-highlighting.ts` + 移植 `util/code-language` |
| api/remote-access 会话粒度授权 | 仅 `import type {}` 模块增强，无 whenAccess/whenResourceAccess 调用 | **不需要** |
| agent-loop-testkit unsupportedModel | 全文未引用 | **不需要** |

其余导入包（forge/forge-session/forge-github/worktree/session-projection(-cache)/session-query/client-test-runtime 等）均已在树。

## 2. 批次

### R1a+（队友 code-lang）
- [x] 移植 `packages/util/code-language`（上游 dsh-v0.2.2-alpha.2，rescope；en/zh 文档）
- [x] `ui-primitives/src/code-highlighting.ts` + index 两条导出 + spec（新文件覆盖）
- 验证：两包 vitest + `tsc -b` 双构建

### R1b（队友 forge-port）
- [x] 放置 `experimental/client-ui-forge` 与 `experimental/forge-bundle`（剔除 node_modules/lib，版本 3.1.8-rc.2）
- [x] `pnpm install` 链接 workspace（lockfile 更新）
- [x] 面板 13 spec 跑绿；双 face tsc；verify-cordis-config
- 验证：见上；失败即停并回报，不合入半成品

### R1c（lead）
- [x] 共享注册（已完成）：tsconfig.base 别名（client-ui-forge ×3、util-code-language）、host refs（util-code-language、client-ui-forge/tsconfig.host.json、forge-bundle）、client refs（client-ui-forge/tsconfig.client.json、util-code-language）
- [x] 目录再生（client/config/kylin/doc-graphs）与 README/docs 门
- [x] 合并复核 + 全量受影响包测试 + 双 face `tsc -b` + oxlint；回填本计划

## 3. 红线

1. 语言面只 en/zh；新包文案走既有 locale 机制。
2. 共享 tsconfig 由 lead 独占；队友只改包内。
3. 版本字段统一 3.1.8-rc.2；不动 SESSION_FORMAT_VERSION。
4. 上游只读 tag `dsh-v0.2.2-alpha.2`；不取 master。
5. 半成品不入树：单包失败即停并回报。

## 4. 执行状态

- 2026-10-31：四前置核实完成（§1）；共享 tsconfig 注册完成；R1a/R1b 派队友并行。
## 5. 执行状态（2026-10-31）

- **R1a 完成**：`packages/util/code-language` 整包移植（73 例）；`ui-primitives/src/code-highlighting.ts` + index 两条导出 + 5 例 spec；Toast `actions`（含 latest-onDone ref、.action 样式、9 例）；新文件覆盖率 100%。实测 74 文件 1427 例绿。
- **R1b 完成**：`experimental/client-ui-forge`（82 文件）与 `experimental/forge-bundle`（11 文件）入树；面板 23 文件 641 例全绿（起点 53 红 → code-highlighting 后 20 → Toast 后 1 → 漂移修复后 0）；双 face tsc exit 0；verify-cordis-config 224 配置全过；bundle 产出 lib/ 与 typert 产物。
- **lead 收尾**：① 投影增广改挂 `@qilin-agent/session-projection/types`（原挂运行时 specifier 造成同一 host 程序双模块身份，57 条 session-projection(-cache) 测试类型红）——修正后 host face 0 错；② `tests/harness.ts` 去掉 QiLin 的 `agent/pre-step` 事件不承载的 `modelSelection` 字段；③ lint 修正（同步 apply、dispose 去 await）；④ 目录再生 + TYPE_LINK_EXEMPTIONS 7 条 + SERVICE_PAGE/SERVICE_ROLES 的 forgePanel + capability-seams 中英成对更新；⑤ 文档门实跑 21/21 全绿；⑥ 六个生成器 --check 全 FRESH。工作树未 commit。
