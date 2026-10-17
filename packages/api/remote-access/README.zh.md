---
description: "面向非 owner Peer 的方法级 Remote 访问控制：基于角色的策略判定、列表过滤，以及每个 Peer 的访问快照。"
kind: "package-reference"
---

# @qilin-agent/api-remote-access

[English](README.md) | 中文

## 概述

决定非 owner Peer 可以调用哪些 Remote 方法、可以收到哪些转发事件。业务包定义角色——每个角色是一个资源种类上的动作集合——并为每个非 owner principal 种类注册一个把角色绑定到资源的策略。[API Gateway](../gateway/README.zh.md) 解析一次调用或事件访问的资源，并在解析 lookup、解码参数之前询问本包。列表方法通过 `allows()` 过滤条目，每个 Peer 跟随自己的访问快照，Client 因此可以隐藏 Host 会拒绝的条目。[remote-access 设计稿](../../../plans/2026-10-17-remote-access-typert-owner-design.md)拥有 QiLin 侧的引入裁决。

## 目录

- [Host 服务：`RemoteAccessService`（ctx key：`remoteAccess`）](#host-service)
- [Client 面](#client-face)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="host-service"></a>
## Host 服务：`RemoteAccessService`（ctx key：`remoteAccess`）

每个挂载 [API Gateway](../gateway/README.zh.md) 的组合都挂载本服务：Gateway 注入 `remoteAccess`，缺它不启动。[bundle/base](../../bundle/base/cordis.patch.yml) 把它与 `typert-gateway` 一同加载。owner（`{ kind: 'owner' }`）从不接受检查；下面每个方法都只关于非 owner principal。

| 成员 | 契约 |
|---|---|
| `registerPolicy(kind, policy)` | 注册一个非 owner principal 种类的 `RemoteAccessPolicy`；其 `bindings()` 与 `explain()` 收到按该种类定型后的 principal。同一种类注册第二个策略会抛错。注册是调用方 fiber 的 Cordis effect；注册与移除都会重算打开中的快照。 |
| `invalidate(principal?)` | 报告某个 principal（或缺省为全部 principal）的绑定或条件答案可能已变化。业务包在每次授权、撤权、模式变更与过期时调用它。 |
| `decide(request)` | 仅 Gateway 使用。`request` 为 `{ principal, action, resources, args? }`：调用方或接收方，端点 `ns/method` 或 `event:<name>`，Gateway 解析出的合法资源，以及按 Typert 编译类型校验过的调用参数（lookup 参数保留 wire 身份）。返回 `{ kind: 'allow' }` 或 `{ kind: 'deny', reason }`；调用被拒时 Gateway 抛出 details 为 `{ action, reason }` 的 `remote-access/denied`，事件被拒时直接丢弃而不构造错误。owner 与 `remoteAccess/follow` 恒被允许。 |
| `allows(resource)` | 读取访问本服务的 Context 上的 invocation，因此列表方法对每个条目调用 `this.ctx.remoteAccess.allows(resource)`。以调用的端点 action 在该资源上判定、不带参数，并在每次检查时重新读取绑定。owner 与 Remote 调用之外恒为 true。 |
| `snapshotFor(principal)` | 页面打开时的基线：owner 为 `{ type: 'baseline', owner: true }`，否则为该 principal 当前的授权。 |
| `follow(signal)` | Remote 流 `remoteAccess/follow`：一条 `baseline`，其后为 `upsert` 与 `remove` 帧。owner 只收到 `{ type: 'baseline', owner: true }`。`signal` 中止或服务卸载时流结束，因此重载后的服务让每个读者从新基线开始。 |

角色 `{ name, resource, actions }` 是普通值，命名一个资源种类（`global` 或 `TypertResourceMap` 声明的种类）上的动作集合。绑定 `{ role, resource, condition? }` 把角色授予该角色种类的一个资源。策略从自己持有的内存状态同步回答 `bindings(principal)` 与可选的 `explain(request)`。一个请求被允许，当且仅当在每个解析出的资源上，存在绑定指明该资源、其角色列出该动作、且它没有条件或条件允许。资源相互独立：`global` 上的授权不蕴含任何其他资源，任何资源也不蕴含其他资源。条件收到 `{ action, resource, args? }`，只为资源与角色都匹配的绑定运行；事件、快照与列表过滤不带 `args`。`bindings()` 每次 `decide()`、每次 `allows()` 检查、每次快照计算各运行一次；它从不在判定间缓存，因此时间相关的状态作用于下一次调用。

Gateway 从 `@Remote` 与 `@RemoteScope` 的 `resources` 读取函数、lookup 与 Host Context adapter 的 `resource` 声明、以及 `typert.resources` 中的默认字段解析资源，顺序由 [API Gateway](../gateway/README.zh.md) 拥有；本包不读任何参数字段。不指明资源的调用只访问 `global` 资源，因此只有 `global` 角色能允许它；把动作放进 `global` 角色，即允许该 principal 在调用未指明的任何资源上调用它。资源非法的调用由 Gateway 以 `resource-invalid` 拒绝，不询问 `decide()`。

`bindings()`、条件或 `explain()` 抛错时，判定以 `policy-failed` 拒绝；在快照中，抛错的 `bindings()` 让该 principal 没有授权，抛错的条件排除其动作。因此 faulty 规则不会破坏共享的 `$events` source、快照流或页面渲染。服务 logger 在每次 `invalidate()` 与每次策略注册或移除之后报告每个策略的第一次失败；此后该策略的失败保持静默直至那时。

转发事件以 `event:<name>` 为动作、在其转发条目读取函数指明的资源上判定（条目未声明时为 `global`），并且要么整体到达非 owner、要么不到达；其 payload 永不被裁剪。事件携带它声明的每个资源，因此读取函数返回 `undefined` 会使事件的资源非法，Gateway 不询问 `decide()` 就不把它送达任何非 owner。一个事件最多命名一个资源，因此集合变化走在 follow 流上，其方法通过 `allows()` 逐条目内联判定。

服务通过 `webserver/index-inject` 向 webServer 渲染的每个 index 追加一行名为 `REMOTE_ACCESS_SNAPSHOT_KEY`（`__QILIN_REMOTE_ACCESS__`）的 `global` 行，值为 owner 基线 `{ type: 'baseline', owner: true }`。为某个 principal 渲染页面的组合，在每条 index 注入行之后放置把该 global 赋值为 `ctx.remoteAccess.snapshotFor(principal)` 的语句。靠后的赋值替换 owner 基线，Client 入口挂载时读取该 global，页面因此以该 principal 的授权而非 owner 的授权打开。

| `remote-access/denied` 的 `details.reason` | 成因 |
|---|---|
| `resource-invalid` | 由 Gateway 在 `decide()` 之前给出：资源读取函数抛错或返回空列表，或某个资源 id（含 Context 身份）不是非空字符串。 |
| `no-allow` | 该 principal 种类没有策略，或没有绑定允许该动作于某个资源，且条件与 `explain()` 都未给出原因。 |
| `policy-failed` | `bindings()`、条件或 `explain()` 抛错；失败按上文记录日志。 |
| 条件或 `explain()` 的原因 | 在第一个没有绑定允许的资源上，首个匹配绑定的拒绝条件给出原因；没有时由 `explain(request)` 给出。 |

快照授权按 principal 绑定指明的资源逐一列出这些绑定角色中 `decide()` 在无调用参数时允许的端点动作（排序后），因此对同一 principal、动作与资源，快照与 `decide()` 一致；没有任何被允许动作的资源不产生授权，允许集合变空时流推送 `remove`。`event:` 动作从不进入快照。快照只在 `invalidate()` 与策略注册或移除之后重算。

<a id="client-face"></a>
## Client 面

Client 入口同步读取 index 注入的 `REMOTE_ACCESS_SNAPSHOT_KEY` 基线，通过 `mountAccess(ctx, contribution, initial)` 自行挂载生成的 `remoteAccess` contribution，跟随快照流，并提供：

- Client 服务 `ctx.remoteAccess.source(kind, id, action)`：按 `(kind, id, action)` 的身份稳定布尔 source，对应声明种类的一个资源；
- 标准 Hook `useRemoteAccess(action)`，在 `global` 资源上作答。

领域 UI 包在 `source()` 之上发布自己的资源 Hook。Hook 的 `action` 是 `RemoteEndpoint`，即某个 Client Remote 命名空间声明的端点。非 owner 的答案是该资源的授权是否列出该动作，绝不回退到 `global` 的答案，因此没有授权、或授权未列出任何动作的资源回答 false。owner 的每个答案都是 true；没有注入基线的非 owner 页面、以及快照流终态失败的非 owner 页面，回答 false；终态失败连同错误一起上报——非 owner 得到重新加载页面的建议，owner 得到其答案不受影响的说明；重连保留最后一份快照。注入的基线畸形时挂载失败。Hook 从不发起请求，Host 仍检查每一次调用。[client-runtime](../../test-support/client-runtime/README.zh.md) 在 Client spec 中以全允许替换该行。

<a id="model-experience"></a>
## 模型体验

无：本包为 Client 调用方决定 Remote 访问，不注册任何面向模型的东西。

#### KV Cache 影响

无直接影响。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 快照与列表过滤判定不带调用参数，因此依据 `args` 细化答案的条件可能拒绝一个快照显示为允许的调用。
- 资源读取函数与自动解析必须覆盖方法访问的每个资源；调用未指明的资源不被检查，因此在被指明资源上获得授权的 principal 可以触达它。
- 默认资源解析按 wire 字段名匹配；给方法添加与已注册种类同名的字段，即为该调用添加该种类的资源。
- 交互参与（回答转发 waterfall）仅限 owner：非 owner 的 `$events` 流只收到策略在其资源上允许 `event:<name>` 动作的广播帧。
- QiLin 部署为单账号会话运行时，Connection 把每条连接都接纳为 owner Peer，因此当前没有已发行的组合注册非 owner 策略；判定机制服务于未来 driver 并入 `PrincipalMap` 的 principal 种类，今天所有连接的默认策略仍是全权。
- 连接传输为每次 `/api` 分派指明 operator Peer；在连接面长出显式的逐连接 Peer 之前，非 owner Peer 只能经进程内载体与 fixture Peer 触达。
- 精确的 Connection Fetch 路由不经过 Gateway；共享 Fetch handler 以 operator 身份应答它们，直到每条路由声明自己的访问规则。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点开查看</summary>

移植自上游 dsh-v0.2.1-rc.1（d7bd68ee7a + 0c4a7e3e8c）；`tests/peer.ts` 暂代上游 client-connection 的 `Peer`，该 Peer 落地前 gateway-access spec 移除了已释放 Peer 的用例。

</details>
