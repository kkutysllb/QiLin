# 桌面端工程面对齐上游 dsh（计划）

日期：2026-10-16 · 目标：**工程面与上游 dsh 一致**——删除 QiLin 自有 `desktop/`，同步上游 `apps/desktop` + `apps/desktop-host`；**保留麒麟自己的商业痕迹**（品牌/图标/主题/商标）。先计划后动代码（[仓规：上游升级 plan-first](docs/cookbook/upgrading-from-upstream.md)）。

## 一、现状与 delta

| | QiLin `desktop/`（自有，OpenKyLin 并入） | 上游 `apps/desktop` + `apps/desktop-host` |
|---|---|---|
| 规模 | ~90 文件（main 12 / package 27 / branding 22 / scripts 16 / tests 10 / docs 8 / renderer 2 / host 1 / release 2） | `apps/desktop` 291 源文件（src 69 / renderer 13 / resources 7 / config 6 / installer 19 / packaging 3 / publishing 6 / **scripts 165** / cli 3）+ 根配置（electron-builder ×2、tsconfig ×3、tsdown）；`apps/desktop-host` src+tests ~15 |
| 宿主启动 | 壳 spawn 宿主子进程，`runProfile` 起 **`qilin`** profile，Node IPC 回 `ready{url,injections}` | `desktop-host` 起 **`desktop`** profile（`loadProfileDirectory('dsh',…)` + `installAnchor`） |
| 承载 scheme | `qilin-app://app/…` | `dsh-app://app/…` |
| 引擎交付 | 自建 `build-runtime-bundle.sh`：HEAD worktree → `qilin-runtime.tar.gz` + `desktop-runtime.json`（sha256 + 按 commit 解压到 `userData/runtime/<commit>/`） | 上游自带：`prepare:runtime` / `prepare:primary-runtime` / `sign:primary-runtime` / `prepare:dsh` / `prepare:packages` + `package-target.ts` 分平台出包 |
| 打包/发布 | `desktop/package/`（electron-builder，electron 固定 44.0.0）+ `desktop-release.yml`（working-directory: desktop；`build-runtime-bundle.sh`→`build-desktop.sh --skip-bundle`→`verify-desktop-artifacts.sh`；产物 `desktop/dist-exe/*`） | `installer/` + `packaging/` + `publishing/` + electron-builder 配置 + 签名/公证（`@electron/notarize`）+ COS 上传 |
| 品牌 | `desktop/branding/`（22 文件：logo/theme/trademarks/icons）+ `verify:branding` + `check:leakage` + `sbom` | `resources/` + `render:tray-icon` + 根 `BRAND_GUIDELINES.md` |

## 二、决策（执行时按此，不再逐条问）

1. **删除自有 `desktop/`**（含 `desktop/staging/qilin-src` 这个 git worktree、`desktop/release/v0.1.*.md`、自建打包链）；其历史留在 git 里，不保留兼容层。
2. **移植上游两包为新 `apps/desktop`、`apps/desktop-host`**，按本仓既有 rescope 规则改写：`@deepseek-ai/dsh-*` → `@qilin-agent/*`、`@deepseek-ai/cordis*` → `@qilin-agent/kylin*`、`dsh` → `qilin`、`DSH_*` → `QILIN_*`、`dsh-app://` → `qilin-app://`（沿用本仓桌面已用的 scheme，保持既有 branding/协议文档一致）。
3. **profile 名对齐上游**：使用 `desktop` profile；随之**解除** CLI 对 `--profile desktop` 的拒绝（[并入说明](.agents/notes/implemented/architecture/2026-10-09-openkylin-desktop-merged-into-qilin.md) 里保留它正是因为"仓内没有消费者"——现在有了）。执行前先确认上游 `desktop` profile 的定义来源（本仓 `packages/bundle/*` 是否已含，缺则一并移植）。
4. **品牌保留麒麟**：`desktop/branding/*`（logo/theme/trademarks/icons）与 `check:leakage`/`verify:branding` 的能力迁到上游的资源/安装器/托盘/关于页注入点；**不做** upstream 品牌替换为 DeepSeek 的任何一步；托盘图标仍由本仓品牌资产渲染。
5. **发布接线改为上游脚本面**：`prepare:runtime`→`prepare:dsh`→`package-target`（分平台）→签名/公证；`.github/workflows/desktop-release.yml` 重写为调用上游脚本，产物路径随上游；仍挂到 QiLin 的 `v*` Release（手动 dispatch）。
6. **版本**：桌面产物版本 = 工作区版本（上游同规则）；不再维护 `openkylin-desktop` 的独立版本线。

## 三、阶段（每阶段可独立验证）

- **P0 前置**：确认上游 `desktop` profile 定义位置与内容；确认新依赖可获得（`koffi`、`@deepseek-ai/libreoffice-kit` 的替代/移植、`@electron/notarize`、`cos-nodejs-sdk-v5`）；列出 `apps/desktop/scripts` 165 个文件中平台专有（windows 安装器/mac 公证）部分，标注本机不可验证项。
- **P1 源码移植**：复制 `apps/desktop/{src,renderer,resources,config,installer,packaging,publishing,scripts,cli}` 与 `apps/desktop-host/{src,tests}` + 根配置；按 rescope 表批量改写；修正随包名/路径变化的引用（`tsconfig`、`tsdown`、electron-builder 配置）。
- **P2 品牌注入**：把麒麟 branding 落到上游注入点（图标/主题/商标/关于页/安装器资源），保留 `check:leakage`/`verify:branding` 等价门禁。
- **P3 引擎装配与发布**：接上游 `prepare:*`/`package-target` 链到本仓（构建本仓 HEAD 的引擎闭包），重写 `desktop-release.yml`；删除 `build-runtime-bundle.sh` 那条链。
- **P4 删除与文档**：删除 `desktop/`（含 worktree）、更新根 `README{,.zh}`、`AGENTS.md` 的 desktop 段与 `.agents/notes`（新增一篇并入/对齐说明）、`docs/rescope.md` 增补新映射。
- **P5 门禁与验证**：`typecheck`、`lint`、`doc-sync`、`hygiene`、`test:gui`，外加 `apps/desktop`/`apps/desktop-host` 自带测试（`pnpm --filter @qilin-agent/desktop test` 等）；产物级验证（`check:package`/`package:dir`）在本机可行的平台上跑一次。

## 四、风险与未决

1. **平台专有**：windows 安装器与 mac 公证/COS 上传无法在本机验证（本机 darwin-arm64，沙箱限制见发布记录）；只能做静态移植 + 就地可跑部分。
2. **office/LaTeX 依赖**：上游 `desktop-host` 依赖 `koffi` + LibreOffice kit；若无对应 QiLin 侧能力，需先确认是否作为可选能力保留（缺则启动应降级而非失败）。
3. **上游 `desktop` profile 是否已在 Q iLin 的 bundle 集合里**：未定，P0 首先回答。
4. **体积**：新桌面源码 ~300 文件 + 165 脚本，属大改；按阶段提交，每阶段过门禁，不一次性落。

## 五、证据（可复现）

```sh
# 上游面
node -e "const p=require('apps/desktop/package.json');console.log(Object.keys(p.scripts))"   # 在 deepseek-harness
find apps/desktop -type f -not -path '*/node_modules/*' | wc -l
sed -n '1,30p' apps/desktop-host/src/index.ts
# 本仓现状
ls desktop; sed -n '1,20p' desktop/main/qilin-contract.mjs
grep -n 'working-directory\|build-runtime-bundle\|verify-desktop-artifacts' .github/workflows/desktop-release.yml
```

## 六、P0 结论（2026-10-16 实测）

移植面的 **33 个上游 specifier** 已逐个核对到本仓包名：

- **可直接映射（19 个）**：`dsh-agent→@qilin-agent/agent`、`dsh-app-boot→boot/app-boot`、`dsh-atomic-write`、`dsh-home-paths`、`dsh-jobs`、`dsh-schedule`、`dsh-skill`、`dsh-skill-office`、`dsh-subprocess-local`、`dsh-tool-workspace-dependencies`、`dsh-workspace`、`dsh-client-*(connection/ui-primitives/ui-theme/settings-general/sidebar-browser/shortcuts)`、`dsh-api-gateway`、`dsh-host-webserver`、`dsh-desktop`/`dsh-desktop-host`（正被移植自身）。
- **改名映射**：`@deepseek-ai/dsh` → `@qilin-agent/cli`；`@deepseek-ai/cordis*` → `@qilin-agent/kylin`（vendor/cordis）+ `@qilin-agent/kylin-plugin-{loader,include}`（vendor/{loader,include}）；`@deepseek-ai/node-addon-system` → `@qilin-agent/node-addon-system-workspace`（native/system）。
- **两个真实缺口**（P1 前必须定）：
  1. `@deepseek-ai/dsh-client-product-analytics`：本仓无对应包。上游桌面 src 用它上报产品事件。决策：**移植该包**（保持工程面一致），或按本仓"不上报"惯例以空实现接入并在计划里记明差异。
  2. `@deepseek-ai/libreoffice-kit`（+ `dsh-skill-office` 已存在）：desktop-host 的 `office-engine`/`office` 依赖它。决策：移植该 kit（体积/平台依赖需评估），或把 office 能力降级为"缺失即禁用"（本仓已有 `skill-office`，需确认其运行时装依赖）。
- **按边界排除（不是缺口）**：`@deepseek-ai/dsh-deepseek-account` 属 `deepseek-account` 栈，**永不移植**（[边界说明](.agents/notes/implemented/architecture/2026-09-25-desktop-and-account-alignment-boundaries.md)）；上游桌面 src 的 account-backend 相关代码在移植时删除，账号面继续走 `ui-account` 的 `/api/auth`。
- **`dsh-desktop-runtime`**：上游仓内**没有**该包（find 无结果、两包 package.json 未引用）→ 它是 `prepare:*` 管线**生成**的运行时包名，不是要移植的源码。本仓对应物即 P3 的引擎闭包准备步骤。
- **`desktop` profile**：上游 `packages/bundle/*` 里**没有** desktop bundle，profile 由产品安装目录解析（`loadProfileDirectory('dsh', projectDir, installAnchor)`）；`profileContext.name === 'desktop'` 只用于 `base` 补丁里的 `desktopPlatform` 判断。故本仓需要**自带一个 desktop profile**（P1 建 `packages/bundle/desktop`，内容 = base + web-app + 桌面所需 extras），并解除 CLI 对 `--profile desktop` 的拒绝。
- **平台专有**：`apps/desktop/config/{macos-packaging,windows-packaging}` 与 `scripts/` 里的 cos/notarytool/macos-*/windows-* 共约 20+ 文件属签名/公证/上传链，本机（darwin-arm64、无凭据）**只能静态移植**，运行验证留给 CI 或手工 dispatch。

```sh
# 复现 P0 的映射核对
node -e '…遍历 packages/*/*/package.json 取 name，与上游 specifier 求交集…'   # 见本次会话记录
ls vendor; ls apps/cli/package.json; ls native/system/package.json
find /path/to/deepseek-harness -name package.json -path '*desktop-runtime*'   # 空
```

### P1 进度（2026-10-16，第一个 chunk：`apps/desktop-host`）

已落地（**尚未接入工作区构建**，故不改变现有门禁）：

- 从上游复制 15 个文件 → `apps/desktop-host/{src,tests,package.json,tsconfig.json,tsdown.config.ts}`，按 rescope 规则改写 10 个文件：`@deepseek-ai/dsh-*`→`@qilin-agent/*`、`@deepseek-ai/dsh`→`@qilin-agent/cli`、`@deepseek-ai/cordis*`→`@qilin-agent/kylin*`、标识列表 `'dsh'`→`'qilin'`、`DSH_DESKTOP_NODE_EXECUTABLE`→`QILIN_DESKTOP_NODE_EXECUTABLE`、安装锚 `@deepseek-ai/dsh`→`@qilin-agent/cli`。
- **边界排除**：删除 `src/platform-session.ts` 与其 spec（`deepseek-account` 栈永不移植）；`index.ts` 去掉账号 publisher 与账号类型导入。
- **office 缺口隔离**：`office.ts`/`office-engine.ts` 及两个 spec 暂不纳入（依赖 `@deepseek-ai/libreoffice-kit`，本仓暂无），`index.ts`/`cli.ts` 中的 office 装配与 engine 解析一并移除；待 office chunk 处理。
- tsconfig 的 13 条 project reference 中 12 条在本仓**路径直接命中**（`vendor/cordis`、`packages/core/agent`、`jobs`、`schedule`、`workspace`、`util/home-paths`、`skill/tool-workspace-dependencies`、`../cli`、`packages/boot/app-boot`、`packages/client/connection`、`packages/host/webserver`），仅账号栈一条不存在并已删除。

**本 chunk 暴露的必做前置（P1 下一块）**：

1. **抽取 `profile-boot` 成包**：上游 `@deepseek-ai/dsh/profile-boot` 是独立包，本仓的 `runProfile` 还在 `apps/cli/src/profile-boot.ts`（app 内模块，跨包不可导入）。移植的宿主必须能 import 它 → 建 `packages/boot/profile-boot`（从 `apps/cli/src/profile-boot.ts` 抽出 `runProfile` 及其依赖），`apps/cli` 改为消费该包。这也是"工程面与 dsh 一致"的直接一环。
2. **office 缺口决策**：移植 `libreoffice-kit`（含 `-darwin-arm64`/`-wasm` 平台包）或把 office 能力降级为可选（本仓已有 `skill/skill-office`，需确认其运行时装依赖路径）。
3. **接入工作区**：`pnpm-workspace.yaml`（`apps/*` 是否已覆盖）、`tsconfig.host.json` 的面配置、`pnpm install` 链接、以及 `apps/desktop-host` 自己的 vitest 运行方式。

### P1 第二块：把 `apps/desktop-host` 接进工作区（2026-10-16）

**更正上一块的两条判断（实测推翻）**：

- ~~需要抽取 `profile-boot` 成包~~ **不成立**：上游的 `@deepseek-ai/dsh/profile-boot` 是 **CLI 包的子路径导出**（`apps/cli/package.json` 的 `exports['./profile-boot']` → `lib/profile-boot.js` + `lib/types/profile-boot.d.ts`），本仓**已有同形导出**，`@qilin-agent/cli/profile-boot` 直接可用，无需重构。
- 上游 `@deepseek-ai/dsh-desktop-runtime` 仍确认**不是源码包**（`prepare:*` 管线生成），本仓对应物是 P3 的运行时准备步骤。

**本块改动**：

- `tsconfig.host.json` 的 references 增加 `{ "path": "./apps/desktop-host" }`；`pnpm install`（需 `--no-frozen-lockfile`，锁文件随新包更新）链接工作区。
- CLI 包新增**类型化子路径** `./bin`（`{ types: ./lib/types/bin.d.ts, default: ./lib/bin.js }`），移植的宿主据此 import `runCli`（上游走的是无类型的 `@deepseek-ai/dsh/lib/bin.js`）。
- 实测通过：`npx tsc -b apps/desktop-host/tsconfig.json`（0 错误）、`tsdown` 打包 ✓、`vitest run apps/desktop-host/tests/quit-inspection.spec.ts` **9 passed** ✓、`verify-package-dependencies` ✓、`verify-export-jsdoc` ✓。

**本仓与上游的两处能力差（记录为对齐待办，代码按"缺失即降级"处理）**：

1. **`reportSkippedBundles`**：上游 `app-boot` 的 profile 带 `skippedBundles` 并在启动时把跳过的 bundle 打到 stderr；本仓的 `Profile` **没有该成员** → 宿主删掉这次上报（回归类型错误已消失）。待办：把 skipped-bundle 记录能力并入本仓 profile 装载。
2. **`runCli` 的桌面参数**：上游 `runCli({ manageDesktopProfile: true, packageManager: {...} })` 让桌面用自带的 pnpm 管理 profile；本仓 `runCli()` **不接受参数** → `runDesktopCli()` 退化为直接调用入口（JSDoc 已注明该差异）。待办：决定是否把桌面包管理器选项并入 CLI。

### P1 第三块：`client-product-analytics` 类型面移植 + `apps/desktop` 主体parking（2026-10-16）

**已提交的部分 —— `packages/client/product-analytics`（类型面）**

- 上游该包是「宿主插件 + Typert 远程面 + locale + 环境采样」，依赖 `@deepseek-ai/dsh-host-product-telemetry-otel`（本仓无）与账号栈（边界排除）→ 按"缺失即降级"**只移植事件映射**：`src/events.ts`（`ProductEventMap`/`ProductEvent`）+ `src/index.ts` 类型 barrel，`exports` 提供 `.` 与 `./types` 两个类型入口。
- 依赖声明按 client 规则：`session`/`llm`/`kylin` 仅 dev（类型导入）+ kylin 同时 peer ✓；`tsconfig.base.json` 增两条手写别名（该包名与目录名不同，生成器无法自动映射 ✓）。
- 文档按包 README 骨架重写（frontmatter `kind: package-reference`、Summary/Table of Contents/Dev Note、ME + KLN 收尾、双语配对重录 ✓），并在 `verify-package-readme-model-experience` 的审计表里登记"无模型影响"的判据 ✓。
- **验证**：`pnpm run doc-sync` **status=0** ✓、`pnpm run verify-tsconfig-paths` ✓（别名已当前）、`verify-no-unknown-casts` ✓、`verify-package-dependencies` ✓。

**未提交的部分 —— `apps/desktop` 主体（108 文件）暂存仓外**

- 已复制并按既有 rescope 规则改写 44 个文件（作用域 33 条映射 + 标识 `dsh→qilin`/`DSH→QILIN`/`dsh-app://→qilin-app://`）✓；但**上游的 README/资源/打包面尚未适配本仓门禁**（README 骨架、Model Experience、catalog 条目、tsconfig 面引用等），若现在入库会让 `doc-sync` 变红。
- 故暂存于 **`/tmp/desktop-parked-2026-10-16/desktop`**（源真相是上游仓 ✓，rescope 规则已记于本节 ✓），下一轮按块引入并逐块过门禁。
- 依赖清点结论：桌面包保留 5 个 runtime dep + 29→24 个 dev dep；**打包专用依赖**（`electron-winstaller`/`electron-builder`/`app-builder-lib`/`@electron/notarize`/cos/`electron`）按计划推迟到 P3；`electron-winstaller` 的未批准构建脚本会直接让 `pnpm install`(CI) 失败，故此时不能入库。
- 上游两处 `as unknown`（`src/main.ts`、`src/runtime-tree.ts`）已按其指纹登记进 unknown-cast baseline ✓（真身随 P1 后续块入库时复用该记录）。

### P1 第四块（本轮结论）：着陆新包时必须先过的门禁清单（血泪版）

本轮把 `client-product-analytics` 的类型面与 `apps/desktop` 主体都做到"可编译但未过文档门禁"的程度，最终**两者都暂存仓外**以保持工作树全绿（`doc-sync` status=0 ✓）。下一轮直接按下表着陆，可省掉反复试错：

**A. 新包的宿主位置**
- **纯类型包不能放在 `packages/client/` 下**：`verify-client-packages` 要求该目录下每个包声明客户端模式（`qilin.client` 或 `staticLinked` preset）✗；本包是类型契约 ✓ → 归宿是目录外（本轮试过 `packages/api/product-analytics` ✓，包名保持 `@qilin-agent/client-product-analytics` 以便桌面 import ✓）。
- **`gen-third-party-notices` 的硬约束**：任何声明了 `qilin.client` 的包，其 `tsdown.config.ts` 必须导出 `name: '<包名>/client'` 的构建配置 ✗，否则整个 notices 生成失败（并让 pre-commit 的 third-party 钩子失败 ✗）。
- 包名与目录名不同时，`tsconfig.base.json` 需要**手写别名**（`gen-tsconfig-paths --check` 会指名要求 ✓）。

**B. 包 README 的骨架（`scripts/doc-standard.spec.ts` + 三个 verifier 强校验）**
1. frontmatter：`description` + `kind: "package-reference"`（`package-library` 会被拒 ✗）。
2. 结构：`# <包名>` → 语言行 → `## Summary`（或 zh 的 `## 概述`）→ `## Table of Contents`（zh `## 目录`，条目锚点需真实存在 ✓）→ `----- `→ 各节 → **`## Dev Note`（zh 必须叫 `## 开发备注`）**。
3. **`## Model Experience` 与 `## Known Limitations and Deferred Work` 必须是最后两个 H2，且顺序固定**；两者之间不要插入自定义锚点行 ✗（`<a id="model-experience"></a>` 会被 markdown wrap 门禁与 ME 门禁同时点名 ✗）；ME 段格式固定为「一句以 `None, as ` 开头、句号结尾 + `#### KV Cache effect` + 一段非空段落」；短式还需在 `scripts/verify-package-readme-model-experience.ts` 的 `SENTENCE_MODEL_EXPERIENCE` 里登记审计理由 ✓。
4. README 里的 ```ts 代码块会被 `doc-typecheck` 编译 ✗ → 跨包 import 的示例要么保证目标在文档工程内，要么不要写代码块 ✓。

**C. 本轮的实际产物（都在仓外，可随时取回）**
- `/tmp/desktop-parked-2026-10-16/desktop`：`apps/desktop` 主体 108 文件（已 rescope ✓；打包专用 devDeps 已按 P3 撤下 ✓；两处上游 `as unknown` 的基线指纹见 上一提交 之前的会话记录 ✓）。
- `/tmp/desktop-parked-2026-10-16/product-analytics`：类型面包（已过 `verify-client-packages` ✓ 与自身 `tsc -b` ✓，README 已按骨架重写 ✓）。
- 依据仍是上游仓（真相来源 ✓）+ 本文的 rescope 规则 ✓。

### P1 第五块：`apps/desktop` 实际编译与适配清单（2026-10-16，本轮实测）

**错误收敛过程（每次都实测 ✓）**：恢复后首次 `tsc -b` ~300 错（几乎全是 project reference 路径 ✓）→ 修引用后 **33 错**（模块解析问题 100% 来自账号栈：`@qilin-agent/account`/`account/types` 10 处 + `api-gateway/stream-protocol` 1 处 ✓）→ 按边界剔除账号/欢迎栈后 **47 错**（16 个隐式 any + 9 个指向被删文件的 import + 8 个缺失导出 + 6 个 TS7016 + 4 个 TS2339 + 3 个 TS18048 ✓）。

**已确认的真因与修法（下一轮直接用）**：

| 现象 | 真因 | 修法 |
|---|---|---|
| `Cannot find module 'electron'` | 我在上一轮把 `electron` 当打包依赖撤了 ✗ | `electron: ^44.7.0` 必须作为 **devDependency** 存在（打包工具链如 `electron-winstaller` 才可继续推迟 ✓） |
| `Cannot find module '@qilin-agent/client-ui-shortcuts'` | 上游名 `dsh-client-shortcuts` 映射错 | 本仓实名 **`@qilin-agent/client-shortcuts`**（其 `./protocol` 子路径存在 ✓） |
| `@qilin-agent/client-ui-sidebar-browser/types` | 该包只有 `.` 与 `./client` | 改 import 为 **`/client`** |
| `@qilin-agent/api-gateway/stream-protocol` | 该包只有 `.`/`./client`/`./types` | **只有 `account-backend.ts` 用它** ✓ → 随账号栈一起剔除，无需解析 |
| `Referenced project … must have "composite": true` | 我引用的是包的 **solution** `tsconfig.json`（`files: []` ✗） | 一律引用 **`tsconfig.host.json`** 这类真实 project ✓ |
| 源目录里冒出 `.js/.d.ts` | `tsc -b` 在被引用的 project 上按 desktop 的 emit 选项写回了 src ✗ | 清理并避免；后续给 desktop 的 face 加 `noEmit`/仅类型检查的用法 |

**剩余待适配面（精确清单 ✓）**：

- 需**移除**（账号/欢迎栈，边界排除 ✓）：`account-backend.ts`、`welcome-api.ts`、`welcome-backend.ts`、`welcome-window.ts`、`preload-welcome.ts`、`platform-view.ts`、`mandatory-update-policy.ts`（已删 ✓）。
- 需**改写**（仍在引用被删模块 ✓）：`main.ts`（21 错）、`mandatory-update-window.ts`、`client/WelcomePage.tsx`（7 错）、`client/welcome.tsx`（4 错）。
- 需**类型适配**：`RuntimeResources.dsh`（本仓该类型无 `dsh` 字段 ✗）、`preload-browser.ts`（6 错）、`browser-guests.ts`（3 错）、`project-manager.ts`（2 错）、`host-process.ts`（2 错）。
- **策略**（沿用既有边界 ✓）：账号/欢迎面在本仓由 `ui-account` 的 `/api/auth` 承担 ✓，桌面的 welcome 流程改为消费本仓账号缝或降级为直连工作区；不移植 `deepseek-account` 栈 ✓。

**暂存位置**（可随时取回 ✓）：`/tmp/desktop-parked-2026-10-16/desktop-adapted`（= 已 rescope + 已修引用 + 已剔除账号栈的版本 ✓）。

### P1 第六块：账号/欢迎面的适配方式与残留清单（2026-10-16 实测）

上游桌面把 account / welcome / mandatory-update / browser-guests 四套面深度织进 main.ts（1300+ 行）：platformView 6 处、welcomeWindow 贯穿对话框选择（currentDialogWindow）、policy 状态与 IPC 注册各数十处。按既有边界（账号栈永不移植）这些面都要去掉或替换。

**实测的适配代价与方式**

- 把 platform-view.ts 换成"本仓侧同 API 替身"时，错误数 46 → 60：替身必须**按调用点**（open(owner, page, bounds)、PLATFORM_IPC 的载荷类型）写，而不是照上游签名写。
- 结论：这四个面的替身/拆除应以**调用点**为规格逐个收敛（编译器驱动），估计 3–6 轮。

**残留错误清单（按文件）**

| 文件 | 错数 | 处置 |
|---|---|---|
| main.ts | 43 | 拆除四套面的接线（导入 + 调用点） |
| preload-browser.ts | 6 | 随 browser-guests 面拆除 DesktopBrowser* 类型与隐式 any |
| keyboard.ts | 2 | 同上（lease id） |
| project-manager.ts | 2 | 待看（多半是隐式 any） |
| host-process.ts | 2 | PlatformSession（账号类型）→ 随面拆除 |
| preload-app.ts | 1 | 引用被删的 preload-mandatory-overlay → 拆 |
| client-metadata.ts | 1 | 替身字段过窄，需补真实字段（version/channel） |
| tsconfig.host.json / tsconfig.client.json | 各 1 | 引用路径 |

**下一轮开工的两件事**

1. client-metadata.ts 的类型补真实字段；
2. host-process.ts 的 PlatformSession、ipc.ts/keyboard.ts/preload-browser.ts 的 DesktopBrowser* 一并拆除（不补类型）。

### P1 第七块：替身必须携带真实类型层（2026-10-16 实测）

本轮按"编译器点名"的方式补齐惰性替身，得到的关键规律：

- 用**宽松签名**（constructor(...args: unknown[])、get state(): unknown）替换上游模块时，错误数会**先降后升**：46 → 32（拆掉账号面）→ 66（宽松替身）→ 59（补成员后）✗，因为 main.ts 依赖原始成员的**具体类型**（mandatoryPolicy.state 当对象用、accountBackend 当函数用、WelcomeAuthentication 的形状、PlatformBounds 的实参类型 ✓）。
- 结论：替身必须**携带原始模块的类型层**（interface/type 逐字保留 ✓）而只把**实现**改为惰性 ✓；逐字照抄类型是可行的（原始文件就在暂存目录里 ✓），但其中若引用了账号包的类型，需要就地替换为本仓等价物 ✓。

**当前的适配状态（未入库 ✓，临时位于 apps/desktop ✓ 并已另存 /tmp/desktop-parked-2026-10-16/desktop-seams）**：

| 项 | 状态 |
|---|---|
| 项目引用 / 子路径 / 包名 / runtime 字段(resources.qilin, runtime.qilin) / 客户端元数据字段 / preload-browser 与账号面剔除 | 已修 ✓ |
| 七个替身模块（platform-view、welcome-api、welcome-window、welcome-backend、mandatory-update-policy、mandatory-update-window、policy-test-auth、browser-guests） | 已建 ✓，但类型层需按原始文件照抄 ✗ |
| 残留错误 | 59 条，全部在 main.ts 与替身的类型面 ✓（无模块解析问题 ✓） |

**下一轮的做法**：从暂存目录取出原始模块 ✓，逐字保留其 interface/type 导出 ✓（账号类型就地替换 ✓），实现体换成惰性 ✓，然后按编译器收敛到 0 ✓ —— 之后再走新包着陆门禁清单入库 ✓。

### P3 续：上游测试套件已移植 + 两处特权 scheme 缺陷修复（2026-10-16）

**补齐的上游面**（文件清单与上游逐项对比后的缺口 ✓）：`apps/desktop/tests` **254 文件**、`windows-signing/` 3 文件、`.env.{macos,windows}.example`、以及上一轮按边界排除的 6 个 preload/window 文件（`preload-browser.ts`、`preload-mandatory*.ts`、`preload-welcome.ts`、`client/welcome.tsx`、`client/WelcomePage.tsx`）✓ → `apps/desktop` 达 **604 文件**（上游 560 ✓，多出的是品牌资产与两个接缝文件）。

**跑测试抓到的真缺陷（不是测试问题，是代码问题 ✓）**：

- `src/ipc.ts` 的 `SCHEME = 'dsh-app'`：我此前的"上游痕迹归零"检查只匹配 `dsh-app://` 形式 ✗，漏掉裸字符串 ✗ → 特权协议 scheme 与文档/注册值不一致 ✓（`assertDesktopSender` 会拒绝所有应用页面 IPC ✓）。修成 `qilin-app` ✓，`keyboard.spec.ts` 由 **0/38 → 38/38 通过** ✓。
- `src/microphone-permissions.ts` 的 `parsed.protocol === 'dsh-app:'`（带冒号形式 ✓，同样是安全门禁字符串 ✓）→ 一并修复 ✓，此后 `apps/desktop`/`apps/desktop-host` 内 **`dsh-app` 零残留** ✓。

**上游测试套件的现状（分三类，按证据 ✓）**：

1. **通过** ✓：纯单元面（locale、runtime-tree、ipc、paths、settings、tray、menu、keyboard、microphone-permissions 等 ✓）。
2. **按设计不可能通过** ✗：断言账号栈/欢迎流程/强制更新策略/浏览器访客/平台视图**真实行为**的 spec（`account-backend`、`welcome-*`、`mandatory-update-*`、`policy-test-auth`、`platform-view`、`preload-app`、`host-process` 的 platform-session 部分 ✓）——这些面在本仓是**惰性接缝** ✓（边界政策 ✓）。
3. **本机环境不可满足** ✗：Windows 签名/打包、macOS 公证/运行时、COS 上传、GitHub App token、pnpm 子进程 e2e（`windows-*`、`macos-*`、`*-cos`、`installed-update-*`、`prepare-*`、`development-*`、`project-manager` 等 ✓）。

**门禁影响**：无 ✓。`test:gui` = `vitest run packages/client packages/host` ✓，桌面套件不在任何聚合门禁内 ✓（与上游一致 ✓）；其状态属信息性 ✓，按上表分类跟进 ✓。
