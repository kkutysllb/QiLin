# Agent Note：直接使用 DeepSeek Search 与 Fetch API

Status: implemented

[English](2026-10-15-deepseek-search-fetch-api.md) | 中文

## 问题

通过 Messages 进行 DeepSeek 网页检索时，每个查询都需要一次辅助模型请求。Harness 会提取来源与引用摘录，但丢弃生成的回答。专用的 Search 与 Fetch API 直接提供结构化来源与 Markdown，因此检索可以不在 Harness 内部启动那次辅助生成。采用这些 API 需要显式选择两种操作、独立的部署地址，以及把 Fetch 结果映射到既有抓取结果。

## 决策

[DeepSeek Search 与 Fetch 指南](https://api-docs.deepseek.com/zh-cn/guides/search)（2026-10-16 核对）定义了上游 API。[web-deepseek-api 插件](../../../../packages/web/web-deepseek-api/README.zh.md)在既有 `web_search` 与 `web_fetch` 工具背后实现它，[web-search-deepseek](../../../../packages/web/web-search-deepseek/README.zh.md) 保留 Messages 搜索。[web 能力决策](../architecture/2026-06-24-web-capability-seam.zh.md)继续负责提供方选择、工具职责与抓取结果字段。

### 协议选择与部署

两个 API 注册为 `deepseek-search-api` 与 `deepseek-fetch-api`；Messages 搜索保留 `deepseek-official`。网页搜索页上的 **启用新版 Web 搜索 API**（**Use the new Web Search API**）设置会同时写入 `web.searchProvider` 与 `web.fetchProvider`：打开即选中两个 API，关闭则恢复 Messages 搜索与本地 HTTP 抓取，即随包选择。开关默认关闭，保存后生效，因为 web 服务会在每次操作读取这两项选择。在 Search API 正式发布公告之前，Messages 仍是默认值，因此现有用户无需配置即可继续搜索。每次操作解析一份设置快照，包括其端点与凭据。两个 API 读取同一凭据与同一 API 基础地址，因为指南由同一基础地址提供它们，且开关会同时选中两者。

两种协议保留独立的 API 基础地址。Messages 保留 `https://api.deepseek.com/anthropic/v1` 并追加 `/messages`。直接检索使用 `web-deepseek-api.baseURL`，默认为指南的公开地址 `https://api.deepseek.com/v1/tools`，并追加 `/search` 或 `/fetch`。这些前缀不同，且从不从主机名推断，因此其他部署需填写自己的完整地址。开关本身就是显式选择，因此文档中的公开部署作为其默认值。基础地址为空或不可解析会使两个提供方都不可用。

指南规定 API Key Bearer 认证，请求只发送文档规定的授权头与 JSON 内容类型。QiLin 的账号面是自有的 `ui-account` 登录门，未采用上游的 `deepseek-account` 栈，因此这里不存在账号令牌路径：每个直接检索请求都用 API Key 认证。2026-10-16 核对的一个 Anthropic 兼容网关提供 Messages 网页搜索，但没有 `/v1/tools` 路由；此类部署保留 Messages 搜索。

### 搜索结果与模型输入

直接 Search 发送 `query`、`count`、`need_content: false` 与 `ori_question`。`count` 是配置的 1 到 50 的值，默认采用服务方的 10，除非请求的结果上限更小；工具总会发送自己的上限，默认 8。`ori_question` 是发起 Session 最近一条人类提示词的文本，空白折叠后截断到 API 的 128 字符上限。API 拒绝空值或更长的值，因此没有此类提示词的搜索会省略该字段，`sendOriginalQuestion: false` 可关闭它。2026-10-16 的探测中，不同取值没有改变结果顺序、评分与摘要。查询原样传递，包括文档规定的站点、语言、日期、排除与精确短语操作符。服务方执行 1–128 个 Unicode 字符的查询约束。`results` 为空视为成功。

提供方保留服务顺序，把 URL、标题、`snippet` 与可为 null 的 `date` 映射为共享来源。当前工具给模型与搜索卡片同一段短摘录。它不消费 `summary`、完整 `content`、`site_name`、`site_icon`、`rerank_score` 或 `authority`，也不发送 `localization`。这些省略是集成限制，不是 API 缺少能力。

直接检索不产生辅助模型请求事件，因为 Harness 不发起此类请求。常规工具调用与工具结果事件保留查询与模型可见结果。这不涉及搜索服务内部是否使用模型。返回文本始终是外部的、不受信任的数据。

### 抓取元数据与所有权

Fetch 发送一个 URL 并返回 Markdown，不产生额外的 Harness 摘要请求。API 既不提供最终重定向 URL，也不提供目标 HTTP 状态，共享结果也没有标题字段。提供方保留请求的 URL、返回 Markdown 主体，并对成功响应报告 HTTP 200：当 URL 不可用、被站点策略阻止、返回错误，或无法提取 Markdown 时，Fetch API 应答 404。2026-10-16，一个无法解析的主机却返回 HTTP 500，因此每个非成功状态都是检索失败，而不是具体的目标诊断。共享抓取结果及其消费方保持不变。

HTTP 提供方保留自己的公开地址校验、连接固定与资源限制。选择 DeepSeek 会把页面检索与目标访问策略委托给该服务；Harness 拒绝 API 请求的重定向，并保留取消与受限的工具输出。因此报告的 HTTP 200 表示该服务检索到了页面，而不是 Harness 观察到了目标响应。指南中的 Fetch 403 表示爬虫策略拒绝，404 表示没有可用的页面内容。

### 默认值迁移

在发布公告之后把默认值改为 Search API 是另一项变更。网关没有 `/v1/tools` 路由的部署需要在默认值改变之前显式设置 `web.searchProvider: deepseek-official`，已保存的 Messages 选择会继续使用 Messages。

### 附带的 Messages 修正

保留的 Messages 路径显式发送 `thinking: { type: 'disabled' }`，并在发出请求前记录同一请求体。这避免了在生成回答会被丢弃的辅助请求中做推理工作；它不实现也不控制新的检索 API。`tool_choice` 仍被省略。[持久化确认](../../../../docs/persistence-changes/2026-10-17-deepseek-search-thinking.zh.md)负责该可选日志字段的兼容性。

## 考虑过的替代方案

**只保留 Messages 作为唯一搜索实现。** 即使调用方只需要来源，它也会保留辅助生成与响应提取。直接 Search 消除了那次 Harness 模型请求，同时保留 Messages 作为一种显式模式。

**现在就改用 Search API 作为默认值。** 发布尚未公告，部分网关只暴露 Messages；这些用户会失去可用的搜索。

**复用 Messages 地址或推断路由前缀。** 协议与已部署前缀不同。独立基础地址保留现有配置，并避免把有效请求发到错误路由。

**要求显式填写 Search API 基础地址。** 打开开关本身就是显式选择，空默认值会让每个用户都去复制文档中的公开地址。其他部署仍可覆盖它。

**把两个 API 放在 Messages 提供方内部，用一个提供方私有开关控制。** `web-search-deepseek` 内部的开关无法改变抓取路由，因此打开它时 `web_fetch` 仍走 HTTP，除非用户同时修改 `web.fetchProvider`；它还会让两个 API 的生命周期绑定在 Messages 搜索上，而默认值迁移可能淘汰后者。分开注册让 web 服务既有的选择机制表达这个开关，且每个包可以独立变更或退役。

**在 Messages 搜索与新 API 之间共享一个传输层。** 两者都通过 `ctx.credentials` 解析凭据，因此共享模块只能省下派发与失败映射代码。它会让 Messages 包依赖新 API 包并绑定两者的发布，而默认值迁移可能淘汰 Messages 搜索。在此之前每个包保留自己的传输层。

**把 Search 与 Fetch 拆成两个包。** 指南由同一基础地址与同一凭据提供两个 API，且开关会同时选中它们；拆包会重复用户只编辑一次的设置。每个操作位于各自模块，任一 API 都可在不影响另一个的情况下变更。

**在设置下拉框中列出每个已注册提供方。** 通用提供方表单从 Config schema 派生编辑器，且需要提供方接口上的宿主侧展示元数据。页面只需要 DeepSeek 这一个选择，其他提供方保留各自的设置页。

**让模型把 `ori_question` 作为工具参数提供。** API 把该字段定义为用户的原始问题，而最近一条人类提示词已经记录了它。作为工具参数会改变所有搜索提供方共享的模型可见 schema，并诱发改写。

**打开开关时保留 HTTP 抓取。** 开关采用新的 DeepSeek 检索 API，而把抓取留在 HTTP 会让 Fetch API 的采用依赖手工修改 `web.fetchProvider`。HTTP 抓取及其自有访问策略在开关关闭时仍是选择，配置也仍可单独选择任一抓取提供方。

**新增抽取工具或拓宽抓取结果。** 该 API 把具体网页检索为 Markdown，符合既有抓取操作。成功已经意味着页面被检索，Markdown 主体携带页面标题，因此拓宽结果会为很小的模型可见收益改变每个抓取消费方。

## 后果

直接模式下检索不再需要辅助模型 token，但其结果仍占用主模型上下文。指南对 Search 与 Fetch 分别按每 1,000 次带结果的成功请求 5 元人民币计价；结果数量不改变单次请求价格。多个查询仍是多次请求。除非关闭 `sendOriginalQuestion`，Search API 模式还会在每次查询时把最多 128 个字符的用户提示词发送给搜索服务。

Search 与 Fetch 各自有账号级 5 QPS 限制，独立于模型并发，并在该账号的 API Key 之间共享。Fetch 还有目标域名限制。当前工具可以并发发出四个查询，并在任一查询失败时使整批失败。提供方没有共享限流调度、自动重试或回落；其他 Session 或进程可能耗尽同一账号额度。

## 验证与仍未采用的 API 能力

提供方测试覆盖请求映射、空结果、畸形响应、独立与默认基础地址、凭据解析、取消与空配置。设置测试与[插件配置浏览器场景](../../../../apps/web/tests/plugin-config.e2e.ts)覆盖分阶段保存、默认基础地址、开关的受阻状态与两项选择的切换。[网页搜索回放](../../../../apps/web/tests/web-search-round.e2e.ts)固定直接搜索的模型可见结果。设置 `DEEPSEEK_API_KEY` 与 `DEEPSEEK_SEARCH_API_TEST_BASE_URL` 时，[真实提供方测试](../../../../packages/web/web-deepseek-api/tests/web-deepseek-api.e2e.ts)会针对配置的基础地址运行 Search 与 Fetch。上文关于账号路由的观察来自上游记录的手工探测；QiLin 的提供方不发送账号令牌。

以下能力仍在该集成之外：

- 把面向模型的 `summary` 与展示用 `snippet` 分离，并设置逐来源与总量输出预算及相应 Session 记录。指南的典型摘要长度不是上限：2026-10-16 返回的摘要测得 1,000–2,300 个字符。
- 在提供方相应的工具指引中暴露搜索语法，并在转发前定义受限的本地化输入。API 的 `localization` 是 IP 地址，不是推断的城市或 UI 语言。
- 在定义选择策略之前保留质量元数据。`rerank_score` 与 `authority` 描述服务方评估，不保证真实性；硬性截断可能丢弃有用的细分来源。
- 增加可感知取消的调度与有界重试所有权。指南建议在重试 408、429 与 5xx 前等待；402 需要先充值，其他 4xx 需要修改请求。本地限速无法在无关进程之间强制账号级配额。
