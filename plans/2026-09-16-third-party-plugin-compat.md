# 第三方用户插件兼容 — 设计与实施计划

- 状态：A1/A2、B1–B4、C1–C3、D 已实施（2026-09-16）
- 范围：**仅第三方用户插件**——用户用 `qilin plugin add <spec>` 装进 `~/.qilin/profiles/<profile>` 的包
- 明确排除：QiLin 自己的内置插件包（与 DSH 内置对齐，由 QiLin 自行维护）；DSH 内置的 ~247 个 `@deepseek-ai/*` 引擎包；`@deepseek-ai/cordis*` 家族
- 上游依据：[2026-09-15 DSH 插件生态兼容](../.agents/notes/implemented/architecture/2026-09-15-dsh-plugin-ecosystem-compat.md)
- 姊妹文档：[第三方插件兼容规范（插件作者契约）](2026-09-16-third-party-plugin-author-contract.md)
- 相关历史计划：[plans/2026-09-15-dsh-plugin-ecosystem-compat.md](2026-09-15-dsh-plugin-ecosystem-compat.md)（该计划里的 `@qilin/package-manifest/aliases` 落点已改为 `packages/util/dsh-compat`）

## 兼容承诺（L2）

插件装上并重启进程后，**扩展点全部注册且可见**：tools、skills / runtime skill、systemPrompt 通告、client UI bundle、agent preset、LLM provider、storage 数据目录、hooks、http 路由。

不承诺：插件内部依赖的具体服务 API 签名等价；Electron bridge 类能力；既不读 env 又硬编码 `~/.dsh` 的路径行为（这类归入插件侧改造）。

## 现状（2026-09-16 实测）

已经具备、不需要重做：

- 安装根 `~/.qilin`（`packages/util/home-paths/src/index.ts`：`QILIN_HOME` 覆盖，默认 `.qilin`）；profile 目录 `~/.qilin/profiles/<name>`，pnpm 管理，`pnpm-workspace.yaml` 固定 `nodeLinker: hoisted` + `autoInstallPeers: false`（`packages/boot/app-boot/src/profile.ts:212`）。
- 安装命令 `qilin plugin --profile <name> add <spec>`（`apps/cli/src/plugin.ts`）；Web 侧 `packages/host/plugin-manager`（list / installPlugin / updatePlugin / uninstallPlugin / catalog）。
- manifest 双通道（`qilin.*` 优先、回落 `dsh.*`）、主机 fallback 双名发布、客户端图与种子别名（`packages/util/dsh-compat`；`packages/boot/app-boot/src/profile.ts:498/531/713`；`packages/client/modules/src/client/system.ts`；`packages/client/web/src/seed.ts`）。

对 12 个真实第三方插件的实测分类（`/Users/libing/kk_Projects/dsh-plugins`）：

| 档位 | 插件 | 现状判定 |
|---|---|---|
| A：无引擎依赖、无 home 依赖 | `dsh-file-attach`、`dsh-git-panel`、`dsh-stats-panel`、`dsh-video-generator`、`dsh-language-bundle`、`dsh-skills-bundle` | 结构上已兼容，缺验证 |
| B：无引擎依赖、硬编码 home | `dsh-animations`（预设写 `homedir()/.dsh`）、`dsh-super-ppts`（预设同上 + 模板存储根写死 `~/.dsh/super-ppts/`）、`dsh-terminal`（读 `DSH_HOME`，缺省 `~/.dsh`） | 扩展点生效，数据与预设落错位置 |
| C：引用被改名的引擎 API | `dsh-coding-sidebar`（host 6 个 + 客户端）、`dsh-file-review-kcoder`（host 2 个 + 客户端） | 引用的每个名字在 QiLin 均有对应包，且都声明为 peer |

三条推翻早期判断的实测结论：

1. 12 个插件**没有一个**把引擎包写进 `dependencies`，引擎包一律走 `peerDependencies`（coding-sidebar 13 个、file-review 12 个）。声明驱动的别名发布已经够用，因此早期设想的“全量反向发布 ~250 个别名”降级为可选加固。
2. 引擎污染硬失败几乎不会误伤：硬依赖里只有 `diff`、`zod`、`codemirror`、`@aiden0z/pptx-renderer` 这类真第三方库。
3. 真正的阻塞点是 home 路径：`dsh-super-ppts` 与 `dsh-animations` 用 `homedir()` 直接拼 `.dsh`，完全不看环境变量，因此“注入 `DSH_HOME`”单独无法修好它们。

## 工作流 A：环境身份（home 根）

**A1 强制注入 `DSH_HOME`。** 在 `loadLayeredEnv`（`packages/boot/app-boot/src/index.ts:212`）末尾，用已解析出的 home 覆盖 `process.env.DSH_HOME`，并把该写入作为独立来源记进 `LaunchEnvironmentSnapshot`（保持可审计）。单点修复即可覆盖两个载体：`apps/cli/src/bin.ts:35` 与 `apps/desktop-host/src/index.ts:304`。

- 覆盖语义与现有“不覆盖更高优先级”策略相反：`DSH_HOME` 必须强制。本机进程会继承到 `DSH_HOME=/Users/libing/.kcoder`，透传即写到别的世界里去。
- 命名空间取 `~/.qilin`，**不取** `~/.qilin/dsh-compat`。理由：`dsh-terminal` 用 `$DSH_HOME/profiles/<name>` 兜底发现 profile，插件预设写 `$DSH_HOME/.agent-presets`——只有指向真实 home 才能同时修好这两件事。代价是插件自有目录落在 home 根（`~/.qilin/super-ppts/`），这与 DSH 的既有约定一致。
- `QILIN_HOME` 保持可见，插件优先读它（见契约文档）。

**A2 `~/.dsh` 不读不写。** 加回归门禁：测试 stub `homedir()`，断言 QiLin 进程在加载第三方插件时不产生对 `~/.dsh` 的写入。

**A3 插件侧改造（A 方案）。** `dsh-super-ppts`、`dsh-animations`、`dsh-terminal` 的 home 解析统一改为：

```js
const home = process.env.QILIN_HOME ?? process.env.DSH_HOME ?? join(homedir(), '.dsh')
```

DSH 侧行为完全不变（两个变量都缺省时仍回退 `~/.dsh`）；QiLin 侧随 A1 自动落对位置。三处插件均为自有仓库，可控。规范见姊妹文档。

**A4 数据迁移。** 首次在 QiLin 加载时检测 `~/.dsh/<plugin>/`（如 `~/.dsh/super-ppts/` 模板库、`~/.dsh/.agent-presets/*`），由 `qilin plugin doctor` 提示或按需迁移，不静默丢弃。

### A1/A2 实施记录（2026-09-16）

- **落点**：`@qilin/launch-environment` 新增 `dsh-compat` 层与 `DSH_HOME_COMPAT_NAME` 常量，按可信顺序排在所有层之前；`loadLayeredEnv`（`packages/boot/app-boot/src/index.ts`）在 `.env` 层生效前写入 `process.env.DSH_HOME`，并把继承值记入 `process` 层、文件值记入各自层，因此钉定之后的快照仍可回答“原本是什么值”。
- **规约**：新增 `packages/boot/app-boot/tests/dsh-home-compat.spec.ts`（stub `homedir()`，覆盖默认 home、被 DSH 进程导出的值、`.env` 值不获胜、`QILIN_HOME` 覆盖四条）；`packages/util/launch-environment/tests/launch-environment.spec.ts` 增补层序一例。
- **反向验证**：把钉定临时替换为空操作后，新规约 4 例全部失败；恢复后通过。
- **未采纳**：没有把 `DSH_HOME` 加进 bootstrap-only 名单。现有拒绝文案会建议“改为 export”，而钉定之后 export 同样无效，该文案会误导；改为快照可审计，留给 C2 的 `doctor` 在检测到 `.env` 声明 `DSH_HOME` 时提示。
- **推迟**：源码级 “`.dsh` 字面量” 扫描没有做成本次门禁——C2 的 `doctor` 与 A4 的迁移本来就必须读 `~/.dsh`，一律禁止该字面量会与路线图冲突；A2 先以运行时规约落地。
- **文档**：`@qilin/launch-environment` 与 `@qilin/app-boot` 两份 README（英/中）、`2026-09-15-dsh-plugin-ecosystem-compat` Agent Note（英/中）已同步，三处 sidecar 已重录。

## 工作流 B：安装期校验（引擎污染硬失败）

**B1 校验函数**（落在 `@qilin/app-boot`，与 reconcile 同侧）：安装后解析 profile 的依赖，命中 `@deepseek-ai/dsh-*` 或 `@deepseek-ai/cordis*` 即抛错。错误必须给全三件事——命中包名、危险原因（profile-local 优先于 fallback，于是同进程出现两套 cordis，症状形如 `cannot get property "skills" without inject`）、修复建议（改为 peer，由兼容层提供）。

**B2 CLI 与 Web 共用一个函数**：`reconcileProfilePlugins()`（`packages/boot/app-boot/src/profile.ts` 约 930 行）与 `PluginManagerGateway.mutate()`（`packages/host/plugin-manager/src/index.ts:144`）各调一次，禁止两条路径行为分叉。

**B3 未映射包名要指名诊断**：插件 import 了 QiLin 不存在的引擎名时，报“未映射的引擎包名 X（该插件将其声明为 peer / 未声明）”，不要裸 `MODULE_NOT_FOUND`。

**B4 `autoInstallPeers: false` 提升为兼容契约的一部分**，加测试防回归。

### B1–B4 实施记录（2026-09-16）

- **落点**：`@qilin/app-boot` 新增 `engineNameCollisions()` / `assertNoEngineNameCollisions()` / `EngineNameCollisionError`（`src/profile.ts`）；`reconcileProfilePlugins` 首行调用断言，因此 CLI（`apps/cli/src/plugin.ts`）与 Web（`packages/host/plugin-manager/src/index.ts`）共用同一规则（B2）。
- **冲突判据用别名表，不用手写前缀**：仅当 `dshCompatModuleId(name) !== name`（即兼容层确实改名的名字）且该名字在 profile 内真实落盘时才计入；`@deepseek-ai/cosmokit`、`@deepseek-ai/schemastery`（QiLin 保持原名）与 QiLin 自有包天然排除。QiLin 自己发布的 fallback 链接（`.qilin-module-fallback` 投影）用 `isProfileModuleFallbackLink` 排除——这是「插件按 peer 声明旧名」的常态，不能误报。
- **诊断内容**：每个冲突包 + 它映射到的 QiLin 包 + `qilin plugin --profile <p> remove <name>` 命令 + 危险原因（profile-local 优先于 fallback → 双引擎 → `cannot get property "skills" without inject`）。命令名固定为产品 bin `qilin`，不用诊断前缀（Web 侧调用时 binName 是 `pluginManager`）。
- **CLI 行为**：`runPlugin` 捕获 `EngineNameCollisionError`，把消息写到 stderr 并返回 1，不再展开到顶层 handler；bundle 列表不被写入。
- **B3 运行时诊断**：`packages/boot/app-boot/src/profile-resolution/resolver.ts` 新增 `engineNameMiss()`，接在 `throwWithImporter`（ESM）与 `throwWithoutCjsAnchor`（CJS）——这两处是所有路由失败的汇合点。注意：**没有**改 `state === undefined` 的 pass-through 分支，因为 DSH 时代名字在那里根本不会经过（`routeUrl` 对未登记名字返回 `after-fallback` 路由），改那里会是死代码。
- **B4**：`profile.spec.ts` 的 pnpm-workspace 断言补上 `autoInstallPeers: false` 并注明理由。
- **反向验证**：注释掉诊断抛出后，`profile-resolution.spec.ts` 的新用例失败（62/63）；恢复后通过。
- **文档**：`apps/cli`、`packages/boot/app-boot`、`packages/host/plugin-manager` 三处 README（英/中）与 Agent Note（英/中）已同步，sidecar 已重录。

## 工作流 C：命令面与诊断

**C1** `qilin plugin add|remove|list [spec]`，`--profile` 可推断（缺省取当前/默认 profile）。

**C2** `qilin plugin doctor <name|path>` 静态扫描四项并输出兼容判定（可用 / 降级 / 不可用 + 原因）：硬编码 `~/.dsh`；硬依赖引擎包；引擎 import 未声明为 peer；客户端 bundle 的 inject 名未命中别名表。

**C3 全局 bin 分发**：`qilin` 必须可全局安装（`npm i -g @qilin/cli` 或安装脚本）。本机 `which qilin` 为空、`which dsh` 为 `/opt/homebrew/bin/dsh`——在那之前，“用户可以自己安装插件”只对源码 checkout 成立。

### C 实施记录（2026-09-16）

- **C1 命令面**：`qilin plugin` 的 `--profile` 改为可选，缺省为**产品 profile `qilin`**（与裸 `qilin` 启动同一默认，不是"猜当前 profile"）；新增 `list` 与 `doctor <name|path>` 两个启动器自有动词，其余参数仍原样转发 pnpm。`list` 输出 `层序\t名称@版本\t来源[(shipped)]`。
- **行计算单一真源**：`readProfilePluginRows()` 落在 `@qilin/app-boot`，CLI 的 `list` 与 Web plugin manager 的 `Remote.list` 共用它（原先 manager 里那套行计算与 `installedVersion` 已删除），两个界面不会再在版本解析/来源/可卸载性上分叉。顺带修正 manager 原先直接读 `manifest.qilin?.profile?.bundles ?? manifest.dsh?...` 的写法，改用既有的 `profileDeclarationOf()`。
- **C2 doctor**：新模块 `packages/boot/app-boot/src/doctor.ts`，`doctorPluginPackage(binName, packageDir, installAnchor)` 做四项检查（home / engine-dependency / engine-import / client-inject），输出 `usable | degraded | unusable` + 每条发现带 `severity`；仅 `unusable` 时退出码为 1（可作 CI 门槛），其余为 0。目标是"已安装包名"或"包目录"，两者都不匹配时报错。
  - 两个判据在实现中被修正：
    1. **home**：只有在包**从不读取** `DSH_HOME`/`QILIN_HOME` 时才判为问题。否则契约推荐的兜底写法 `join(homedir(), '.dsh')` 会被误报（真实插件里 `super-ppts`/`animations` 从不读 env → 命中；按契约改造后的插件 → 不命中）。
    2. **engine-dependency 的"安装实例已提供"**：不能直接用 `resolve.paths()` 的结果，因为它包含 `NODE_PATH` 与祖先目录，会把仓库自己的 `node_modules` 当成安装实例提供。改为只认**安装实例自身目录树**（`dirname(installAnchor)` 之下）的命中。这个缺陷是覆盖率门禁抓出来的。
- **C3 全局 bin**：结构性前提已具备（`apps/cli/package.json` 的 `bin: { qilin: lib/bin.js }` + `files: ["lib/*.js"]`），`node apps/cli/lib/bin.js --version` → `3.0.0`，确认全局安装形态可执行。本机未执行全局安装或发布；`npm pack --dry-run` 因 `~/.npm/_cacache` 存在 root 所有的文件而失败（与本改动无关，需要用户自行修 `~/.npm` 权限）。
- **测试**：新增 `packages/boot/app-boot/tests/doctor.spec.ts`（9 例，doctor.ts 覆盖率 100%）、`apps/cli/tests/plugin.spec.ts`（6 例：list 两种 profile、doctor 三种目标、pnpm 转发）；`apps/cli/tests/args.spec.ts` 更新为"缺省产品 profile + list/doctor 语法 + 错误分支"。
- **文档**：`apps/cli`、`packages/boot/app-boot` 两处 README（英/中）与 Agent Note（英/中）已同步，sidecar 已重录。

## 工作流 D：验证矩阵（把 L2 变成事实）

夹具取真实第三方插件，三档各一：

| 档位 | 夹具 | 断言 |
|---|---|---|
| A | `dsh-file-attach` | 宿主 patch 行挂载；客户端 boot 图含该包行；combo bundle 可取 |
| B | `dsh-super-ppts` | `ppts_check` / `ppts_render` / `ppts_templates` 注册；`/super-ppts` 路由注册；预设落 `$QILIN_HOME/.agent-presets/super-ppts`；模板库落 `$QILIN_HOME/super-ppts/` |
| C | `dsh-coding-sidebar` | 13 个 peer 名全部命中别名表；客户端 bundle 加载；其 `require('@deepseek-ai/dsh-client-*')` 命中种子表 |

统一流程：临时 `QILIN_HOME` → `qilin plugin --profile test add <本地路径>` → 启动 → 断言“扩展点注册 + 落盘路径 + 无 `~/.dsh` 写入 + profile 内无 `@deepseek-ai/*` 落盘”。

落点建议：新增 `packages/boot/app-boot/tests/third-party-plugin-compat.spec.ts`（临时 home + 本地路径安装 + boot 断言），与既有 `packages/boot/app-boot/tests/profile.spec.ts`、`packages/util/dsh-compat/tests/dsh-compat.spec.ts`、以及 A2 已落地的 `packages/boot/app-boot/tests/dsh-home-compat.spec.ts` 同侧；实施时按 [qilin-pre-push-checks](../.agents/skills/qilin-pre-push-checks/SKILL.md) 选取最小命令集，不默认跑全量。

### D 实施记录（2026-09-16）

- **落点调整**：实现在 `apps/cli/tests/third-party-plugin-compat.spec.ts`，不是 app-boot。D 的主题是"profile 组装"，按 `apps/cli/tests/profiles/AGENTS.md` 的分工，跨包 profile 行为归 apps/cli；app-boot 只保留包内 Loader 夹具。
- **hermetic 夹具（5 例，CI 可跑）**：spec 现场生成一个 DSH 形态插件包（`dsh.bundle.patch` + `dsh.client` + 旧引擎 peer），按 `qilin plugin add` 的落盘形态装进临时 profile（manifest 依赖 + `node_modules` 链接 + `reconcileProfilePlugins`），断言：① 层列表由 `dsh.bundle.patch` 驱动加入；② 经真实 Loader `boot()` 挂载且插件注册可见；③ `dsh.client` 声明可读、inject 名 canonicalize；④ 旧引擎 peer 发布到安装实例的 QiLin 包；⑤ profile 内无 `@deepseek-ai/*` 落盘、无 `~/.dsh`。
- **本地真实插件（3 例，缺省跳过）**：`QILIN_DSH_PLUGIN_FIXTURES=<dsh-plugins 目录>` 时用 doctor 对 `dsh-super-ppts`/`dsh-animations`/`dsh-terminal` 断言 `usable`。CI 没有这些仓库，端口保持跳过。
- **发现并修复的真实缺陷（身份层）**：别名条目原本从**自身锚点**重新解析 canonical，因此可能指向与 canonical 条目**不同的副本**——首次运行 D 时该断言正是这样失败的（别名指向仓库 `node_modules/.pnpm/node_modules/@qilin/session`，canonical 指向安装实例副本），与"两个名字共用一个引擎实例"的承诺相矛盾。修复：两处遍历都优先复用已选定的 canonical 目录（安装遍历用 `links.get(canonical)`，bundle 遍历再加 `installedDirs.get(canonical)`，后者由新的 `dependencyClosure` 参数从安装遍历传入）。修复后 5+3 例全绿，既有 profile/解析规约无回归。
- **spec 自身的用法修正**：`boot()` 的第三个参数是 **patch 层列表**（`PatchOptions[]`），不是 `composeEntries()` 的 entry 列表；用错时行不会挂载。
- **逐档覆盖说明（如实）**：A 档（零依赖 bundle）由 hermetic 夹具覆盖；B 档（home 落位）由 A3 的插件自带冒烟 + doctor 对真实插件覆盖，QiLin 侧不重复；C 档（引擎 peer 映射）由 hermetic 夹具覆盖；客户端**图**由既有 client-modules 测试承担，D 只断言声明可读与 inject 规范化。super-ppts v1.4.0 已不再发布预设（改为清理旧预设目录），因此原计划的"预设落位"断言不再适用。

## 风险与待定

- **全量反向别名**：当前判断不做，改为 `doctor` 兜住“未声明 import”。若后续出现真实插件踩坑，再以“平台/引擎包子集”为界加固。
- **`DSH_HOME` 强制的副作用**：用户 `.env` 里显式写的 `DSH_HOME` 会被忽略。需要在文档写清，并把逃生舱留给 `QILIN_HOME`（而不是放开 `DSH_HOME`）。
- **插件侧改造依赖发版**：三处插件均自有，但需与 QiLin 侧 A1 同时可用；A1 先上不影响 DSH。
- **不含内置插件包**：QiLin 内置包与 DSH 对齐由 QiLin 自行维护，本计划不为它们做任何映射。

## 落地顺序

1. A1 + A2（QiLin 侧单向收益，先上）——**已实施 2026-09-16**，见上文实施记录
2. B1 + B2 + B3 + B4（安装期可信）——**已实施 2026-09-16**，见上文实施记录
3. C2 `doctor`（把已知降级变成用户可见信息）——**已实施 2026-09-16**，含 C1/C3，见上文实施记录
4. A3（插件侧三处改造发版）
5. D 验证矩阵 + C1/C3 命令面收口——**已实施 2026-09-16**（C1/C3 随 C 落地），见上文实施记录
6. 实施 PR 内补写 Agent Note（`proposed/architecture/` → 实现后转 `implemented/`）
