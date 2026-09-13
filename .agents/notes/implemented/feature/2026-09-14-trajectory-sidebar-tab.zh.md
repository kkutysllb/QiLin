# Agent Note：Trajectory 作为右侧边栏标签页

Status: implemented

[English](2026-09-14-trajectory-sidebar-tab.md) | 中文

## Problem

会话头部曾多出一行导航：transcript 上方的 Chat/Trajectory 标签条。Trajectory 是检查面——按轮次组织的事件记录表加自有时间线——把它塞进会话列，等于把两种截然不同的呈现挤进同一个滚动容器，还让视图必须用 `ui-conversation` 里的 `data-conversation-composer-overlay` 规则去补偿浮动输入卡。

同一个头部还带一个「更多操作」按钮，其唯一菜单项是下载 Session 日志；它与 `/export` 命令重复，等于同一能力有两条入口、多一块头部 chrome。

右侧边栏本就把可停靠、可调整、可拆分、可浮动、可全屏的检查面作为既有职责，其标签页注册表也是包添加一个标签页的公开途径。

## Decision

`ui-trajectory` 把记录表注册为右侧边栏的页面类型。`trajectoryTabDefinition` 声明 kind 为 `trajectory`、id 为 `@qilin/client-ui-trajectory/trajectory`、band 为 `builtin`、本地化的 `view.trajectory` 标签标题，以及 order 20 的引导页条目。正文以同一 id 注册进键控座位 `sidebar.right.pane.tab`，把 `conversation.trajectory.images` 声明为子槽位，并由 inject face 提供分页加载器、图片加载器与时长偏好。注册表在标签页打开时捕获标题，因此标题永不变化的本类型无需注册 `sidebar.right.pane.tab.title`。

焦点经由标签页导航记录传递，而不是会话 store 的请求。`TrajectoryTabParams` 为 `{ focus?: string }`，声明为 `SidebarRightTabParamsMap` 的 `trajectory` 条目；`ctx.sidebarRight.openTab("trajectory", { params: { focus: callId } })` 一次完成打开标签页、聚焦该调用并展开侧边栏。正文读取 `useTabInfo().tab.navigation`，在 `navigation.revision !== appliedRevision` 期间应用焦点，随后记录已应用的 revision：同一次导航不会重复应用，之后再次查看同一调用则会重新应用。

`ui-chat` 用注入的 `openTrajectory(callId)` 取代 `openView` owner prop；工具卡片的查看操作用于打开侧边栏标签页，而不再切换会话标签。

`ui-conversation` 保留 `conversation.view` 槽位、视图名册与标签条——Chat 仍是注册视图——但去掉一次性焦点请求通道：Trajectory 离开视图环后，`ConversationViewRequest`、store 的 `viewRequest` 字段与 `openView`/`completeViewRequest` 动作都没有生产者与消费者。`ConvViewOwnerProps` 变为标记接口。

`ConversationRoot.module.css` 去掉 `:has([data-conversation-composer-overlay])` 规则，`TrajectoryView` 不再输出该属性：记录表在侧边栏面板内自持滚动容器，会话列不再承载它。浏览器场景 `composer-tab-geometry` 及其期望文件随之删除，因为其主题——输入卡在两个会话标签间保持位置——已不存在。

`session-log-export` 保留挂在 `conversation.session.header.utilities` 座位上的共享结果弹窗，但不再渲染按钮：`/export` 是唯一入口，弹窗仍汇报准备中、成功与失败状态。

## Alternatives considered

**保留 Chat/Trajectory 标签并额外提供侧边栏快捷方式。** 否决。同一呈现面出现两套导航，记录表在会话列中依旧局促，输入卡补偿逻辑也照旧存在；而侧边栏本身已能停靠、拆分、浮动与全屏承载记录表。

**在 `/export` 之外保留头部下载按钮。** 否决。该按钮没有提供命令之外的能力，两条入口共用同一弹窗与控制器，因此移除它只减 chrome，不减能力。

**把 `viewRequest`/`openView` 留作会话 store 的扩展点。** 否决。Trajectory 离开后既无视图请求焦点，也无代码完成请求；没有生产者与消费者的通道是死表面，不是扩展点。视图名册与选择保留，因为 Chat 仍在使用。

**用新的头部按钮打开侧边栏标签页。** 否决。引导页条目是注册表设计的发现路径，工具卡查看操作覆盖聚焦场景；再加一个头部控件等于重建本次改动移除的 chrome。

**在 `ui-chat` 中声明 `SidebarRightTabParamsMap.trajectory`。** 否决。kind 的拥有者声明其参数；`ui-chat` 以 `import type` 引入该声明，与其已达 `file` 资源参数的方式一致。

## Consequences

记录表获得侧边栏的摆放模型：停靠、拆分、浮动、调整尺寸与全屏，并且可以从 Chat 聚焦到某个工具调用打开。会话头部回到一行，会话列只承载 Chat。

右侧边栏现有两个引导页条目，因此新面板以引导页为初始标签，而非唯一的那个条目——`contract/seed.ts` 的种子规则在恰好一个条目时选中它，否则选引导页。

打开记录表不再需要会话视图环，因此正文的焦点、分页与图片加载都经由侧边栏标签页座位抵达；未组合 `ui-sidebar-right` 时记录表完全不再出现。

Session 日志下载只有一个入口。浏览器端组合该包即可获得弹窗与 `/export` 观察器，头部不再贡献任何东西。

## Verification

`pnpm exec vitest run packages/client/ui-trajectory/tests packages/client/ui-chat/tests packages/client/ui-conversation/tests packages/session-query/session-log-export/tests` 覆盖标签页类型与正文注册、释放、查看即聚焦路径、迁移过来的记录表行为，以及仅弹窗的导出贡献。无密钥 Web e2e 通道及其 a11y 期望树需要执行 `QILIN_SNAPSHOT=refresh pnpm run test:web`，因为会话头部不再渲染标签条与「更多操作」按钮，且原先打开记录表的场景改为经由侧边栏。`data-app-frame` 标记布局网格根节点，使几何断言定位该元素，而不是任何类名含 `frame` 的元素。
