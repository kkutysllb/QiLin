# Agent Note：动效技能包以内置组合包随包交付，升级走插件通道

Status: implemented

[English](2026-09-27-builtin-animations-bundle-channel.md) | 中文

## Problem

Web 界面此前没有动效技能包：八个 HTML 演示技能（PPT 风格翻页演示、流程图、协议可视化、架构图、笔记体、卡片剧场、视频分镜、手机 UI 演示）只有在有人把 `dsh-animations` 这个 npm 包装进 profile 之后才能到达 agent。该包是普通的树外组合包——一条 `qilin.bundle.patch` 行通过 `ctx.skills.register()` 注册技能，外加一段 systemPrompt section，以及用于侧边工作台的 `qilin.client` bundle——并且按自己的节奏发版。

把它变成内置，除了“加一行”还带出两个问题。第一，它的副本究竟如何随 QiLin 交付：该包解包后约 84 MB 的技能源码、模板与图片，把副本 vendor 进仓库等于把这些放进 git 和每一次 clone。第二，当插件向上游 npm 发布新版本时，随包副本如何保持可升级。

## Decision

- **放进安装闭包，绝不放进仓库。** `apps/cli`——每个 profile 组合包都从它解析——把 `dsh-animations` 声明为依赖，与 `@qilin/base`、`@qilin/web-app` 和可选组合包并列。源码 checkout 由 `pnpm install` 取得，打包运行时由自身闭包取得，因此发版只钉住下界，没有任何技能资产进入仓库。两处声明由 `verify-default-product-isolation` 绑在一起：模板中的组合包既不是工作区包、又不是 `apps/cli` 运行时依赖时门禁失败；解析到的副本若没有 bundle patch，组合出的 Web 层集合便算不完整。
- **由浏览器模板种下。** `PROFILE_TEMPLATES.web` 与 `PROFILE_TEMPLATES.qilin` 把 `ANIMATIONS_BUNDLE` 追加为最后一层，新 profile 无需任何 profile 安装即可组合出该插件的行，而这一行仍由组合包自身的 `cordis.patch.yml` 拥有，而不是写进某个 QiLin 组合包的 patch。
- **回填已存在的浏览器 profile。** 加载随附 profile 时会恢复模板自身的层，并保留模板从未持有过的每一个条目，`INSTALLATION_OWNED_PROFILE_TUPLES` 用来认出更早版本放置过的条目。早于该组合包的 profile 在下次加载时获得它，被人用自有插件扩展过的 profile 保留这些插件（排在模板层之后），而列表等于模板加这些条目时不再写盘，因此该写入会收敛。「恢复」而非「仅在完全相等时追加」，正是产品自身规则的推论：随附层不可移除——插件页不提供移除入口，`readProfilePluginRows` 报告 `removable: false`——行则通过 profile patch 关闭。
- **该名字的解析归 profile 所有。** `PROFILE_OWNED_BUNDLES` 指名 `ANIMATIONS_BUNDLE`，对这唯一一个组合包反转“安装实例优先”的约定：通过 `qilin plugin` 或插件页更新操作（两者都是 `installBundle('<name>@latest')`）装下的副本优先于安装实例的种本解析，这正是内置插件能够原地升级的机制。
- **归属只按顺序，不比较版本。** Loader 自身的模块解析在任何情况下都优先 profile 本地的 `node_modules` 条目，因此若在 `resolveBundleDir` 里比较版本，就会出现 patch 层来自一份副本、代码来自另一份副本的错配。只要 profile 持有副本，patch 层与代码就都遵循同一条 profile 优先的顺序。
- **升级可被发现。** `readProfilePluginRows` 早已把 profile 持有的随附层标为 `updatable`；`qilin plugin list` 打印该标记，插件管理器的 `checkUpdates()` 也覆盖该层，因为 `listBundles` 会列出安装实例的依赖——即便 profile 自身一个都没装。该层也会进入管理页列表：`BundleInfo.updatable` 把「解析权归 profile」这一事实带给页面，页面据此把它列为卡片，显示 profile 解析到的版本，并把层开关连同原因锁定（`readOnlyReason: 'shipped-layer'`），因为摘除条目无法在下次加载后存活；它的行仍可逐条开关。升级动作仍由可更新列表承担——`checkUpdates` 读的是同一层——而该层的行与其余随包行一同出现在设置页「内置插件」的「插件列表」标签中。

## The update path

`qilin plugin add dsh-animations@latest` 与插件页的更新操作在 profile 目录里执行同一条包操作。第一次升级——从安装实例种本换成 profile 副本——之后解析到的是另一个目录，因此管理器会实时重载 profile，新副本随即生效。此后再升级则改写 profile 已持有的依赖，管理器报告为 `restart-required`：这是它对“就地抬版本”的既有规则，因为一次重载无法证明模块缓存已丢掉旧文件。

## Alternatives considered

- **把包 vendor 进仓库**，即已退役的 [coding-sidebar vendor 记录](../../archived/architecture/2026-09-15-builtin-coding-sidebar-vendor-channel.md)为 TypeScript 构建的插件所记录的通道。因体积被否决：每次 clone 增加约 84 MB 解包后的技能与模板，而该插件本就发布无需构建步骤、自包含的 npm 产物。
- **启动时把随包副本物化进 profile**，即参考桌面产品对树外组合包采用的形态。被否决，因为 QiLin 没有可挂载的物化步骤：profile 组合包走双锚点解析，而往用户 profile 里写文件会与 pnpm 已拥有的包重复。
- **为所有 profile 种下该组合包**，包括 `headless`、`acp` 与 SDK 界面。被否决，因为客户端那一半只面向 Web，宿主那一半也只增加演示类技能；`web` 与 `qilin` 才是用得上它们的界面。
- **比较版本并让较新者胜出**，以便发版能越过较旧的 profile 副本。被否决，因为不一致：Loader 仍会为代码选择 profile 副本，于是较新的 patch 层会与较旧的插件代码配对——这是一处加载期就已决定、用户却看不见的错配。
- **启动时自动更新。** 改用一键手动升级：启动期查询 registry 会给每次启动加上网络依赖，并悄悄改变运行中的安装所加载的内容。

## Consequences

- 两个浏览器 profile 恒有这八个技能及其提示词通告。以 `--profile web` 启动会组合出该插件的行、注册全部八个 runtime skill，并在 boot graph 中提供客户端行，其 `@deepseek-ai/dsh-client-*` 注入边被规范化到 `@qilin/client-*`——该包声明的 DSH 时代名字不带来任何代价，兼容层本就做了映射。
- 每个 QiLin 安装都会在依赖闭包里携带该技能包的资产。Python 运行时可执行文件的资产 glob 增加了 `node_modules/dsh-animations/skills/**/*`，因为其入口通过 `import.meta.url` 解析技能正文与模板，而该包的模板是 HTML，原有 glob 并不包含。
- 只要 profile 装过副本，这个名字就被它钉住：抬高了依赖下界的发版无法仅靠解析推动该层。向前走的路径是 registry 更新与 profile 内的 `pnpm install`，CLI 与插件页都让它们成为常规操作。
- 一旦 profile 依赖该包，`readProfilePluginRows` 报告的 `source` 变为 `user`，而 `removable` 仍为 false，因此 CLI 对一个不允许移除的层打印 `(shipped)  (updatable)`——随附标记的语义是“不可移除”，而非“未安装”。