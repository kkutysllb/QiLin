---
description: "Web 壳的 SPA dist 服务器：占据 webserver 回退席位，在配置的 index 路径与公开文档上服务已构建的前端，拒绝遍历且不做静默回退。"
kind: "package-reference"
---

# @qilin/host-frontend-static

[English](README.md) | 中文

## 概述

从配置的发布目录向浏览器提供已构建的 Web 壳。每个配置的 index 路径在授权后渲染包含启动信息的 index；配置的公开文档在该门禁之前按自身字节提供；已有资产直接提供，而缺失或非文件路径返回 404、路径遍历返回 403、不支持的方法返回 405。访问 index 需要有效的进程 token 或浏览器 cookie，但静态资产与公开文档仍可公开访问。同一时间只能有一个实例处理未匹配的路由；第二个实例启动失败，卸载活动实例后，未匹配的请求返回 404。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在服务已构建 Web 壳的浏览器宿主中组合本插件：它占据 webserver 的回退席位，并应答所有未被具名路由命中的请求。它需要知道已构建前端的 `index.html` 位于何处，并接受哪些请求路径提供该 index、哪些文档是公开的。

### 最小配置

```yaml
- name: '@qilin/host-frontend-static'
  config:
    distIndex: /absolute/path/to/dist/index.html
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `distIndex` | 必填 | dist 根目录内 `index.html` 的绝对路径 |
| `indexPaths` | connection 入口路径加 `/index.html` | 提供 index 文档的请求路径，每条都先经过 index 授权；省略或为空时使用该默认值 |
| `documents` | `[]` | 在 index 门禁之前提供的公开文档，每项包含绝对 `path` 与裸 dist `file` |

`distIndex` 与文档表都是组合应用的组装事实：[`qilin-web-app`](../../bundle/web-app/README.zh.md) 通过前端包的 exports 解析 dist，并声明它提供哪些文档；部署绝不硬编码其中任何一项。`indexPaths` 默认读取 `ctx.connection.entryPath`，因此 transport 交给浏览器的路径始终是本服务器会应答的路径。

### 服务器强制什么

请求从 dist 根目录（包含 `distIndex` 的目录）提供。配置的文档路径以该文件的字节与 HTML 媒体类型应答；每个配置的 index 路径以 HTTP 200 渲染 `index.html`；任何其他已有文件按自身 MIME 类型直接提供，未知扩展名按 `application/octet-stream` 提供。解析到根目录之外的路径以 403 拒绝，因此精心构造的路径无法读取 dist 之上的文件。dist 根目录内缺失或非文件的 target——文件缺失、目录或配置的 index 缺失——返回空 404。没有匹配具名路由的非 GET／HEAD 请求回答 405。每个成功的 index 响应都经 webserver 的 `renderIndex` 渲染，因此启动 manifest 在每个配置的 index 路径上到达页面。

配置的 index 响应会在读取 HTML 前调用 `ctx.connection.authorizeIndex`。有效进程 token 会得到 303 重定向与持久浏览器 cookie；已有有效 cookie 时直接提供 index；其他 index 请求由拥有该部署的认证方式应答——Connection 所有的 401 响应，或已安装的账户会话门禁给出的登录文档重定向。文档会跳过该授权：站点根路径的落地页与登录页无需会话即可访问，两者都带 `<base href="/">` 锚点以便相对 URL 从站点根解析，且都不运行 index 转换器，因为它们是静态产品页面而不是带启动信息的应用。其他文件仍是公开静态资源。Token、cookie、过期时间与签名记录语义都归 Connection 所有。

### 文档校验

`apply` 在占据回退席位之前校验每一行配置：文档 `path` 必须是无尾斜杠的绝对 pathname，其 `file` 必须是裸 dist 文件名，同一个 path 只能配置一次，同时又是配置 index 路径的 path 会被拒绝。任何违规都会抛出，因此写错的文档表会让插件加载失败，而不是提供相邻路径或从门禁之后取出 index 文档。

### 可观察的失败

遍历返回 403 而不是错误页。dist 根目录内缺失或非文件的 target 返回空 404，因此失效链接或拼错的 pathname 是显式失败，而不是静默的 SPA 回退。第二次占据席位会抛错，而席位无人占据时 webserver 回答 404——本插件 fiber 被 dispose 后浏览器看到的就是它。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

### 设计理念

本包是围绕 `serveStatic` 的一个函数插件：`apply` 从 `distIndex` 解析出 dist 根目录，解析 index 路径集合（默认取 `ctx.connection.entryPath` 加 `/index.html`）与已校验的文档映射，构建一个对原始 `index.html` 运行 `ctx.webServer.renderIndex` 的 `renderIndex` 闭包，并在 effect 作用域下注册回退 handler。按 webserver 的约定，席位只有单一所有者——第二次注册会抛错——且受 effect 作用域约束，因此 dispose fiber 即释放席位。

### 遍历栅栏

`serveStatic` 规范化请求的 pathname 并拼接到 dist 根目录，然后要求目标就是根目录本身或保持在它之下。检查使用 `sep` 而非 `/`，因为 `resolve()` 在 Windows 上输出反斜杠路径，此时 `/` 后缀会把每个合法子路径都当作遍历拒绝。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | `serveStatic` 与 `apply`：回退占据、index 路径、公开文档、遍历拒绝、index 渲染、MIME 表 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当服务约定不够用时阅读以下内容：先看席位所有者的约定，再看解析 dist 的组合与子系统参考。

- [Webserver](../webserver/README.zh.md)——本插件占据的回退席位与它运行的 index 转换器。
- [qilin-web-app 组合包](../../bundle/web-app/README.zh.md)——解析 `distIndex`、声明公开文档并挂载本插件的应用。
- [HTTP 服务器子系统](../../../docs/subsystems/web-server.zh.md)——回退席位如何融入路由表。
- [生成配置目录](../../../docs/config-catalog.zh.md#qilinhost-frontend-static)——每个受支持配置字段及其源声明。

-----

<a id="model-experience"></a>
## 模型体验

无。该 SPA dist 服务器只应答浏览器资产请求，不注册任何面向模型的内容。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制说明某个资产类别何时尚未被覆盖。它们是当前包约束，不是任务积压。

- **初始 MIME 表很精简**：它覆盖 Vite 输出的资产集合及实际交付的 PWA manifest；其他扩展名在相应资产类别发布前都会回退到 `application/octet-stream`。
- **Pathname 路由是显式声明**——客户端从 transport 的入口路径进入，没有 History API pathname 路由。新增一条需要一份写明的服务器规则——公开文档、index 路径或具名路由——并配以真实组合覆盖，而不是对每次未命中做宽泛回退。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。唯一关系是单个 fallback seat，但 teardown event 在 disposer 前发出，运行时探测会误报；register/release 对称性由真实组合的 HMR 测试覆盖。
