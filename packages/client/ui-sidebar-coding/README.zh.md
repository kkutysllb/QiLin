---
description: "qilin Web 客户端双工作台的编码工作台内容体：VSCode 风格的右侧 Sidebar——文件工作台、代码编辑器、真实终端、Git 面板、沙箱浏览器、轨迹、计划与任务页——在工作台编码标签激活时由 ui-sidebar-right 渲染，宿主半挂载带浏览器信任围栏的 /sidebar 路由、终端 WebSocket，以及由本包自带 bundle 路由提供的六个惰性预览 chunk。移植自 dsh-coding-sidebar 1.0.39。"
kind: "package-reference"
---

# @qilin/client-ui-sidebar-coding

[English](README.md) | 中文

## 概述

双工作台的编码工作台内容体：移植的 VSCode 风格右侧 Sidebar——文件工作台、代码编辑器、真实终端、Git 面板、沙箱浏览器、轨迹、计划与任务页——全部以调用会话的工作区为边界。工作台编码标签激活时，ui-sidebar-right 在右栏渲染本包的内容体；通用标签永远看不到它。宿主半在与 /api 同一道浏览器信任围栏之后挂载 /sidebar 路由与终端 WebSocket，六个惰性预览 chunk 在首次使用时加载。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

内容体是移植的编码工作台：带惰性目录树、上传、拖放与全局文件名搜索的文件工作台；带逐语言语法模式与保存的 CodeMirror 编辑器；node-pty 之上支持断线重连、输出回放与跨会话停靠语义的真实终端；覆盖状态、逐文件暂存、内联差异、历史、分支、上游推送与 GitHub 拉取请求/议题的 Git 面板；多 Tab 的沙箱浏览器；回放会话事件账本的轨迹页；计划、任务与子智能体页。

编码标签激活时，ui-sidebar-right 在 `rightbar.session.coding` 之下渲染本内容体；通用标签下保留其原生 dockkit 内容体；栏框 chrome——宽度、折叠、展开手势——从不改变。移植的拦截面由同一标签守卫：回合尾部的产出文件行、把对话侧文件打开接进侧栏编辑器的 open-path 门、以及打开侧栏浏览器的外部 http(s) 链接，只在编码态生效；通用态下原生面照常行动。凡用户必须看见的落点——对话里的文件打开、投递卡的预览、资源管理器定位——还会请栏框把收起的右栏展开，因为栏框一折叠就遮住本内容体，面板自身的展开标记并不作数。IME 组合输入守卫是唯一不加守卫的注册——它没有需要让位的原生替代面。

web-app bundle 的 patch 行（`ui-sidebar-coding`）挂载本包，这一行同时激活两半：Node 半在宿主 web 服务器上注册 /sidebar 路由与 WebSocket 升级，浏览器半注册槽位内容体与拦截面。根入口发布 Node 契约，`./client` 入口发布消费方 `registerTab` / `registerFileViewer` 参数所用的注册表类型，`./invariant` 入口发布本包的 invariant 伴侣——一次记录包属主的空安装，因为侧栏不拥有自己的服务状态或事件协议。

Settings 外壳里有本包自己的 Side card 节：逐 tab 的启用开关、终端 shell 与字体行、默认打开与自动打开行为，以及两个面向模型的开关——智能体终端工具与侧栏打开工具——默认都关，用户打开前保持休眠。偏好经引擎 config 编辑器持久化到 profile patch 行，无需重挂插件即可生效。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

一道围栏后的一张方法表。Node 半应答 POST /sidebar/api/<method>——fs 的树、读、写、重命名、删除与搜索操作；git 与 GitHub 命令族；计划扫描；后台任务输出回放与终止；子智能体 live 与工作流预览；归档打包；以及 Side card 偏好的读写——另有原始 /sidebar/upload、按 Range 流式发送的 /sidebar/file 媒体、带 CSP 沙箱的 /sidebar/html 预览、/sidebar/bundle chunk 路由，以及三个 WebSocket 升级：同时服务 UI tab（`?tab=`）与智能体自有终端（`?uuid=`）的终端套接字、智能体终端列表推送、agent-opens 推送。每条路由都过与 /api 网关同一道浏览器信任围栏——Host 头回环或 web 运行时的 `trustedHosts`，按请求从活的服务值读取；每个操作都按会话划界：会话的权威 cwd 依次经会话头、客户端摘要、持久化索引解析，脱钩的首个请求也能落进正确的工作区。

浏览器半作为一行模块表启动：核心 client bundle 经 `window.__ModuleLoader__.load` 注册，external 从平台模块表解析；六个惰性 chunk——terminal、editor、locale、trajectory、mermaid、office——从不触碰模块表：各自把工厂赋给本包私有的 `__qilinChunks__` 注册表，由 chunk 加载器在首次使用时经 /sidebar/bundle 取回，其 ETag 重验证让未变化的 chunk 在页面刷新与 HMR 重激活间保持缓存。`betterSidebar` 注册表服务是本包的内部扩展点（双工作台计划 §2.2）：外部插件经 `ctx.betterSidebar` 注册 tab 类型、文件图标与文件预览器，内置页面也走同一服务注册。每次激活一个快照存储，喂给内容体、注册表与拦截注册；React 经 `useSyncExternalStore` 无撕裂地读取它。

</details>

-----

<a id="model-experience"></a>
## 模型体验

### 智能体终端工具

#### 模型看到什么

Side card 的智能体终端开关打开时，八个工具进入调用智能体的工具列表：`terminal_create`（生成一个持久的侧栏终端并运行首条命令）、`terminal_send`（写入按键，submit 旗标表示回车）、`terminal_read`（按页读取留存输出）、`terminal_wait_for`（阻塞等待转录模式、超时、终端退出或用户从侧栏横幅跳过）、`terminal_resize`、`terminal_signal`（`SIGINT` 等 POSIX 信号）、`terminal_list` 与 `terminal_close`。每个工具都绑定调用智能体的会话——模型从不传 sessionId——且每个 uuid 参数都做属主校验，一个会话的智能体够不到另一个会话的终端。工具在开关之后运行时注册，这也是按默认配置引导随附工具包生成的工具目录不列它们的原因。

#### Token 影响

开关关闭（随附默认）时为零。打开后，八条描述与其参数字段随该智能体的每个请求而行，每次调用把它的 tool-call 与 tool-result 对追加进会话日志。`terminal_read` 每次调用至多返回 500 行、256 KiB，宿主为每个终端保留约 1 MiB 回滚——完整转录回放给浏览器视图，从不回放给模型。关掉开关会把工具从列表移除，并释放智能体创建的每个终端。

#### KV Cache 影响

打开或关闭开关会改写下个请求的工具段，可复用前缀从那一点重建；工具调用与结果本身向转录追加，保留线束已持有的前缀。没有系统提示词文字，也没有本包拥有的路由变化随工具而行。

### 侧栏打开工具

#### 模型看到什么

Side card 的打开开关打开时，一个 `sidebar_open` 工具进入列表：模型给出本地文件、本地文件夹或 http(s) URL，打开动作落在调用会话的侧栏——一个编辑器 tab、一个以该文件夹为根的文件窗口，或沙箱浏览器 tab。结果报告 `kind`、`target`、`title` 与 `delivered`，最后一项说明连接中的视图是此刻收到了这次打开，还是它保持排队直到该会话的侧栏下次显示；目标 tab 类型被用户停用时，以点名该设置的错误拒绝。它与终端工具一样运行时注册，生成的目录同样不列它。

#### Token 影响

开关关闭（随附默认）时为零。打开后，一条工具描述随每个请求而行，每次调用追加一个小小的四字段 JSON 结果；排队未投递的情形同样立即返回。

#### KV Cache 影响

与终端工具同一形状：开关翻转改写下个请求的工具段，调用与结果追加，请求里其余一切不变。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **整体移植，不是重写。** 树保留了它内部的组件风格——组件直接够到 cordis 上下文、每次激活共享一个存储——而非较新 client 包的 props 纪律；债务记录在案，不做掩盖。
- **仓内还没有单元测试套件。** 移植的 src 作为已记录的移植债务位于逐文件覆盖门之外；行为经 web e2e 车道与上游仓库自己的测试套件演练。
- **`sidebar_open` 与原生工具重名。** base bundle 挂载的 `@qilin/sidebar-opens` 携带同名工具；原生工具在挂载时，开启本包打开开关的组合会让第二次注册大声失败——工具注册表拒绝重名。
- **标题栏/桌面壳兼容子系统休眠。** overlay 时代的开关簇在栏内布局中隐藏；该子系统随移植一路同行，直到栏布局需要它或债务清偿。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

本 Dev Note 是维护者的工作上下文：未决的设计问题与方向，明确不具权威性——已发布的行为、限制与既定理由以上方章节、包代码与所链接的 Agent Note 为准。

#### 构建产物面

一棵源码树构建四个产物族：`lib/index.js` 与 `lib/invariant.js`（Node 半，ESM，tsc 声明在 `lib/types` 下）、`lib/client.js`（核心浏览器 bundle——经模块表注册的 CJS 闭包工厂，external 取自平台模块表），以及六个 `lib/client-<name>.js` 惰性 chunk（各自单脚本，因为 code splitting 保持关闭；核心 bundle 从不静态导入 chunk 入口）。

#### Source map 重定位与纯度门禁

浏览器 sourcemap 把 lib 相对源码重定位回包的 `../src` 树，编辑器落在源码而不是构建产物上。构建期纯度门禁让浏览器面里任何 Node 内置模块或非 inline-safe 的 `@qilin/*` 值导入直接失败——跨插件协作走 cordis 服务，type-only 导入在门禁看到之前就被擦除。

#### 移植出处

移植自 dsh-coding-sidebar 1.0.39（MIT；DSH-better-sidebar 的 KCoder fork）：说明符与身份重写为 `@qilin/client-*`，body 级自挂载替换为 `rightbar.session.coding` 槽位注册，设置接管与导航图标标记删除（D11），声明式 Side card 节成为唯一的设置面。

</details>
