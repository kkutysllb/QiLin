---
description: "DeepSeek Search 与 Fetch API 提供方：共享的认证与传输、端点配置与归一化结果。"
kind: "package-reference"
---

# @qilin-agent/web-deepseek-api

[English](README.md) | 中文

## 概述

通过 DeepSeek Search 与 Fetch API 搜索网页、抓取网页正文：每个操作一次直接请求，不需要辅助模型轮次。插件注册 `deepseek-search-api` 与 `deepseek-fetch-api`，两者共享同一凭据与同一 API 基础地址，并在每次操作解析 API Key 完成认证。搜索返回标题、URL、可用的摘要与可用的发布日期；Fetch 返回网页 Markdown。Messages 搜索仍由 [qilin-web-search-deepseek](../web-search-deepseek/README.zh.md) 提供；面向模型的工具位于 [qilin-tool-web](../tool-web/README.zh.md)。

## 目录

- [使用本包](#use-this-package)
- [了解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

把插件与 `qilin-web` 一起挂载并选择它的提供方。随包部署挂载它，同时仍选择 Messages 搜索与本地 HTTP 抓取。在 **Plugins > Built-in plugin settings > Web search** 打开 **启用新版 Web 搜索 API** 并保存，会同时选中本包的两个提供方；关闭后恢复随包选择。保存的选择作用于下一次操作。

```yaml
- name: '@qilin-agent/web'
  config:
    searchProvider: deepseek-search-api
    fetchProvider: deepseek-fetch-api
- name: '@qilin-agent/web-deepseek-api'
  config:
    apiKeyEnv: DEEPSEEK_API_KEY
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `apiKey` | 省略 | 字面 API Key；优先使用凭据引用 |
| `apiKeyEnv` | `DEEPSEEK_API_KEY` | 每次操作解析的凭据引用 |
| `baseURL` | `https://api.deepseek.com/v1/tools` | Search 与 Fetch API 的基础地址（含部署的路径前缀）；程序追加 `/search` 或 `/fetch` |
| `count` | `10` | 每次搜索的 Search API 结果数，1 到 50 的整数；请求上更小的 `maxResults` 优先 |
| `sendOriginalQuestion` | `true` | 把触发搜索的用户提示词截断到 128 个字符后作为 Search API 的 `ori_question` 发送 |

`baseURL` 必须填写完整 API 基础地址：包含路径前缀、不含操作名。默认值会请求 `https://api.deepseek.com/v1/tools/search` 与 `https://api.deepseek.com/v1/tools/fetch`；使用其他前缀（例如 `/api/v1/tools`）的部署需要填写自己的完整地址。

用 `DEEPSEEK_API_KEY` 与 `DEEPSEEK_SEARCH_API_TEST_BASE_URL` 运行真实 API 测试：两者都必须提供，后者包含 API 路径前缀。

### 认证

非空字面 `apiKey` 优先于 `apiKeyEnv`；凭据引用经 `ctx.credentials` 解析，该服务缺席时回落到启动环境。请求携带 `Authorization: Bearer`。凭据解析与端点选择共享同一份设置快照。QiLin 不提供账号令牌路径，因此每个操作都用该 Key 认证。

### 结果与失败

Search API 接收 `query`、`count`（配置的条数，或请求上更小的 `maxResults`）、`need_content: false`，以及 `ori_question`（`sendOriginalQuestion` 关闭时省略）：发起 Session 最近一条人类提示词的文本，空白折叠后截断到 128 个字符。不在 Session 内或没有此类提示词时省略。提供方直接映射 `results[].snippet`，把可为 null 的 `date` 映射为可选 `publishedAt`。结果数组为空视为成功。Fetch 发送 `url`，把原始 Markdown 作为文本主体返回，状态码为 HTTP 200，因为目标没有可用内容时 API 会以错误状态应答。其 URL 就是请求的 URL：API 不报告最终重定向地址。

`baseURL` 为空或不可解析会使两个提供方不可用；`count` 超出 1 到 50 会使搜索不可用。凭据缺失以 `WEB_PROVIDER_CREDENTIAL_MISSING` 失败；取消使用 `WEB_ABORTED`；传输、HTTP 与畸形响应失败使用 `WEB_PROVIDER_ERROR`。重定向会在接触目标之前被拒绝。Fetch API 的非成功状态是检索失败，不是目标页面的状态。请求发出后的失败会指出端点与 `baseURL` 设置字段。不进行自动重试，也不回落到其他提供方。

-----

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>实现细节——点击展开</summary>

[插件](src/index.ts)在每次操作读取一次设置并注册两个提供方。[Search 提供方](src/search.ts)在返回服务结果前校验响应 JSON；[Fetch 提供方](src/fetch.ts)校验 Markdown 主体。[传输层](src/transport.ts)负责凭据解析、取消、重定向拒绝与失败指引。Search 与 Fetch API 调用不产生辅助请求事件：Search API 不需要辅助模型轮次，因此没有需要记录的请求。工具调用与结果保持常规的 Session 记录。

服务类型见 [web 子系统](../../../docs/subsystems/web.zh.md)，受限的模型输出见 [tool-web](../tool-web/README.zh.md)。

</details>

-----

<a id="model-experience"></a>
## 模型体验

### 会话工具结果

#### 模型看到的内容

`web_search` 与 `web_fetch` 工具会附带外部内容提示渲染来源或 Markdown。Fetch 结果携带请求的 URL 与 HTTP 200。错误保留可执行的凭据或端点指引。搜索把查询与触发问题直接发送给 Search API。

#### Token 影响

不消耗辅助模型 token。会话结果 token 随返回的摘要或 Markdown 规模变化，并由消费方设上限。API 检索计费独立于模型 token。

#### KV Cache 影响

工具结果追加在已有会话前缀之后。提供方注册不增加模型上下文。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- 共享的搜索请求不暴露 `localization`；提供方只请求摘要，不使用 `summary`、`site_name`、`site_icon` 或完整搜索内容。
- 提供方发送 `ori_question`，因为指南把它记录为意图信号；适配器不消费任何按它排序的响应项。
- API 的查询与 URL 约束由远端服务执行。Fetch 不暴露目标状态，也不暴露最终重定向 URL，因此结果报告 HTTP 200 与请求的 URL；提供方丢弃 API 的页面标题。
- 可用性检查无法查询异步凭据存储。已配置的解析器在调用时仍可能以凭据缺失错误失败。

<a id="dev-note"></a>
### 开发备注

无。
