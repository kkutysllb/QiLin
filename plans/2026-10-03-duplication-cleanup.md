# duplication 清零轮（2026-10-03）

主 CI 的 `check:ci:lint:contracts-ready` 是 lint + duplication 两条。lint 已在上一轮清零，duplication（`jscpd --config .jscpd.json packages scripts`）留下 **18 处克隆**，即本轮对象；同一份配置在上游是 0，说明这不是配置差异而是本仓特有的存量。

## 一、口径与复现

- 复现：`npx jscpd --config .jscpd.json packages scripts` → `Found 18 clones`（2370 文件；mild 模式，minTokens 60 / minLines 6，`**/tests/**` 已排除）。
- 分布：宿主侧 6 处（workspace-git、plugin-manager、fs-local ×2、preview-media、accounts-local、run-gates 里的宿主车道列表），客户端 12 处（client-modules、ui-primitives icons、ui-open-in-app、ui-sidebar-{files,documentpreview}、ui-sidebar-tasks、client-ui-agent-team ×3、tool-bash↔tool-pwsh background ×2、client/connection fixture 与 workspace-controller 的帧类型）。
- 判据：能抽真实现的抽实现；两处属于**已记录的刻意重复**，按仓库既有的 `/* jscpd:ignore-start */` 约定补标记并写明理由，不用标记掩盖可抽的重复。

## 二、抽掉实现（15 处）

宿主侧：

- `workspace-git`：`diff` 与 `commitDiff` 各有一份「超 maxDiffBytes」报错块，只差 diff/patch 一个词 → `tooLarge(run, noun)`。
- `plugin-manager`：`github-connection.ts` 把 `install-spec.ts` 的 `GIT_SHORTHAND_HOSTS` + `gitHost()` 抄了一份，而 `ParsedInstallSpec` 的 git 分支本来就带 `host` → 删副本改读 `spec.host`。
- `fs-local`：`writeText` / `writeBytes` 的写前状态检查（非常规文件、版本期望、createIfAbsent）与「原子替换后重新 probe」各留两份 → `writePrecondition()` / `replaceTarget()`。
- `preview-media`：GET/HEAD 与 PUT 两个路由各自解析一次 `sessionId`/`path` 并解析到同一 target → `resolveMediaTarget(ctx, url)`；两路由后续各自的读窗口、范围校验、containment 写仍留在路由里。
- `accounts-local`：首启 setup 与 register 逐字重复「admission → readSignUp → acceptSignUp」三段链 → `acceptedSignUp(request)`。
- `scripts/run-gates.ts`：CI 车道与 hygiene 车道的 Client 静态门禁列表（7 条）逐字相同 → `clientStaticGates()`。

客户端：

- `client-modules`：每个 client 声明只留一份 `parseQilinClient`。`client/manifest.ts` 那份早已声明「节点半与 roster 生成器共用」，但只认 `qilin.client`，于是 `src/index.ts` 私藏了一份带 `key` 的同体副本 → 导出签名补 `key`、删私有副本，`exactPackageSpecifier` 一并改走导出（其私有副本当时只有 5 行、未达阈值，但同属一类）。改动 `@qilin/client-modules/client` 的导出签名，唯一外部调用点 `test-support/client-runtime` 的 roster 传 `'qilin.client'`。
- `ui-primitives`：`fileSizeText` 已在，但 `ui-sidebar-files` 与 `ui-sidebar-documentpreview` 各手写了一份 `humanBytes`（空格分隔、整单位取整，与紧凑式不同且可见文案已被 `failure-line.client.spec.ts` 钉住）→ 以 `fileSizeRoundedText` 落到同一模块复用，两份文案不变；icons 里 question/info 两个 14px 图标共用同一段环形路径 → `RING_OUTLINE_14_PATH`。
- `ui-sidebar-tasks`：tab 徽标与页面主体各写一遍「读 projections/summaries、读本会话 jobs、watchRows 订阅、derive catalogs」→ `useWorkSources()`；同时把逐字重复的 `hooks.jobs` 注入面收敛到 `face.ts` 的 `TasksJobsFace`。
- `client-ui-agent-team`：成员行的实时事实（模型、状态、是否当前会话）→ `useMemberFacts()`；动作卡与页面板共用的卡片标题行与任务事实 → `TaskCardParts.tsx`。两个界面各自持有 CSS 模块、同名类的样式并不一致（`.taskState`、`.warning`、`.meta`、`.taskDescription` 都不同），所以共享部件按「传入本界面的 class map」取样式，不把一方模块引到另一方。

## 三、补标记的三处（既定重复）

- `tool-pwsh/src/background.ts`：与 `tool-bash` 同体，只差渲染函数名。[pwsh-tool-bash-parity](../.agents/notes/implemented/feature/2026-08-02-pwsh-tool-bash-parity.md) 已把这份结构镜像记为「第三个 shell 方言出现前不抽公共基类」，同目录 `render.ts`/`index.ts` 早就逐段加了 `jscpd` 标记，`background.ts` 是漏标的一处。
- `client/connection/src/client/fixture.ts` 的 `WorkspaceFollowFrame`：独立 fixture 自带帧定义。`@qilin/api-workspace-controller` 建在本包之上（devDependency + 工程引用），类型回指会形成工程引用环，因此只能由 fixture 自己写。

## 四、验证

| 项 | 结果 |
|---|---|
| duplication 门禁 | `Found 0 clones`（2370 文件，改前 18） |
| oxlint 全仓 | 0 error / 0 warning（4811 文件 / 90 规则） |
| typecheck | `tsc -b tsconfig.host.json` 0；`tsc -b tsconfig.client.json` 0 |
| `verify-export-jsdoc` | 通过（导出的 hook 取简单标识符参数） |
| 依赖与其他门禁 | `verify-package-dependencies` 78 包、`verify-client-packages`、`verify-client-ui-i18n`、`verify-source-artifacts`、`verify-client-domain-graph`（本包 0 违规）均绿 |
| 受影响用例 | `vitest run packages/client packages/host/preview-media packages/fs/fs-local packages/api/workspace-git packages/boot/plugin-manager packages/identity/accounts-local packages/experimental packages/test-support/client-runtime`：738 文件 / 11315 例，改动过的包 0 失败（8 个失败文件见第五节） |
| 新增文件覆盖率 | `work-sources.ts`、`member-facts.ts`、`TaskCardParts.tsx` 均 statements/branches/functions/lines 100%（改动过的 `preview-media`、`accounts-local` 逐文件覆盖率与改动前一致） |

## 五、本轮未动的同链预存红

以下四项都在**改动前的同一棵树上**复现过（用 `git stash` / 单文件 `git checkout HEAD --` 做对照），与本轮无关：

- `ui-sidebar-documentpreview/tests/pdf-license-bundle.client.spec.ts`：`npm pack`（依赖 registry 访问）；改动前同样红。
- `test-support/client-runtime/tests/assembly-test-client.client.spec.ts`：jsdom shim 回收断言；改动前同样红。
- `test-support/client-runtime/tests/assembly-bundle-roster.client.spec.ts`：`@qilin/client-ui-agent-opens -> @qilin/sidebar-opens` 悬空 inject，即上一轮登记的 `verify-module-graph` 缺两个包。
- `shell/tool-bash-persistent/tests/loader-composition.spec.ts`「preserves cwd and environment across calls」：改动前同样红。
- `packages/experimental/ptc-runtime-python` 三个规格（242 例）与 `browser-use-runtime/tests/mcp.spec.ts`：本机 `/usr/bin/python3` 是 CPython 3.9.6，低于该包要求的 3.10（`validatePythonBin` 直接拒绝），属环境前提缺失。
- `packages/client/ui-theme/tests/scrollbar-styles.client.spec.ts` 1 例：`ui-deliverables/src/client/SessionChanges.module.css` 在抬升表面滚动却不重绑。本轮 diff 不含任何 `.css`，与该断言无关。
- `verify-client-domain-graph` 是 `check-all` 车道里的 52 处违规（ui-conversation / ui-sidebar-browser 等既有分层债），本轮新增文件 0 违规。
