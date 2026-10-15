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
