---
description: "DeepSeek API key 鉴权、模型发现与官方模型列表。"
kind: "package-reference"
---

# @qilin-agent/llm-deepseek-api-key

[English](README.md) | 中文

## 概述

为 `deepseek-official` 注册鉴权、模型发现与官方模型列表。通过 [llm-deepseek](../llm-deepseek/README.zh.md) 共用 Messages 请求实现；本包拥有凭据解析、目录可用性与模型准入判断。

鉴权解析将验证后的 API key 放入 `x-api-key`，供 Messages 和 Files 请求共同使用。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用此包

`apiKeyEnv` 默认为 `DEEPSEEK_API_KEY`，在每次请求时解析凭据。已组合 credentials 服务时，按其优先级解析；只有未组合该服务时才直接读取启动环境。请求时凭据缺失以 `MISSING_CREDENTIAL` 失败；格式错误以 `INVALID_CREDENTIAL` 失败。模型发现始终返回配置的目录，不依赖凭据。

```yaml
- id: llm-deepseek
  name: '@qilin-agent/llm-deepseek-api-key'
  config:
    reasoningEffort: high
    apiKeyEnv: DEEPSEEK_API_KEY
```

端点和凭据引用来自同一次配置解析；进行中的请求保留该快照，后续配置更新仅影响后续请求。账号登录态不影响该路由使用的凭据。

`models` 是该 provider 独立的可配置目录；默认值和协议能力来自共享传输包。当 `models` 等于内置目录且 Messages 源站是官方 API `https://api.deepseek.com` 时，路由改为沿用官方 `GET https://api.deepseek.com/models` 列表。列表请求以 `x-api-key` 携带 API key、以 harness `User-Agent` 标识自身，并拒绝重定向；没有 API key 时路由不发起请求。其他端点（包括由 `baseURL` 或 `$DEEPSEEK_BASE_URL` 指定的端点）只使用 `models`，不请求列表。目录判断不探测推理端点。

首次访问最多等待 `modelsTimeoutMs`；后续访问使用已加载的列表，并在其超过 `modelsMaxAgeMs` 后在后台刷新；空闲路由不发送请求。失败或为空的列表保留上一份；在任何列表加载成功前，路由使用当前版本的内置目录（`deepseek-flash` 与 `deepseek-v4-pro`）。列表返回 HTTP 401 只让本次加载失败。每次成功加载、连续失败中的第一次失败（连同回退目录）、以及每个因声明不可读或不可用而被隐藏的列表条目，都会带 `[llm-deepseek-api-key]` 标签写入 stderr；stdout 保留给协议消息，日志不包含任何密钥。

列表中的模型被提供，与本版本条目合并，并在任何网络 I/O 之前以 `CLIENT_UPGRADE_REQUIRED` 或 `MODEL_UNSUPPORTED` 拒绝；条目可声明本产品 token 或上游 `deepseek-harness` token 的客户端要求，本产品 token 优先。列表未列出的模型 id 原样通过。

与内置目录不同的 `models` 列表会替换目录并停止列表请求；Models 页面把编辑后的目录存放在这里。移除该列表（如 Models 页面的**恢复默认**）会让路由回到列表模式，下次访问即便缓存仍新鲜也会重新加载。与内置目录完全相同的列表视为未自定义。

| 字段 | 默认值 | 含义 |
|---|---|---|
| `modelsTimeoutMs` | `5,000` | 单次列表请求与首次访问等待的截止时间 |
| `modelsMaxAgeMs` | `600,000` | 列表超过该时长后下次访问在后台刷新；失败的加载以同样时长重试 |

设置命名空间采用 Cordis entry id，没有 entry 时采用插件名。产品保留 official 的 `llm-deepseek` entry id。

<a id="understand-the-implementation"></a>
## 理解实现

注册和监听随插件生命周期释放，释放会中止进行中的列表请求。共享 Host 绑定提供附件访问、请求扩展、匿名标识和重试策略的原子更新；本包只注册自己的路由，并通过传输的 `connect` 与 `admit` 钩子承载列表目录与准入判断。列表请求、缓存与目录解析来自共享传输包；缓存在内存中，以端点与 key 的 SHA-256 为键，因此另一把 key 会加载自己的列表。`loader/volatile-update` 监听在路由开始或停止沿用列表时丢弃缓存。

<a id="further-exploration"></a>
## 进一步探索

[LLM streaming](../../../docs/subsystems/llm-streaming.zh.md) · [Messages](../llm-deepseek/README.zh.md)

<a id="model-experience"></a>
## 模型体验

### 已鉴权的模型请求

#### What the model sees

`deepseek-official` 请求不包含本插件添加的模型可见文本；请求由共享 Messages 传输序列化。

#### Token effect

鉴权和目录过滤不增加输入 token；实际调用的 token 由所选模型与请求内容决定。

#### KV Cache effect

凭据与目录可用性不进入模型输入；协议传输拥有请求前缀的序列化。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 目录是配置元数据，不验证远端是否接受模型；实际调用仍可能失败。

<a id="dev-note"></a>
### 开发备注

注册与鉴权的测试也覆盖共享传输包中的 Loader 组合场景。
