---
description: "qilin Web 客户端右侧 Sidebar 的文件树与文件编辑器 tab 类型：逐层经线上列出会话工作区根目录，按资源地址打开文件，并把文本或代码文件经版本校验的写回存到工作区。"
kind: "package-reference"
---

# @qilin/client-ui-sidebar-files

[English](README.md) | 中文

## 概述

右侧 Sidebar 的导航器：把会话的工作区根目录画成一棵树，逐层经线上列出，外加一个就地编辑文本与代码文件的工作台。本包注册两个 tab 类型。`files` 页从引导页进入，不认领任何地址；它按地址打开文件，交给 `qilin-resource://file` 的查看器认领：`ui-sidebar-right` 里没有任何东西认识本包。`file` 类型认领扩展名可编辑的会话文件地址，在侧栏窗格里显示同一棵树，经 `workspaceFiles` 写回保存，并把文件交给预览查看器。

## 目录

- [注册了什么](#what-it-registers)
- [树](#the-tree)
- [编辑器](#the-editor)
- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="what-it-registers"></a>
## 注册了什么

- **`files` 类型**：`ctx.sidebarRightTabs.register(...)`，kind 为 `files`，id 为 `@qilin/client-ui-sidebar-files`，档位 `builtin`，没有 patterns，另有一个打开该类型的引导页入口（order 10，标题与描述取自 `sidebarFiles` 命名空间，图标是共享的文件夹图标）。整个侧栏只有一棵工作区树：它声明了 `single: true`。
- **`file` 类型**：kind 为 `file`，id 为 `@qilin/client-ui-sidebar-files/file`，档位 `builtin`，patterns 为 `qilin-resource://file/**`。它的 `canOpen` 只接受路径扩展名属于已知文本或代码集合（即 `@qilin/util-workspace-path` 里的共享可编辑集合）的会话地址，图片、PDF、未知扩展名与裸绝对地址都落到 `text` 兜底查看器；绝对地址被拒绝，因为保存它没有授权会话。它不声明 `single`（按注册表默认，一个地址一个 tab）、没有引导页入口、也没有静态 `icon`——标签页上的图标就是打开文件自己的类型图标，由标题坑位绘制。tab 标题是地址解码后的基名。
- **`files` 正文与标签页标题**：以 `@qilin/client-ui-sidebar-files` 为键的 `sidebar.right.pane.tab` 与 `sidebar.right.pane.tab.title` 两个坑位：标题行、文件名搜索与树。标题行与文档预览（`ui-sidebar-documentpreview`）的相同：根路径，目录部分灰色、最后一段正色，从不省略号截断（比行宽的路径保留末尾、淡出开头），右端是它唯一的控件、重新读取。这一行是复制而非共享，因为插件 bundle 只经平台模块共享运行时代码；待 artifact 与各 slot 的形态定下来后，可以在 `ui-primitives` 放一份供每个 pane 标题行使用。
- **`file` 正文与标签页标题**：同样两个坑位，键为 `@qilin/client-ui-sidebar-files/file`：工作台（左侧固定宽度、可收起的树窗格；右侧编辑器）与打开文件的 `FileTypeIcon` 图标加基名。

两组坑位共享一个按会话实例化的 store，按 tab id 分桶：树的桶与编辑器的桶互不掺混。

浏览器半部住在 `src/client/` 下：`definition.tsx` 与 `file-definition.ts`（各类型是什么）、`store.ts`（它们保存什么）、`face.ts`、`file-mutations.ts`、`file-face.ts` 与 `file-pages.ts`（它们如何列目录、改动、读文件与保存，含 Remote 绑定）、`file-preview.ts`（预览打开）、`file-editor.ts`（CodeMirror 适配层）、`file-guard.ts`（认领门槛与命名）、`file-lang.ts`（按扩展名的语法）、`file-failure.ts`（编辑器的失败行）、`FileTree.tsx`（共享的树）、`FileSearch.tsx`（搜索框与匹配结果）、`FilesBody.tsx`、`FilesTitle.tsx`、`FileBody.tsx`、`FileTitle.tsx`（它们画什么）、`locales.ts`（它们说什么）、`index.ts`（接线）。

<a id="the-tree"></a>
## 树

根是会话的工作目录，读自 `useSessions().byId[sessionId].cwd`，标题行里的拆分由 `@qilin/util-workspace-path` 的 `pathPartsOf` 给出。每一层以绝对路径为键；子路径是父路径以 `/` 拼上条目名。一层在首次展开时经 `@qilin/api-workspace-files` 命名空间的 `remote.workspaceFiles.list(sessionId, absolutePath)` 列出；适配层保留列表的条目与截断标志，丢弃其工作区相对路径。行序为目录优先，其后按自然序、不分大小写的名称排列；dotfiles 与其他条目一样显示。

| 条目类型 | 行 |
|---|---|
| `directory` | 切换展开与折叠；该层在首次打开时拉取，折叠期间保留。 |
| `file` | 经 `useTabInfo().tab.actions.openResource` 打开 `qilin-resource://file/session/<sessionId>/<编码后的相对路径>`，地址由 `@qilin/util-workspace-path` 的 `fileAddressFor` 生成，落在该 tab 自己的 pane 里。从编辑器的树里打开时，它落到本包的 `file` 类型上并按地址去重，所以打开的文件不会就地切换。 |
| `other` | 灰显且不可点击，使目录被完整报告。 |

被端点条目上限截断的层以一条标记收尾；空层如实说明；失败的层按错误码各显示一行（`workspace-file/not-found`、`outside-workspace`、`not-directory`），其他情况显示传输层自己的消息。重新读取丢弃所有已列出的层并只对展开中的层重新请求；折叠的层在下次打开时重新拉取。没有工作目录的会话只显示一行说明，而不是树。

把文件拖到窗格上即上传（`UploadOverlay.tsx`）：每个文件整体 PUT 到 `preview-media` 宿主路由 `sidebar/media/upload`，由它经文件系统的 `writeBytes` 写到工作区根之下，完成一批后重载展开中的层。覆盖层按文件报告结果；失败的上传不会改动磁盘。

右键目录或文件行会在光标处打开该行自己的菜单（`FileTree.tsx`）：文件行提供打开，所有行都提供复制工作区相对路径与绝对路径（`copyTextOf`，经 `ui-primitives` 的 `writeClipboard` 写入宿主剪贴板；根自身复制为 `.`）。`other` 行没有菜单。名字本身是符号链接的子项在名称旁带链接图标，因为行图标与类型描述的仍是它解析到的目标。

同一个菜单也承载树的改动（`file-mutations.ts`）：目录提供在其中新建文件或文件夹，每一行都提供就地重命名与删除，右键树的空白背景则在工作区根新建。重命名把那行换成名称输入框——Enter 提交、Escape 放弃、处于输入法组字中的 Enter 留给输入法；新建与删除走对话框，因为一个名字、以及一次会连同目录内容一起的删除，都需要一个答复。名称是单个路径段：首尾空白被去掉，空白、点段、或带分隔符的任何输入都就地拒绝。新建经 `workspaceFiles.write`（不带 `baseVersion`）写入空文件，或经 `createDirectory` 建目录；重命名经 `move` 移动该条目，目标已存在会被拒绝；删除经 `remove`，目录带 `recursive`。每次手势的结果落进该 tab 的改动记录，由行上方的提示条报告——`workspace-file/*` 码用树自己的话，其余用传输层的消息——点关闭即清空。成功后会重新列出该条目所在的目录，打开它的 tab 也随之跟进：地址指向被移动路径的 tab 会在原位置按新地址重新打开，位于被删除路径之上或之下的 tab 会被关闭，因此不会留下指向不存在路径的 tab。宿主对三者都拒绝末端符号链接，提示条如实说明而不隐藏。

标题行下方是文件名搜索（`FileSearch.tsx`）：一个输入框，文本停稳后向 `workspaceFiles` 的 `searchNames` Remote 询问根之下 basename 包含它的文件，不区分大小写。查询存在时匹配结果占据正文——让树回来的是清空的输入框，而不是空结果——点击匹配走树行同一套会话作用域地址打开。输入框文本与最近一次回答都住在该 tab 的 store 桶里，重挂载的正文连同两者一起回来；输入即丢弃上一个回答，因为它描述的是输入框已不再持有的查询。

<a id="the-editor"></a>
## 编辑器

tab 的地址就是它的整个文件身份：`file-guard.sessionFileOf` 在每次渲染时把它解码成端点接收的会话与路径，而授权读取与写入的是地址里的会话，不是坑位的。文件在挂载时经 `workspaceFiles.read` 整读：一页页行直到 `eof`；分页行走把磁盘上的原文拼装出来——凭上报的字节数补回文件末尾的换行——并且第一页的字节数会以端点自己的 `workspace-file/too-large` 码拒绝超过编辑器 2 MB 上限的文件。语法来自 `file-lang.ts`：装好的 `@codemirror/lang-*` 包，外加 shell 族与配置文件的 legacy 模式；其余按纯文本编辑。

界面是 CodeMirror 6 藏在一个适配层（`file-editor.ts`）后面：行号、撤销历史、括号匹配、一个换行 compartment，以及一套只用 `--qilin-*` token 上色的主题加语法 `HighlightStyle`（注释、字符串、关键字、数字、函数、类型、属性），于是明暗两套配色由 token 级联承担，不需要第二套样式。携带 `{ line }` 的导航——工具卡的行引用——会选中并滚动到该行（越界钳到文件边界），每次导航修订只落一次；应答过的修订记在桶里，重新挂载后读者停在原处。保存经 `workspaceFiles.write(sessionId, path, text, { baseVersion }, signal)`，其中 `baseVersion` 是最近一次读取或保存上报的版本；`Mod-s` 与工具栏按钮都触发保存，保存进行中禁用控件，完成的保存带着新版本成为新的干净内容。草稿住在包的 store 里，所以正文卸载再挂载它还在；只有加载改变了文件（store 的 `loadSeq`）才会重挂界面，草稿或保存都不会。

工具栏的预览控件（`file-preview.ts`）把 tab 自己的地址经 Sidebar 控制器指名 `text` 类型打开，会话作用域取 tab 自己的——走 tab 自己的按排名打开只会落回本类型，因为它的档位高于查看器。预览显示的是磁盘内容，所以未保存的草稿在这里原样不动，查看器侧对应的编辑控件走按排名的认领，落回本类型。被磁盘以 `workspace-file/stale` 拒绝的保存会原样保住草稿并升起冲突横幅，横幅上的两个动作就是出口：载入磁盘内容（一次丢弃草稿的重新读取）或用编辑器里的版本覆盖（不带 `baseVersion` 的强制写）。有未保存修改时的重新读取也会先询问，理由相同。读取与保存的失败各按错误码显示一行——`not-found`、`too-large`（带大小）、`not-text`、`not-regular-file`、`outside-workspace`、`stale`——其余显示传输层的消息。

<a id="model-experience"></a>
## 模型体验

无，因为本包在浏览器里绘制工作区文件树与编辑器，不注册任何面向模型的内容。

#### KV Cache 影响

无；目录列表与文件内容经 Remote 传输，不会组装模型请求。

## 已知限制与暂缓事项

<a id="known-limitations-and-deferred-work"></a>
- **只有列目录、搜索与行改动。**没有产物过滤、当前文件高亮或文件系统监听；一层只会因重新读取或改动自身的重列而变化。名称搜索是唯一的全局视图（`searchNames`）；没有就地过滤树的能力，上传是树另一项写入手势（拖放，`ui-sidebar-documentpreview` 的 `preview-media`）。重命名把条目留在原目录——没有移动、没有多选，也不能把一行拖到另一个目录上；在新地址重新打开的 tab 会重新读取文件，所以被重命名文件的 tab 里未保存的草稿不会随重命名留下。
- **只有一个根。**树以会话工作目录为根；没有办法浏览到它之上，而 Host 本来也拒绝工作区根之外的路径。
- **编辑器上限。**超过 2 MB 的文件不打开（Host 自己的每页上限约束每次读取）；没有搜索面板、没有列选择。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

两个 tab kind 共享一个 store 工厂（`createFilesStore`）与注册期的一个句柄，按 tab id 分成 `byTab`（树）与 `edits`（编辑器）两组桶。`files` 页从不播种 `edits` 桶，`file` tab 渲染同一个树组件，所以一个文件 tab 的树与页面的树是同一实例下互不相干的桶。

</details>
