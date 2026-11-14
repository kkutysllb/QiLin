# 交接单：编码模式改名 / UI 批次 / V6 办公 / 设置页改版

日期：2026-11-14
仓库：`/Users/libing/kk_Projects/QiLin`（QiLin monorepo，pnpm workspace）
状态：**94 个提交未推送**；工作树干净；无未提交改动

## 1. 先看这几处，能快速建立上下文

- `plans/2026-11-14-coding-mode-rename.md` —— ptc → coding 改名计划与落地方案（含保留词汇的裁决）
- `plans/2026-11-14-v5-coding-mainline.md` / `…-progress.md` —— 编码模式主线切片与执行账本
- `plans/2026-11-14-v6-office.md` —— 通用办公批次（office-read / office_read，S1–S4 已落地）
- `plans/2026-11-14-release-notes-3.1.12.md` —— 发布说明草稿（**未发布**）
- `design/settings-redesign/variant-{a,b,c}.html` + 同名 PNG —— 设置页设计稿（用户已选 C）

## 2. 已交付（全部有门禁证据）

| 批次 | 内容 |
|---|---|
| V5 编码主线 | 工作树移除、变更范围（本次提交 / 上一轮）、行内未知工作树图标、终端分块重试、输入框 hold、聊天自动加载与继续生成、重试排队 |
| 侧栏 | 项目按「编码项目 / 普通项目」分区、可折叠、字号层次修复 |
| UI 刷新 | v0 令牌与密度、v1 三面迁移、24 网格图标集、响应式三处修复 |
| 改名 | 预置 id `ptc`→`coding`（保留只读别名）、四个运行层包改名、`ctx.codingRuntime`、`mode: 'native' \| 'coding'`、`demo:coding`、残留词汇收口 |
| 会话格式 | `SESSION_FORMAT_VERSION` 7→8，新增 `session-format-v7-to-v8` 边界包，归档 v7 引用（v0–v8 全部通过 `verify-persistence-formats`） |
| V6 通用办公 | `packages/document/office-read`（只读解析 DOCX/XLSX/PPTX，14 测试）、`packages/document/tool-office-read`（`office_read` 工具，8 单测 + 1 条 Loader 真实组合测试）、接入标准/编码预置、`readOfficeMetadata` |
| V7 静态审计 | `typecheck` 双面干净、`lint` 0/0、`hygiene` 22/22、`duplication` 0.07%（26 个既有克隆） |
| 设置页 | 删除页眉「打开配置文件」与关闭按钮（关闭路径保留遮罩 / Escape / 返回工作区）；按设计稿 C 改为分组卡片 + 通栏横条 |
| 侧栏 | 「新会话」由大按钮改为面板列表里的通用菜单项（带图标、快捷键提示） |

## 3. 未完成 / 需要接手的事

1. **发布**：用户裁决「等其余计划完成后再发布」，版本暂定 **3.1.12（patch）**。发布时要：
   - 推送 94 个提交 → `pnpm run build` → 打 tag → `gh release create --notes-file`（用发布说明草稿去掉草稿头）→ `pnpm run release:verify-published`；
   - `docs/persistence-changes/historical-formats/v7.md`（+zh）里 `source: tag: qilin-v3.2.0` 是占位，**必须改成实际使用的 tag**，否则是假引用。
2. **两个未解决的运行时错误**（见第 4 节）。
3. **V6 剩余**：预览转换缓存改用解析器元数据做键，需要新增 Host↔Client 远程方法（Typert 契约 + 代码生成门禁），本次刻意未做，已在计划与 README 记录。
4. **保留词汇**（有意为之，不要顺手改）：`tool/ptc-dispatch*` 事件类型与 `tools/ptc-dispatch-log` 扩展点（持久化/扩展词汇，改名要再进位一次会话格式）；`.agents/notes/**` 历史记录正文与文件名（只更新了指向已移动文件的链接）。
5. **V7 收口的剩余两项**：视觉规格文档定稿、release notes 定稿（草稿已写）。

## 4. 两个未解决错误（优先排查）

### 4.1 现象

- 右侧「变更请求」面板显示 `无法加载变更请求面板 / 重试`；
- 文档预览（如 `release/audit-v1.0.0.md`）显示 `读取失败：client api: workspaceFiles/read failed: Failed to fetch`；
- 终端 `pnpm qilin web` 打印 `qilin tenants: http://127.0.0.1:8790/` 后，控制台有 **一条 404**（用户未提供该 URL）。
- 用户重启 dev 后依旧复现。

### 4.2 已排除的

- 宿主能正常启动：我用 `QILIN_HOME=/tmp/… pnpm qilin web --port 8793` 起过，`/`=200、`/workspace`=200、`/api` 路由存在（无凭据 401）；
- 客户端构建记录有效：`.qilin-build/client-build-environment.json` 与当前 433 个 artifact 一致（`readClientBuildRecord` 校验通过）；
- 不是 forge 面板逻辑缺陷：`无法加载变更请求面板` 只出现在 `snapshot.disconnected` 分支（`ChangesTab.tsx`），是**连接断开**提示。

### 4.3 代码路径（下一步从这里查）

- 客户端 RPC 寻址：`packages/client/connection/src/client/rpc.ts` → `resolveBase()` 用 `location.origin`；页面若是 `file://` 会退到 `http://qilin.internal`，依赖桌面壳注入的 fetch 拦截器。
- 失败包装：`packages/api/gateway/src/client/index.ts:839`（`client api: <endpoint> failed: <cause>`），`Failed to fetch` 来自浏览器 fetch 拒绝。
- 文档预览读取：`packages/client/ui-sidebar-documentpreview/src/client/rpc.ts`。

### 4.4 建议的下一步

1. 让用户提供 DevTools Network 里那条 **404 的完整 URL**（或失败请求的 `net::ERR_*`），这是唯一能定性的证据；
2. 若 URL 是 `/plugins/.../lib/client.js`：客户端产物与插件清单不一致，检查 `.qilin-build/client-build-environment.json` 与各包 `lib/client.js` 的时间戳/哈希，必要时 `pnpm run clean && pnpm install && pnpm run build` 后重启；
3. 若 URL 是 `/api/...`：查 `host-webserver` 路由与鉴权（cookie/token 代际），以及 `resolveBase()` 的 origin 与宿主监听地址是否一致；
4. 先在**无痕窗口**复测，排除旧模块图缓存（我这边无法登录，未能复现）。

## 5. 设置页设计（本轮踩坑记录）

- 设计稿在 `design/settings-redesign/`，用户选 **C：分组双栏卡片**；当前实现：`packages/client/ui-settings-general/src/client/GeneralSection.tsx` + `GeneralSection.module.css`。
- 分组由外壳持有：`SECTION_OF` 把已知条目 id 映射到 security / appearance / interaction / about，未知 id 落入「其他」；**排序用注册 `order`，不要按 id 字母序**（上一版因此把「显示代码工作视图」排到「权限」前面）。
- 布局：上半部分两列（`columns` 列布局），「版本与关于」「其他」为通栏横条（`bars`）——这是用户明确要求的，别改回统一两列。
- 外观行（ui-theme `AppearanceRow`）是分段控件，标签在左、控件右对齐；语言行同理。
- 前两次尝试（"单页规格表"、"磁贴仪表板"）被用户否决并已回退，不要重复。

## 6. 环境与门禁（本机）

- 已装依赖与构建产物；客户端改动后必须 `pnpm run build`（记录 433 个 artifact），宿主从源码跑、客户端从 `lib/` 读。
- 常用门禁：`pnpm run test:gui`（客户端+host，717 文件 / 10856 通过）、`pnpm run test:docs`（21/21）、`npx tsc -b tsconfig.host.json`、`npx tsc -b tsconfig.client.json`、`pnpm run lint`、`pnpm run hygiene`、`pnpm run duplication`。
- **已知环境失败（不是回归）**：本机会话沙箱禁止在 `$HOME` 下建临时目录/写配置，`coding-runtime`、`workflow-coding`、`tool-fs`、`client-ui-forge` 的沙箱用例会以 `EPERM: mkdtemp` 或 `sandbox-exec: sandbox_apply: Operation not permitted` 失败；跑宿主时可用 `QILIN_HOME=/tmp/qi-home TMPDIR=/tmp` 规避。
- 账号边界：Web 入口 `/workspace` 需要登录，我无法在本环境内复现用户的已登录界面。

## 7. 给接手人的三条建议

1. **不要再无证据改 UI**：所有视觉问题以用户截图为准，改动前先看截图、改后请用户回截图；仓库里有 Playwright（`apps/web/node_modules/playwright`），但本环境登录不了，只能本机用真实账号截。
2. **改动顺序**：先跑 `pnpm run test:gui` + 两套 `tsc`，再 `pnpm run build`（否则浏览器读到旧产物，会被误判成 bug）。
3. **遇到 404 / Failed to fetch**：先区分「产物缺失」「路由缺失」「连接断开」三类，再动手；这三类症状在当前代码里长得几乎一样。
