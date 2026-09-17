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
- **插件管理。** `packages/host/plugin-manager` 与 `packages/client/ui-settings-user-plugins` 退役。上游的 `@qilin/plugin-manager`（base bundle 行）提供 `pluginManager` Remote，由 `@qilin/client-ui-plugin-manager` 消费；QiLin 的两个包在同一服务名下暴露了不同的方法集，二者无法共存。
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

代价是一次性的庞大评审面，以及两处已知缺口：

- `settings.trigger` 在两个上游标签中都有声明，但 QiLin 的 `ui-settings` slot 契约里没有，合并保留了 QiLin 的契约。上游设置外壳会往它注册触发内容，因此触发行未被重新落地。
- `@pluginId` 输入触发源、creator 工具集与 `cordis_mount` 信任段落随上游的 creator 重写一并消失；`plugin_manager` 取代了它们。

双语配对在合并后重录了 169 条记录，7 组结构分歧是**对齐**而非洗白。重新生成的目录文档仍留有中文侧翻译债。

有两道门禁在 `main` 与本分支上同为红：`gen-module-graph`/`gen-doc-graphs` 把 `@qilin/kylin` 判为「缺失的仓内 peer」，尽管它就是 vendored 的 `vendor/cordis` 包；`gen-kylin-inspect-catalog` 在 TypeScript 分析器内部崩溃。两者都不在提交钩子内。

## Deferred

- `packages/host/plugin-manager` 与 `packages/client/ui-settings-user-plugins` 已删除；把它们描述为现状的 Agent Note（`2026-09-15-dsh-plugin-ecosystem-compat`）成为历史，因仍需其决策依据而保留。
- `@qilin/plugin-manager` 的更新检查与插件目录搜索在上游实现中没有等价物。
- 目录文档的中文侧需要为上游新增条目补齐翻译。
