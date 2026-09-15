# DSH 插件生态兼容 + 用户插件管理 — 设计与实施计划

- 状态：核心实现完成；浏览器成片验收与真实在线安装仍待部署环境执行（2026-09-15）
- 参考：KCoder 桌面版工具-插件管理（/Users/libing/kk_Projects/KCoder desktop/main/plugins.ts + renderer/src/views/plugins.ts）；上游 DSH（/Users/libing/kk_Projects/deepseek-harness）；插件镜像仓 /Users/libing/kk_Projects/dsh-plugins

## 目标

1. **兼容层**：DSH 插件生态的包（dsh-plugins 镜像仓、GitHub `topic:dsh-plugin`、npm 上的 @kkutysllb/* 等）安装进 QiLin profile 后能直接挂载运行——宿主半经 Cordis Loader 装载、客户端半经 `window.__ModuleLoader__` 协议加载。
2. **用户插件管理**：设置页「插件」分区新增「用户插件」tab——已装列表（层序/版本/新版本提示/来源/更新/卸载）+ 社区发现（GitHub topic 搜索）+ 一键安装/升级 + 命令输出面板 + 重启生效提示。

## 生态事实（调研结论）

- DSH 插件包 = 自包含 npm 包：`package.json` 声明 `dsh.bundle.patch`（挂载 patch 文件）与 `dsh.client`（客户端声明）；`exports["./client"]` 指向 CJS 闭包 bundle（`window.__ModuleLoader__.load({id, factory})` 注册协议，与 QiLin 同源）；`cordis.patch.yml` 以 insert 行挂载插件。
- 无中心 catalog：KCoder 社区发现走 GitHub Search API `topic:dsh-plugin`；版本判定 = npm dist-tags `latest` 对比 node_modules 实装版本（不按 semver 范围，避免 0.x 恒显更新）。
- 安装 = profile 目录 `pnpm add <spec>` + 按「包是否声明 bundle manifest」对账层叠数组；卸载 = `pnpm remove` + 双清；变更需重启引擎生效（`composeLive` 复用启动时 bundle 层快照，新层不热挂载——与 KCoder 重启语义一致）。

## 设计

### A. 兼容层（Slice 1）

1. **`@qilin/package-manifest` 新增 `./aliases` 运行时子导出**（`.` 保持 types-only）：
   - `DSH_PLATFORM_MODULE_ALIASES`：DSH 时代平台模块名 → QiLin 种子名（`@deepseek-ai/cordis`→`@qilin/kylin`、`@deepseek-ai/dsh-client-store`→`@qilin/client-store`、`dsh-client-ui-slots`→`client-ui-slots`、`dsh-client-ui-primitives`→`client-ui-primitives`、`dsh-client-ui-dockkit`→`client-ui-dockkit`；裸 `cordis`→`@qilin/kylin`）。
   - `dshCompatModuleId(spec)`：上述精确表 + 前缀规则 `@deepseek-ai/dsh-X`→`@qilin/X`（例外 `dsh-client-runtime`→`client-modules`）；未知名原样返回。
   - `bundlePatchOf(manifest)`：`qilin.bundle.patch ?? dsh.bundle.patch`（单一读取真源）。
   - `clientManifestOf(manifest)`：`qilin.client ?? dsh.client`（形参兼容同一结构）。
2. **app-boot `loadProfileDirectory`**：层叠 patch 声明改用 `bundlePatchOf`（错误消息同时提示两种键）。
3. **client-modules node 半**：manifest 扫描改用 `clientManifestOf`（`dsh.client` 回退，错误消息带键名）；external/inject 名经 `dshCompatModuleId` 规整后入 boot 图（DSH 动态包名 → QiLin 行 id，排序/依赖边成立；静态平台名 → 种子别名，无行）。
4. **client/web 种子表**：`getStaticModules()` 追加 DSH 别名键（同值引用，别名表来自 `@qilin/package-manifest/aliases`，Vite 静态打进 shell）；`PLATFORM_MODULES` 本体不动（构建外置面不变）。
5. **REAL 组合测试**：测试 profile 以本地路径装 `dsh-file-attach`（/Users/libing/kk_Projects/dsh-plugins/dsh-file-attach，零依赖四件套型）→ boot 断言：宿主行挂载、客户端 boot 图含 `@kkutysllb/dsh-file-attach` 行、combo bundle 可取。

### B. 插件管理服务（Slice 2）

1. **reconcile 抽取**：`apps/cli/src/plugin.ts` 的 `reconcilePlugins`/`exportsPatch` 移入 `@qilin/app-boot` 导出（CLI 薄转发），单一真源；`exportsPatch` 改用 `bundlePatchOf`。
2. **launch profile fact**：app-boot 导出 `QILIN_LAUNCH_PROFILE_KEY` + `LaunchProfileSnapshot{name, dir, home, patchReload}`；`profile-boot` boot 回调 provide（仿 `QILIN_LAUNCH_ENVIRONMENT_KEY`）。
3. **新包 `packages/host/plugin-manager`（@qilin/host-plugin-manager）**：TypertRemoteService `pluginManager`（inject `qilin.launchProfile` + loader）：
   - `list()`：profile deps × bundles 层序 × 实装版本（profile 副本优先，其次安装种子）× 来源标记（template=builtin / user）× 权限（内置不可卸载；profile 拥有的内置层可原地升级；随安装实例升级的内置层不可更新）；
   - `checkUpdates(names)`：npm dist-tags（10s 超时失败→null；非 npm spec→null）；
   - `installPlugin(spec)`：`pnpm add <spec>`（cwd=profileDir）+ reconcile，返回输出尾行；
   - `updatePlugin(name)`：profile 拥有的内置层→`pnpm add <name>@latest`；用户层→`pnpm update --latest <name>`；随安装实例升级的内置层拒绝；
   - `uninstallPlugin(name)`：`pnpm remove` + reconcile；内置/模板 bundle 服务端拒绝；
   - 方法名避开客户端 namespace service 自身表面（`install`/`remove` 被保留，见 `isRemoteMethodNameAvailable`）。
   - `catalog(query, page)`：GitHub Search API `topic:dsh-plugin`（5min 缓存）。
   - pnpm 走异步 spawn 捕获输出；网络用 fetch + AbortController。

### C. 客户端 UI（Slice 3）

1. **新包 `packages/client/ui-settings-user-plugins`（@qilin/client-ui-settings-user-plugins）**：inject `['slots','locale','remote','remote.pluginManager']`；注册 `settings.plugins.tab` id `user-plugins`（用户插件）：
   - 已装表：层序 / 名称 / 版本（`x.y.z → a.b.c`）/ 来源（内置|用户安装）/ 操作（更新、卸载——内置禁用）；
   - 社区表：fullName（外链）/说明/star/安装（`github:owner/repo` spec）+ 搜索防抖 + 翻页；
   - 刷新按钮、命令输出面板（尾 80 行）、「重启 QiLin 服务后生效」提示条；文案走本包 locale 字典（verify-client-ui-i18n）。
2. **接线三面**：web-app cordis.patch.yml 两行（host + client）、web-app/package.json 依赖、tsconfig 聚合引用；`api/remotes` 挂 `pluginManagerRemote`。

### D. 文档与验收（Slice 4）

- Agent Note（双语）+ 包 README ×2 + plans 状态更新；gates：typecheck / test:gui / verify-client-packages / verify-client-ui-i18n / doc-sync 相关面；浏览器实测：UI 安装 dsh-file-attach → 重启 → 📎 按钮出现（客户端半挂载）→ 卸载。

## 兼容性分层（如实声明）

- **一级（直接兼容）**：自包含插件（node 内建 + 宿主服务名 + 平台模块 require）——dsh-plugins 仓 11 插件均此型。
- **二级（部分兼容）**：依赖 @deepseek-ai 引擎 npm 包的插件——npm 可装，但运行时与 QiLin 同名服务实现可能漂移（资源 scheme、connection.api 等已知差异），逐插件验证。
- **明确不做**：Electron 专属插件（依赖 preload/desktop bridge）。
