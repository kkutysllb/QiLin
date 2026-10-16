# app-boot 运行时拦截一族的对齐（代际重基）

> 状态：**计划已落，未执行**。本文是该层的 delta 分析与切片方案。它是"桌面端与上游对齐"计划最后一块，
> 但经证据核对后判定**不属于特性移植**，而是 `packages/boot/app-boot` 的**代际重基**，须独立成一条迁移。

## 1. 这一族是什么

上游把"profile 解析"这一层**改了名并扩了能力**，称为 runtime interception：

| 本仓（fork 时的名字） | 上游（改名后） |
|---|---|
| `ProfileResolutionGeneration` | `RuntimeResolution` |
| `installProfileResolution` | `installRuntimeInterception` |
| `createProfileResolutionGeneration` | `createRuntimeResolution` |
| `ProfileResolutionEntry` | `RuntimeResolutionEntry` |
| `ProfileResolutionBehavior` / `ProfileResolutionOptions` | `RuntimeInterception` / `RuntimeResolutionOptions` |
| — | `reportSkippedBundles`、`SkippedBundle`、`LinkedRoot`、`ProfileRuntimeResolution`、`readBundlePatches`、`bundlePatchFiles` / `bundlePatchPaths`、`realModuleFile` |

## 2. 为什么不是"补一个函数"

先做的名级比对把这一族列为"本仓缺失"，但逐文件 diff 显示**两棵树是不同代**：

| 文件 | 上游 vs 本仓差异行 |
|---|---|
| `src/profile.ts` | **1337** |
| `src/profile-resolution/resolver.ts` | **935** |
| `src/index.ts` | 306 |
| `src/profile-resolution/service.ts` | 99 |
| `src/profile-context.ts` / `worker-bootstrap.ts` / `config-schema/*` | 13–24（**纯改名**） |
| `tests/profile-resolution.spec.ts` | **2636** |
| `tests/profile.spec.ts` | 1243 |

且大文件里的差异**不是单向**的：本仓含**自有实现**（`legacy-links` 助手 `canonicalLinkPath` / `symlinkPointsTo` / `isProfileModuleFallbackLink`、以及本轮补的 `removeLinkProjections`），上游对应的位置用的是另一套写法。因此"照上游覆盖"会**删掉本仓行为**。

## 3. 影响面（可枚举，但跨包）

本仓沿用旧名的位置共 **12 个文件**：`packages/boot/app-boot` 的 `src/{profile.ts, config-schema/{index,collect}.ts, profile-resolution/{resolver,worker-bootstrap}.ts}` 与其 7 个 spec，外加 **`packages/boot/hmr/src/index.ts`** 与它的 `tests/package-reload.spec.ts`。消费者里还有 `apps/cli`（`profile-boot`）与 `apps/desktop-host`（本轮已接入 office 行的那个入口）。

## 4. 推荐切片（每条独立可验证）

1. **改名 + 形状对齐**：`profile.ts` 的 `RuntimeResolution*` 类型与 `createRuntimeResolution` ✓；`resolver.ts` 的 `installRuntimeInterception` ✓；`service.ts` / `worker-bootstrap.ts` / `config-schema/*` 随动 ✓；`hmr` 与 spec 同步 ✓。
2. **跳过清单**：`SkippedBundle` + `profile.skippedBundles` 的填充 ✓ + `reportSkippedBundles` ✓（`apps/desktop-host/src/index.ts` 会重新用上它 ✓ —— 本轮为它留了位 ✓）。
3. **bundle patch 读取**：`readBundlePatches` / `bundlePatchFiles` / `bundlePatchPaths` ✓。
4. **链接根与模块文件**：`LinkedRoot` / `ProfileRuntimeResolution` / `realModuleFile` ✓。
5. **spec 对齐**：先让 `profile-resolution.spec.ts` / `profile.spec.ts` 在这两代合并后的语义下通过 ✓（这是本迁移真正的验收面 ✓）。

每条落地后按仓规跑 `pnpm run test` 的 app-boot 与 hmr 两组 + `typecheck` ✓；**不要**与 `apps/desktop` 的改动混在一轮 ✓。

## 5. 与上游同步的关系（仓规）

`AGENTS.md` 的上游升级铁律要求"delta 分析 + 对齐计划先落 `plans/`"。本文件即该步骤 ✓。因为这一层是**核心启动路径**且两代已分叉 ✓，建议把它**并入下一次上游同步**统一做 ✓（那时可以用上游的 release notes + 完整 diff 一起判定）✓，而不是在没有上游版本上下文时单方面重基 ✓。

## 6. 已知副作用（若照现在的状态原地不动）

- `reportSkippedBundles` 缺位 ✓ → `apps/desktop-host/src/index.ts` 少一条"跳过 bundle"的 stderr 上报 ✓（行为差异：静默跳过 ✓，不影响启动 ✓）。
- 命名停留旧代 ✓ → 未来与上游对照时仍需本文件作为映射表 ✓。


## 7. 执行进度（对 alpha.4 的落地）

**已落地：slice 2（跳过清单）** ✓

- 上游两个提交：上游提交 "fix(boot): skip failed profile bundles and retain recovery controls"（5 文件 / +111 −44 ✓）与
  上游提交 "fix(boot): report skipped profile bundles once per start"（9 文件 / +54 −31 ✓）。
- 本仓实现（保留自有逻辑 ✓：`dropRetiredProfileBundles`、版本豁免、`evaluatePluginCompatibility` 全部照旧 ✓）：
  - `Profile` 新增 **`skippedBundles: SkippedBundle[]`** ✓ + 新类型 `SkippedBundle` ✓；
  - `loadProfileDirectory` 的 bundle 装载由"失败即抛"改为**逐个 try/catch：跳过并记录** ✓；
  - 新增并导出 **`reportSkippedBundles(binName, profile)`** ✓，由 `apps/desktop-host/src/index.ts` 在装载 profile 后调用一次 ✓（**这块差异由此关闭** ✓）。
- 语义变更**连同其测试**一起改 ✓（仓规 ✓）：两条断言"坏 bundle 抛错"的用例改为断言"被跳过并记录、兄弟 bundle 仍加载、豁免后恢复加载" ✓。
- 8 处消费方的 `Profile` 字面量补 `skippedBundles: []` ✓（`apps/cli`、`apps/web`、app-boot 的 spec ✓）。
- 验证 ✓：app-boot **23 文件 / 685 用例全绿** ✓；`packages/boot/hmr` + `apps/cli/resolved-profile-boot` **250 用例全绿** ✓；`typecheck` 0 ✓；`casts` 1551 既有 / 0 新增 ✓；桌面 lane **88 文件 / 895 用例全绿** ✓。

**待做（已定位到上游提交 ✓）**：

| 切片 | 上游来源 | 规模 |
|---|---|---|
| 1 改名 + 形状对齐（ProfileResolution* → RuntimeResolution*） | 上游提交 "refactor(boot): rename the profile resolution generation to the runtime resolution" | 跨 app-boot + hmr |
| 3 bundle patch 读取（`readBundlePatches` 一族） | 在 alpha.4 的 `resolver.ts` 中 | 189 行级 |
| 4 链接根与模块文件（`LinkedRoot` / `realModuleFile`） | 同上 | 同上 |
| 5 spec 对齐（`profile-resolution.spec.ts` 等） | alpha.2→alpha.4 共 17 文件 | 201/69/57 行级 |

**方法已确定** ✓：因本仓与上游**无共同祖先**（独立历史 ✓），按**内容**合并 ✓ —— 以上游 alpha.4 为准 ✓，逐处保留本仓自有实现（`legacy-links` 助手族 ✓、`removeLinkProjections` ✓、`republishAlias` 修复 ✓、兼容性前置校验 ✓、HMR 插件替换 ✓）。


## 8. 执行进度续：slice 1（改名 + 形状对齐）已落地

**改名** ✓（六个标识符，跨 20 个文件 ✓ 零残留 ✓）：

| 旧 | 新（= 上游 alpha.4 ✓） |
|---|---|
| `ProfileResolutionGeneration` | `RuntimeResolution` |
| `ProfileResolutionEntry` | `RuntimeResolutionEntry` |
| `ProfileResolutionOptions` | `RuntimeResolutionOptions` |
| `ProfileResolutionBehavior` | `RuntimeInterception` |
| `installProfileResolution` | `installRuntimeInterception` |
| `createProfileResolutionGeneration` | `createRuntimeResolution` |

涉及 `packages/boot/app-boot`、`packages/boot/hmr`、`apps/cli`、`apps/web`、`apps/desktop-host` ✓。

**形状对齐的剩余差异** ✓：改名后 `RuntimeResolution` 与上游只差**一个字段** —— 上游多 `linkedRoots: readonly LinkedRoot[]` ✓（属下面的 slice 4 ✓）。上游已无 `ProfileResolutionMode` ✓（模式概念被拦截取代 ✓，属 slice 3/4 的语义 ✓），本仓暂留 ✓。

**验证**：`typecheck` 0 ✓；`packages/boot/app-boot` + `packages/boot/hmr` **33 文件 / 919 用例全绿** ✓。

**过程教训（已记录）** ✓：给新必填字段补测试夹具时，**不要**用"就近找闭合括号"的启发式批量插入 ✗ —— 它会改坏多行字面量（本轮实测把类型错误从 10 放大到 40 ✗）✓。正确顺序是：**先回退测试文件 → 重跑幂等的改名 → 再逐个精确补** ✓。

**待做**：slice 3（bundle patch 读取 ✓）、slice 4（`LinkedRoot` / `linkedRoots` / `realModuleFile` ✓）、slice 5（spec 对齐 ✓）。


## 9. 执行进度续：slice 4（linkedRoots / LinkedRoot / realModuleFile）已落地

- `RuntimeResolution` 增加 **`linkedRoots: readonly LinkedRoot[]`** ✓ + 新类型 `LinkedRoot` ✓ + `linkedProfileRoots()` ✓（复用本仓既有的 `profileLinkCandidates` ✓，按上游语义：只保留**位于 profiles 树与当前 profile 之外**的链接 ✓、按名字排序 ✓、冻结 ✓）。
- `legacy-links.ts` 新增并导出 **`realModuleFile(path)`** ✓（打包可执行体感知：非 pkg 或链接时走 `realpathSync` ✓，否则解析到包目录相对路径 ✓）；`package-meta.ts` 的 **3 处** `realpathSync(target)` 改用 `realModuleFile(target)` ✓（这正是上游在该提交里的行为改动 ✓）。
- **夹具**逐一精确补齐（9 处 ✓，跨 `plugin-manager`、`hmr`、app-boot 的 4 个 spec ✓）—— 本轮严格按"读清楚再改"执行 ✓，没有再出现上轮的批量改坏 ✓。

**验证**：`typecheck` 0 ✓；app-boot + hmr + plugin-manager **43 文件 / 1152 用例全绿** ✓；`verify-export-jsdoc` 通过 ✓；`casts` 0 新增 ✓；`doc-sync` clean ✓；桌面 lane **88 文件 / 895 用例全绿** ✓。

**剩余**：slice 3（bundle patch 读取一族 ✓）、slice 5（spec 对齐 ✓）。


## 10. 执行进度续：slice 3（bundle patch 一族）已落地

**上游语义**：`bundle.patch` 可以是**单个路径或路径数组**（`bundlePatchFiles` ✓），绝对路径由 `bundlePatchPaths` 解析 ✓，`ProfileLayer` 用 **`patchPaths: readonly string[]`** ✓ 且把每个文件的补丁**按顺序拼接**（`flatMap` ✓）。

**本仓落地**（保留本仓的**双通道**兼容 ✓ —— `qilin.bundle.patch` **或** `dsh.bundle.patch` ✓，这是上游没有的 ✓）：
- `dsh-compat` 新增并导出 **`bundlePatchFilesOf(manifest)`** ✓：读任一通道 ✓、字符串或数组皆可 ✓、非法声明抛出与上游同义的错误 ✓；原有单值 `bundlePatchOf` 保留 ✓（供"是否 bundle"的判断使用 ✓）。
- `ProfileLayer.patchPath: string` → **`patchPaths: readonly string[]`** ✓；`loadProfileDirectory` 改为 `declared.map(join)` + `patchPaths.flatMap(loadOverlayPatches)` ✓。
- 夹具按**编译器驱动**逐处精确转换（12 处 ✓，跨 `apps/cli`、`apps/web`、app-boot 的 5 个 spec ✓）。

**验证**：`typecheck` 0 ✓；app-boot + hmr + plugin-manager + cli **44 文件 / 1168 用例全绿** ✓；`verify-export-jsdoc` 通过 ✓；`casts` 0 新增 ✓；`doc-sync` clean ✓；桌面 lane **88 文件 / 895 用例全绿** ✓。

**过程教训（再次记录）** ✓：批量改写夹具的正则**必须处理"一行两个属性"与"值里含逗号"** ✓ —— 本轮我先用"就近窗口"的启发式 ✗（误伤 `Profile.patchPath`，那是**另一个含义**的字段 ✓），最终改为**由编译器错误列表驱动、逐个定位** ✓ 才收敛 ✓。另外 ${`...`} 模板串让两次 python 因反引号编译失败 ✗ —— 含模板串的锚点应写成脚本文件 ✓。

**剩余**：`readBundlePatches` / `bundlePatchFiles` / `bundlePatchPaths` 的**上游同名导出**（本仓已有等价能力 ✓，缺的是名字与签名 ✓）、以及 slice 5（spec 对齐 ✓）。
