# Agent Note: 对齐上游 dsh-v0.1.6-alpha.2

Status: implemented

[English](2026-09-17-upstream-dsh-0.1.6-alpha.2-alignment.md) | 中文

## Problem

QiLin 是跟随上游 DeepSeek Harness（DSH）主线演进的重品牌引擎。上游在 QiLin 已对齐的标签（`dsh-v0.1.6-alpha.1`）之后两天发布了 `dsh-v0.1.6-alpha.2`，含 548 个非 merge 提交、2622 个文件：重做的 profile 解析、重写的设置插件面、原生插件管理器、Office 文档转换、沙箱侧栏浏览器标签，以及 `workspace/changes` 会话事件。

QiLin 与上游的历史不相连，无法按祖先关系合并。上一轮对齐为此建了改名变换（上游树 → QiLin 命名空间），并记录了它并非逐字节精确：品牌改名与上下文相关，残余差异使「上游也改过」的文件必然冲突。

## Decision

分支 `3.0.2` 让上游 alpha.2 树经过改名变换，与一个合成的共同祖先做三方合并，然后把 QiLin 的每一处本地能力重新落到上游结构上。

上游结构优先，QiLin 行为在其上重新表达：

- **Profile 解析。** 上游把补丁重载移入新包 `packages/boot/hmr`，并从模板、清单与加载器中删除 `patchReload`。`patchReload`、`ProfilePatchReload` 与各模板的 `patchReload` 值随之上移除；profile 补丁重载改为 `@qilin/hmr` 的显式配置监听，由 base bundle 挂载。QiLin 保留 `qilin` profile 模板、安装自有元组归一化，以及 `dsh` 时代元数据回退（`profileDeclarationOf`、`bundlePatchOf`、`dshCompatModuleId`）。
- **插件管理。** QiLin 自有的 `host/plugin-manager` 与 `client/ui-settings-user-plugins` 两个包退役。上游的 `@qilin/plugin-manager`（base bundle 行）提供 `pluginManager` Remote，由 `@qilin/client-ui-plugin-manager` 消费；QiLin 的两个包在同一服务名下暴露了不同的方法集，二者无法共存。
- **当前会话选择。** 会话控制器拥有目录，视图选择归导航。`@qilin/api-session-controller` 的列表状态不再带 `current`，`ISessions` 不再打开子代理。QiLin 的本地页面改从 workspace 服务读选择：`UiWorkspace.selection` 发布持久化的主面板选择，`ui-settings-skills` 经自身注入面读取，`ui-sidebar-tasks` 经 `UiWorkspace.openSession` 展示子项。
- **右侧栏 tab 类型。** `SidebarRightTabDefinition.label` 变为可选；tab 设置行回退显示 `kind`。QiLin 自有的类型仍会提供它。
- **客户端内容宽度。** 上游把转写稿宽度轴抽成 `conversation.content` 工厂的 `widthControls` 局部组件。QiLin 的设置驱动宽度（`useContentWidth`/`setContentWidth`、`CONTENT_WIDTH_ADAPTIVE`、`CONTENT_WIDTH_MIN`）重新落到 `ConversationWidthControls.tsx` 内，取代上游的 `localStorage` 偏好。

改名变换现在从**当前已对齐状态**学习逐文件映射，对上游未改写的每一行直接复用 QiLin 的原有拼法；只有真正重写的上游文本才走学到的 token 对。这让冲突数减半（527 → 267），并整体消除了双语配对记录这一类冲突。

生成物改为重新生成而非合并：包版本、tsconfig 别名与工程引用、各类目录、第三方声明，以及双语配对记录。

## Transform mechanics

合并基于两个合成提交执行：改名后的 alpha.1 树作为共同祖先，改名后的 alpha.2 树作为另一方，两者记录在 `refs/upstream-synth/*`。`git replace --graft` 让真实分支顶端在合并期间视作该合成祖先的后代；合并完成后删除这些替换，因此合并提交记录的是真实父提交。

`git merge` 解出 267 个冲突：261 个内容冲突、3 个对方删除、3 个我方删除。处理分类：

- **品牌残余**（22）——两侧改动都不足十行；取上游后回贴本地改动。
- **文档与散文**（29）——增量改写；先 union 合并再复核。
- **生成物**（含配对记录共 128）——重新生成。
- **语义冲突**（56）——profile 解析、CLI、extensions 各包、客户端设置、主题与右侧栏；一律按**合并后的工作树**判读，而不是二选一。

## Alternatives considered

**直接合并上游提交。** QiLin 的历史是独立初始化的，没有可用的共同祖先。

**整文件品牌替换。** 上一轮已证明它会破坏与上下文相关的名字：`cordis.yml` 是加载器的根配置文件，而 vendored 插件是 `@qilin/kylin-*`；`spreadsheet` 里含 `dsh`；运行时标识符（`cordis_inspect_list`、`dynamicCordisRunner`、`CordisDynamicPluginId`）保留 `cordis` 拼法。本轮改为按行复用 QiLin 拼法，并在事后修正残余 token。

**让 QiLin 的插件管理器与上游并存。** 两者都注册 `pluginManager` Remote，同一组合会出现两个方法不兼容的提供方；并存需要新服务名与第二个改写 profile 的写入方。

**保留 `patchReload`。** 上游已删除该机制；保留会与新的 `@qilin/hmr` 监听形成两条互相竞争的重载路径。

**把选择发布为全局 standard hook。** 让 `useMainSelection` 成为必需的全局 prop 会迫使 83 个无关测试夹具补上它；改由消费页面自己的注入面传递，把改动限制在局部。

**推迟插件管理器退役。** 退役前的客户端页无法对上游 Remote 方法通过类型检查，推迟会把工作区留红。

## Consequences

整体上，本次对齐拿到上游的 profile 净化与插件管理器、Office 转换、沙箱浏览器标签、`workspace/changes` 事件与变更文件卡片、`boot/hmr`、`util/lazy-require`，以及 548 项上游修复。`SESSION_FORMAT_VERSION` 仍为 3，没有 `!` 提交，engines 未变，`vendor/` 只动了三个文件，因此 QiLin 构建仍能读取对齐前写出的日志；而对齐前的构建会拒绝带 `workspace/changes` 的日志。

代价是一次性的庞大评审面。重新落地 QiLin 行为恢复了两处上游不带的表面：`ui-settings` slot 契约里的 `settings.trigger`，以及 `ui-settings-general` 渲染进它的触发行；还有 `@qilin/plugin-manager` 的更新检查与 GitHub 插件目录，客户页面把它们挂在既有安装链路上，而不是第二个写入方。`@pluginId` 输入触发源、creator 工具集与 `cordis_mount` 信任段落随上游的 creator 重写一并消失；`plugin_manager` 取代了它们。

双语配对在合并后重录了全部 1037 条记录；结构分歧的配对是**对齐**而非洗白，合并造成的重复段落则两侧一并保留当前版本。持久化档案也在同一轮重新取指纹：schema inventory 的域标签为 `qilin-persistence-schema-v1`，而已发布与历史快照仍带着按上游标签算出的摘要，因此每个根与类型的摘要、以及那些记录钉住的摘要都重新计算过。没有世代被移动，也没有格式版本变化。

基线树留下的红灯门禁现已通过：`gen-module-graph`/`gen-doc-graphs` 排除 vendored peer，`@qilin/kylin`（`vendor/cordis`）不再被判为「缺失的仓内 peer」；`gen-kylin-inspect-catalog` 在构建过工作区后通过；已发布持久化、格式引用、类型历史与目录门禁重新一致。Web 车道的 scaffold 不再预确认已删除的内测声明，其 token 交换断言连接的 entry path 而不是站点根。

命名沿用基线树：框架生成的 API 区块与运行时标识保留 `Cordis` 拼写，而 QiLin 自有的散文、包名与文档目录用 `Kylin`。

## Deferred

- QiLin 自有的 `host/plugin-manager` 与 `client/ui-settings-user-plugins` 两个包已删除。[插件生态兼容笔记](2026-09-15-dsh-plugin-ecosystem-compat.zh.md)保留了仍然成立的那一半（DSH 时代兼容层、`qilin plugin list`/`doctor`），其归属与设置面两段已改为指向 `@qilin/plugin-manager`。
- `scripts/rescope-vendor.ts` 仍按框架的旧名与旧路径（`vendor/kylin`、`scripts/kylin-walk.ts`、`@kylinjs/*`）映射，而树里 vendored 的是 `cordis`；`rescope-vendor:check` 在报出结论前就先因缺失路径失败，该映射需要独立重写。
- tracked Markdown 的正文里仍有大量 `@deepseek-ai/dsh-*` 旧包名。只有文档类型检查会编译的代码块被更新，其余是历史引用与 DSH 时代兼容层自身的主题内容。
- 生成器把英文 API 区块同时写进两种语言，因此中文子系统页的 `Cordis API` 区块里是英文类型文本。
- 框架名的全量散文改名会牵动每个子系统页的生成区块标题及其中文配对；本次对齐选择保留基线树的既有分工。
