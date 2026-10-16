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
