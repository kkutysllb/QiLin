/**
 * 模型配置模板。
 *
 * 模板根据后端引擎能力（qilin.models 包下的 patched/native provider）和
 * config.example.yaml 的示例整理。点击模板卡片时预填 `use`（provider）等
 * 字段，用户只需补全 api_key / model / base_url 即可创建。
 *
 * 维护原则：
 * - provider 路径必须对应后端实际存在的模块（见 qilin/qilin/models/*.py）。
 * - patched_* 前缀表示该 provider 对 thinking/reasoning_content 做了适配补丁。
 * - 新增后端 provider 后，在此追加一个模板即可。
 */

export type ModelEndpointField = "api_base" | "base_url" | "native";

export interface ModelTemplate {
  /** 模板唯一 id。 */
  id: string;
  /** 卡片展示名称。 */
  name: string;
  /** 家族/分类标签（用于卡片副标题）。 */
  family: string;
  /** Provider 类路径，预填到表单 use 字段。 */
  provider: string;
  /** 推荐模型 id，预填到表单 model 字段。 */
  model: string;
  /** base_url 用哪个字段承载（决定表单提示文案）。 */
  endpointField: ModelEndpointField;
  /** 推荐端点 URL，预填到对应字段。 */
  endpoint: string;
  /** api key 环境变量提示。 */
  apiKeyEnv: string;
  /** 是否支持思考模式。 */
  thinking: boolean;
  /** 是否支持推理深度（reasoning effort）。 */
  reasoningEffort?: boolean;
  /** 是否支持视觉输入。 */
  vision: boolean;
  /** 卡片说明文案。 */
  note: string;
}

export const MODEL_TEMPLATES: ModelTemplate[] = [
  {
    id: "deepseek",
    name: "DeepSeek / 火山 / Kimi",
    family: "DeepSeek reasoning",
    provider: "qilin.models.patched_deepseek:PatchedChatDeepSeek",
    model: "deepseek-v4-pro",
    endpointField: "api_base",
    endpoint: "https://api.deepseek.com",
    apiKeyEnv: "$DEEPSEEK_API_KEY",
    thinking: true,
    vision: false,
    note: "保留 reasoning_content，适合 DeepSeek、火山 Coding Plan、Kimi thinking 兼容入口。",
  },
  {
    id: "gemini-openai",
    name: "Gemini / Qwen 兼容",
    family: "OpenAI compatible thinking",
    provider: "qilin.models.patched_openai:PatchedChatOpenAI",
    model: "google/gemini-2.5-pro-preview",
    endpointField: "base_url",
    endpoint: "https://openrouter.ai/api/v1",
    apiKeyEnv: "$OPENROUTER_API_KEY",
    thinking: true,
    vision: true,
    note: "保留 Gemini thought_signature，适合 OpenAI 兼容网关里的思考模型。",
  },
  {
    id: "mimo",
    name: "小米 MiMo",
    family: "MiMo reasoning",
    provider: "qilin.models.patched_mimo:PatchedChatMiMo",
    model: "mimo-v2.5-pro",
    endpointField: "base_url",
    endpoint: "https://api.xiaomimimo.com/v1",
    apiKeyEnv: "$MIMO_API_KEY",
    thinking: true,
    vision: false,
    note: "为 MiMo reasoning_content 回放做适配。",
  },
  {
    id: "stepfun",
    name: "阶跃星辰 StepFun",
    family: "StepFun reasoning",
    provider: "qilin.models.patched_stepfun:PatchedChatStepFun",
    model: "step-3.7-flash",
    endpointField: "base_url",
    endpoint: "https://api.stepfun.com/v1",
    apiKeyEnv: "$STEPFUN_API_KEY",
    thinking: true,
    vision: true,
    note: "默认开启 deepseek-style reasoning_format。",
  },
  {
    id: "minimax",
    name: "MiniMax",
    family: "MiniMax reasoning",
    provider: "qilin.models.patched_minimax:PatchedChatMiniMax",
    model: "MiniMax-M3",
    endpointField: "base_url",
    endpoint: "https://api.minimax.io/v1",
    apiKeyEnv: "$MINIMAX_API_KEY",
    thinking: true,
    vision: true,
    note: "启用 reasoning_split，并兼容 MiniMax 消息格式。",
  },
  {
    id: "claude",
    name: "Claude",
    family: "Anthropic native",
    provider: "qilin.models.claude_provider:ClaudeChatModel",
    model: "claude-sonnet-4-20250514",
    endpointField: "native",
    endpoint: "",
    apiKeyEnv: "$ANTHROPIC_API_KEY",
    thinking: true,
    vision: true,
    note: "使用 QiLin Claude 包装器，支持扩展 thinking 参数。",
  },
  {
    id: "codex",
    name: "OpenAI Codex",
    family: "Codex style",
    provider: "qilin.models.openai_codex_provider:CodexChatModel",
    model: "gpt-5.4",
    endpointField: "native",
    endpoint: "",
    apiKeyEnv: "$OPENAI_API_KEY",
    thinking: true,
    reasoningEffort: true,
    vision: false,
    note: "QiLin 内置 Codex 风格 provider，支持 reasoning effort。",
  },
  {
    id: "vllm",
    name: "自托管 vLLM",
    family: "Self hosted",
    provider: "qilin.models.vllm_provider:VllmChatModel",
    model: "Qwen/Qwen3-32B",
    endpointField: "base_url",
    endpoint: "http://localhost:8000/v1",
    apiKeyEnv: "$VLLM_API_KEY",
    thinking: true,
    vision: false,
    note: "适合本地或私有推理服务。",
  },
  {
    id: "mindie",
    name: "华为 MindIE",
    family: "Enterprise inference",
    provider: "qilin.models.mindie_provider:MindIEChatModel",
    model: "Qwen3-Coder-480B-A35B-Instruct-Client",
    endpointField: "base_url",
    endpoint: "http://localhost:8989/v1",
    apiKeyEnv: "$MINDIE_API_KEY",
    thinking: false,
    vision: false,
    note: "面向企业私有化推理服务。",
  },
  {
    id: "openai-standard",
    name: "OpenAI 标准",
    family: "OpenAI native",
    provider: "langchain_openai:ChatOpenAI",
    model: "gpt-4",
    endpointField: "base_url",
    endpoint: "https://api.openai.com/v1",
    apiKeyEnv: "$OPENAI_API_KEY",
    thinking: false,
    vision: true,
    note: "标准 OpenAI 兼容接口，适合官方或自建网关。",
  },
];

/** 「空白自定义」模板占位 id。 */
export const CUSTOM_TEMPLATE_ID = "__custom__";
