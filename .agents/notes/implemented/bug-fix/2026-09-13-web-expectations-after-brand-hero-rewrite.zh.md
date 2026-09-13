# Agent Note: 品牌与 hero 重写之后的 Web 期望值

Status: implemented

[English](2026-09-13-web-expectations-after-brand-hero-rewrite.md) | 中文

## Problem

品牌、落地页与设置入口的重写改变了 Web 浏览器车道渲染的内容，而它的场景与 golden 仍在期望这些重写所替换掉的界面——见[品牌界面与唯一的 Settings 入口](2026-09-13-qilin-brand-surfaces-and-settings-entry-point.zh.md)、[本地账号与落地页](../feature/2026-09-12-qilin-local-accounts-and-landing.zh.md)。

五个场景文件锚定在已退役的 hero 文案 `Into the Unknown` 上。两个等待该文字，一个把它的元素当作 DOM 地标（品牌标记是「标题的前一个兄弟 `span`」），一个断言命令执行后该文字消失，HMR 场景则在 locale 源里改 `'hero.headline': 'Into the Unknown'`。现在的 hero 渲染品牌标记、按时段变化的问候语与产品标语，产品名作为背后的环境文字标。`hero.headline` 在两个字典里都读作 `QiLin`，因此 HMR 的查找串匹配不到任何源码行；而侧边栏品牌也打印同一个产品名，所以对它做全页文本锚定是有歧义的。

十二份设置对话框 golden 录制于 MCP 服务器与技能页存在之前，因此每一份都缺少该对话框最新的两个导航行与导航的宽度分隔条。它们的场景只在从未捕获对话框时才通过。

Models 与 onboarding 场景断言的是「提供方没有密钥时页面给出什么」，并且会往该提供方的密钥框中输入。车道在任何 scaffold 启动之前就把仓库根 `.env` 载入进程环境，而该文件带有 `MINIMAX_CN_API_KEY`。凭证提供方在它的 `.env` 回退层之上解析进程环境，于是运行中的页面呈现出一个由环境提供的凭证——输入框渲染为只读的 `由启动环境提供（只读）`，另有两份 golden 记录的是环境提供型凭证的删除文案，而不是页面托管型的。

修复后的车道还暴露出两个缺陷，同属这批重写。侧边栏账号菜单在激活前要等设置面板的服务，于是唯一一个挂载整套名册却不挂载设置面板的场景——一个不提供任何设置流量的夹具界面——启动后落到 `web boot: 1 entry did not activate / @qilin/client-ui-account: pending (waiting for service: settingsShell)`，而不是一个应用。此外，built-boot 断言仍把版本胶囊的可见文字钉在完整的 `version-commit-dirty` 串上，而胶囊现在显示裸版本号、把完整串作为提示文字。

## Decision

**hero 的锚点是产品自身的结构，而不是它的文案。** [lifecycle-chrome.e2e.ts](../../../../apps/web/tests/lifecycle-chrome.e2e.ts) 通过会话根节点的 `div[data-phase="hero"]` 等待空白草稿阶段，并按角色悬停标语；[goal-command-presentation.e2e.ts](../../../../apps/web/tests/goal-command-presentation.e2e.ts) 与 [details-session-lifecycle.e2e.ts](../../../../apps/web/tests/details-session-lifecycle.e2e.ts) 读取同一个阶段属性；[startup-auto-selection.e2e.ts](../../../../apps/web/tests/startup-auto-selection.e2e.ts) 把标记的墨色与 hero 的 `level: 1` 标题比较，并悬停 `[class*="fishHitbox"]` 标记。文案仍归 locale 所有，且不进入断言。

**hero golden 把问候语令牌化。** 两处包含空白草稿帧的捕获都传入 `HERO_GREETING_TOKENS`，它把该语言的三种问候语映射为 `{{greeting}}`，因此 golden 不再编码车道运行时所处的时段。

**HMR 场景改动文字标的每一处字典出现，并以文字标自身为锚。** 对 `'hero.headline': 'QiLin'` 做 `replaceAll` 可同时改动两个语言，等待则以 `[class*="watermark"]` 过滤旧文字与新文字，因为侧边栏品牌打印同一个产品名。

**环境凭证由 scaffold 负责挡在外面。** [scaffold.ts](../../../../apps/web/tests/scaffold.ts) 新增 `absentCredentialReferences`：在 scaffold 生命周期内从进程环境删除所列条目，并在拆除时还原，与既有的技能根固定和 DeepSeek 密钥掩码并列。Models、恢复与 onboarding 场景各自指名 `MINIMAX_CN_API_KEY`。

**陈旧的对话框 golden 走重录，而不是手工补行。** 一次 refresh 运行在十二份 golden 中各改写了恰好缺少的那七行导航，使它们仍是渲染自身的记录。

**设置面板是账号菜单的可选邻居。** [ui-account](../../../../packages/client/ui-account/src/client/index.ts) 不再把 `settingsShell` 列入注入服务：打开动作经 `ctx.get('settingsShell')` 解析，而一处作用域注入把该服务的有无发布到 `useSettingsPanel` 来源上，由它决定设置行是否出现。没有该面板的组合会挂载菜单且不提供设置行，而不是让条目永远停留在待激活状态。

**HMR 场景运行在一个关掉账号门禁的部署上。** [hmr-live.e2e.ts](../../../../apps/web/tests/hmr-live.e2e.ts) 在启动已构建 CLI 之前写好 harness home 自己的补丁层，按 scaffold 车道对其它场景的做法关掉 `accounts`。该场景讲的是客户端插件热重载，而带上出厂门禁时首启文档会顶替应用本身。

**版本胶囊的断言按它实际渲染的样子去读。** [built-boot.expected.e2e.ts](../../../../apps/web/tests/built-boot.expected.e2e.ts) 匹配可见的版本号文字，并把完整构建串钉为胶囊的提示文字。

## Alternatives considered

**把断言字符串更新为新文案。** hero 的文案归 locale 所有，且是最可能下一次变动的那部分；建立在它之上的断言会在下一次措辞调整时再次失效，并且会把场景真正关心的东西说错。阶段属性与 heading 角色用产品自己的术语表达了同一意图。

**给 hero 加一个仅供车道锚定的测试属性。** 会话根节点已经发布了它的阶段，hero 的标题也可按角色取到；车道专用钩子会是同一事实的第二个、更弱的声明。

**在 `normalizeAria` 里令牌化问候语。** 问候语是 locale 文案，不是场景自有的路径或易变时间戳；捕获该帧的场景才知道自己在压平哪段文字，而共享归一化器将不得不携带每个语言的措辞。

**HMR 改动保留全页文本锚定。** 文字标是页面打印产品名的两处之一，因此该 locator 会同时匹配侧边栏品牌，并在改动落地后因严格模式而失败。

**删除 `.env`，或在场景内修补凭证行。** 删除开发者的文件不是测试该做的事，而进程环境是凭证提供方有文档记载的顶层；掩码这一个引用在所归属之处陈述了场景前提——该提供方没有密钥。

**把导航行手工插进十二份 golden。** golden 是渲染的记录；手工编辑等于按构造而非按证明去迎合这次渲染，并会掩盖同一批文件里进一步的漂移。

**保留设置面板这一硬注入，并在无面板场景里挂一个桩服务。** 该场景的前提就是部署里不存在设置流量；桩服务会让它断言一个产品并不出货的组合，而它暴露出的待激活条目正是真正的缺陷。

**在没有面板时照样渲染设置行、点击时什么都不做。** 一行打不开任何东西的行会错误陈述部署；该行是面板的入口，因此它跟随面板。

**在 HMR 场景里走完账号门禁的登录。** 该场景驱动的是热重载而不是账号旅程，门禁自身的旅程已有专门场景；用部署级补丁陈述前提，不必复制登录流程。

## Consequences

问候语令牌表与 locale 的措辞绑定：文案一变就是一次响亮的用例失败，并被折回同一个常量。

`absentCredentialReferences` 是按场景的。新的场景若断言某个提供方没有密钥，必须自己指名该引用；车道上没有任何东西会整体掩码环境里的提供方密钥。

hero 与 plan-active 的 golden 在原先退役的 `Into the Unknown Preview` 一行处，改为承载 `- paragraph: {{greeting}}` 与 `- heading "<标语>" [level: 1]`；十二份对话框 golden 则承载 MCP 服务器与技能的导航行。

不挂载设置面板的部署现在会带着账号菜单启动、且不提供设置行；启动页对这类组合不再报出待激活条目。

未处理：录制轮次中会执行受限 shell 命令的场景需要一个可用的沙箱后端，而没有它时产品会失败关闭。在拒绝嵌套 `sandbox-exec` 的主机上，[turn-tail-actions.e2e.ts](../../../../apps/web/tests/turn-tail-actions.e2e.ts) 记录到的是 `SANDBOX_UNAVAILABLE` 工具结果而不是执行该命令；同一个用例在允许沙箱的主机策略下原样通过。[smoke-real.e2e.ts](../../../../apps/web/tests/smoke-real.e2e.ts) 仍在期望落地页之前形态的就绪行地址，并在没有账号会话的情况下驱动 `/api`；[preview-boot.e2e.ts](../../../../apps/web/tests/preview-boot.e2e.ts) 则在打包 worker 内应用 accounts 条目时因 `Unknown encoding: base64url` 失败。两者都属于账号那条工作线，而不是关于品牌界面的期望值。

覆盖：十个修复后的场景文件在回放下通过（48 个用例），重录运行改写了每份陈旧 golden 中缺失的七行导航，完整浏览器车道在交付前回放。
