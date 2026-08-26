"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BotIcon,
  CheckIcon,
  EyeIcon,
  CrownIcon,
  Loader2Icon,
  PlusIcon,
  SparklesIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createAgent, suggestAgentConfig, updateAgent } from "@/core/agents/api";
import type {
  Agent,
  AgentSuggestionResponse,
  CreateAgentRequest,
  ReasoningEffort,
  UpdateAgentRequest,
} from "@/core/agents/types";
import { useModels } from "@/core/models/hooks";
import { useSkills } from "@/core/skills/hooks";
import { cn } from "@/lib/utils";

/* ── form state ───────────────────────────────────────── */

interface AgentFormData {
  name: string;
  description: string;
  soul: string;
  toolGroups: string[];
  disallowedTools: string[];
  skills: string[];
  model: string; // "" = inherit
  thinkingEnabled: boolean | null;
  reasoningEffort: ReasoningEffort | null;
  maxTurns: string;
  timeoutSeconds: string;
  role: string;
}

const EMPTY_FORM: AgentFormData = {
  name: "",
  description: "",
  soul: "",
  toolGroups: [],
  disallowedTools: [],
  skills: [],
  model: "",
  thinkingEnabled: null,
  reasoningEffort: null,
  maxTurns: "",
  timeoutSeconds: "",
  role: "worker",
};

const MANUAL_STEP_TITLES = ["基本信息", "角色定义", "能力配置", "模型参数"];

const ROLE_OPTIONS = [
  {
    value: "worker",
    label: "Worker",
    labelCn: "执行者",
    icon: WrenchIcon,
    accent: "text-blue-500",
    bg: "bg-blue-500/10",
    recommended: true,
    desc: "独立完成具体任务",
    examples: "研究分析、代码编写、数据处理、文件操作",
  },
  {
    value: "orchestrator",
    label: "Orchestrator",
    labelCn: "编排者",
    icon: CrownIcon,
    accent: "text-amber-500",
    bg: "bg-amber-500/10",
    recommended: false,
    desc: "拆解复杂任务并分派给其他代理",
    examples: "多代理并行编排、复杂工作流调度",
  },
  {
    value: "reviewer",
    label: "Reviewer",
    labelCn: "审查者",
    icon: EyeIcon,
    accent: "text-emerald-500",
    bg: "bg-emerald-500/10",
    recommended: false,
    desc: "审查其他代理的产出质量",
    examples: "代码审查、结果验证、质量把关",
  },
];

const SOUL_TEMPLATES: Array<{ label: string; text: string }> = [
  {
    label: "研究员",
    text: "你是一个专业研究员。你的职责是深入分析问题，搜索相关信息，提供结构化、有数据支撑的研究报告。始终保持客观，标注信息来源。",
  },
  {
    label: "代码助手",
    text: "你是一个代码助手。你的职责是编写、审查和调试代码。遵循最佳实践，确保代码可读性、可维护性和性能。主动发现潜在问题并提供改进建议。",
  },
  {
    label: "数据分析师",
    text: "你是一个数据分析师。你的职责是查询数据、统计分析并生成可视化报告。善于从数据中发现趋势和异常，用清晰的图表和文字说明结论。",
  },
];

/* ── main dialog ──────────────────────────────────────── */

export function AgentWizardDialog({
  open,
  onOpenChange,
  agent,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: Agent | null;
  onSuccess: () => void;
}) {
  const isEdit = agent !== null;
  const hasAIStep = !isEdit;
  // When there's an AI guide step (create mode), manual steps are offset by 1.
  const stepOffset = hasAIStep ? 1 : 0;
  const displaySteps = hasAIStep ? ["AI 引导", ...MANUAL_STEP_TITLES] : MANUAL_STEP_TITLES;
  const totalSteps = displaySteps.length;

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<AgentFormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);

  const { models } = useModels({ enabled: open });
  const { skills: availableSkills } = useSkills();

  useEffect(() => {
    if (open) {
      setStep(0);
      setAiPrompt("");
      setAiLoading(false);
      setAiGenerated(false);
      if (agent) {
        setForm({
          name: agent.name,
          description: agent.description ?? "",
          soul: agent.soul ?? "",
          toolGroups: agent.tool_groups ?? [],
          disallowedTools: agent.disallowed_tools ?? [],
          skills: agent.skills ?? [],
          model: agent.model ?? "",
          thinkingEnabled: agent.thinking_enabled ?? null,
          reasoningEffort: agent.reasoning_effort ?? null,
          maxTurns: agent.max_turns != null ? String(agent.max_turns) : "",
          timeoutSeconds: agent.timeout_seconds != null ? String(agent.timeout_seconds) : "",
          role: agent.role ?? "worker",
        });
      } else {
        setForm(EMPTY_FORM);
      }
    }
  }, [open, agent]);

  const update = <K extends keyof AgentFormData>(key: K, value: AgentFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const canProceed = () => {
    if (step === stepOffset) return form.name.trim().length > 0;
    return true;
  };

  const handleAISuggest = async () => {
    if (aiPrompt.trim().length < 3) {
      toast.error("请先在上方文本框中描述你想要的代理（至少 3 个字符）");
      return;
    }
    setAiLoading(true);
    try {
      const suggestion: AgentSuggestionResponse = await suggestAgentConfig({
        description: aiPrompt.trim(),
      });
      setForm({
        name: suggestion.name,
        description: suggestion.description,
        soul: suggestion.soul,
        toolGroups: suggestion.tool_groups,
        disallowedTools: suggestion.disallowed_tools,
        skills: suggestion.skills,
        model: suggestion.model ?? "",
        thinkingEnabled: suggestion.thinking_enabled,
        reasoningEffort: suggestion.reasoning_effort,
        maxTurns: suggestion.max_turns != null ? String(suggestion.max_turns) : "",
        timeoutSeconds:
          suggestion.timeout_seconds != null
            ? String(suggestion.timeout_seconds)
            : "",
        role: suggestion.role,
      });
      setAiGenerated(true);
      setStep(stepOffset); // Jump to first manual step for review
      toast.success(
        `AI 已生成配置建议${suggestion.rationale ? `：${suggestion.rationale}` : ""}`,
      );
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "AI 生成失败，请稍后重试",
      );
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error("请填写代理名称");
      return;
    }
    setSubmitting(true);
    try {
      if (isEdit) {
        const req: UpdateAgentRequest = {
          description: form.description.trim() || null,
          model: form.model.trim() || null,
          tool_groups: form.toolGroups.length > 0 ? form.toolGroups : null,
          skills: form.skills.length > 0 ? form.skills : null,
          soul: form.soul.trim() || null,
          thinking_enabled: form.thinkingEnabled,
          reasoning_effort: form.reasoningEffort,
          max_turns: form.maxTurns.trim() ? Number(form.maxTurns) : null,
          timeout_seconds: form.timeoutSeconds.trim() ? Number(form.timeoutSeconds) : null,
          disallowed_tools: form.disallowedTools.length > 0 ? form.disallowedTools : null,
          role: form.role,
        };
        await updateAgent(agent.name, req);
        toast.success(`已更新代理「${agent.name}」`);
      } else {
        const req: CreateAgentRequest = {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          soul: form.soul.trim() || undefined,
          model: form.model.trim() || null,
          tool_groups: form.toolGroups.length > 0 ? form.toolGroups : null,
          skills: form.skills.length > 0 ? form.skills : null,
          thinking_enabled: form.thinkingEnabled,
          reasoning_effort: form.reasoningEffort,
          max_turns: form.maxTurns.trim() ? Number(form.maxTurns) : null,
          timeout_seconds: form.timeoutSeconds.trim() ? Number(form.timeoutSeconds) : null,
          disallowed_tools: form.disallowedTools.length > 0 ? form.disallowedTools : null,
          role: form.role,
        };
        await createAgent(req);
        toast.success(`已创建代理「${form.name.trim()}」`);
      }
      onOpenChange(false);
      onSuccess();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <BotIcon className="size-5 text-primary" />
            {isEdit ? `编辑代理「${agent?.name}」` : "新建代理"}
            {aiGenerated && (
              <Badge variant="secondary" className="gap-1">
                <SparklesIcon className="size-3" />
                AI 推荐
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex shrink-0 items-center gap-2 px-1 pb-3">
          {displaySteps.map((title, i) => (
            <div key={i} className="flex flex-1 items-center gap-2">
              <div
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors",
                  i === step
                    ? "bg-primary text-primary-foreground"
                    : i < step
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {i < step ? <CheckIcon className="size-3.5" /> : i + 1}
              </div>
              <span
                className={cn(
                  "text-xs",
                  i === step ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {title}
              </span>
              {i < displaySteps.length - 1 && (
                <div className="bg-border h-px flex-1" />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-48 flex-1 overflow-y-auto">
          {hasAIStep && step === 0 && (
            <StepAIGuide
              prompt={aiPrompt}
              setPrompt={setAiPrompt}
              loading={aiLoading}
            />
          )}
          {step === stepOffset + 0 && (
            <StepBasicInfo form={form} update={update} isEdit={isEdit} />
          )}
          {step === stepOffset + 1 && <StepSoul form={form} update={update} />}
          {step === stepOffset + 2 && (
            <StepCapabilities
              form={form}
              update={update}
              availableSkills={availableSkills.map((s) => s.name)}
            />
          )}
          {step === stepOffset + 3 && (
            <StepModel
              form={form}
              update={update}
              models={models.map((m) => m.name)}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={submitting || aiLoading}
          >
            取消
          </Button>
          {hasAIStep && step === 0 ? (
            // AI guide step: special footer with skip + generate buttons
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStep(stepOffset)}
                disabled={aiLoading}
              >
                跳过，手动填写
                <ArrowRightIcon className="size-3.5" />
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleAISuggest}
                disabled={aiLoading}
              >
                {aiLoading ? (
                  <>
                    <Loader2Icon className="size-3.5 animate-spin" />
                    正在分析…
                  </>
                ) : (
                  <>
                    <SparklesIcon className="size-3.5" />
                    AI 生成
                  </>
                )}
              </Button>
            </div>
          ) : (
            // Normal navigation footer
            <div className="flex gap-2">
              {step > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setStep((s) => s - 1)}
                  disabled={submitting}
                >
                  <ArrowLeftIcon className="size-3.5" />
                  上一步
                </Button>
              )}
              {step < totalSteps - 1 ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setStep((s) => s + 1)}
                  disabled={!canProceed()}
                >
                  下一步
                  <ArrowRightIcon className="size-3.5" />
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2Icon className="size-3.5 animate-spin" />
                      保存中…
                    </>
                  ) : isEdit ? (
                    "保存"
                  ) : (
                    "创建"
                  )}
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Step 0: AI Guide (create-only) ────────────────────── */

function StepAIGuide({
  prompt,
  setPrompt,
  loading,
}: {
  prompt: string;
  setPrompt: (v: string) => void;
  loading: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Auto-focus the textarea so the user can start typing immediately.
    textareaRef.current?.focus();
  }, []);

  const charCount = prompt.trim().length;
  const tooShort = charCount > 0 && charCount < 3;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
        <SparklesIcon className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="space-y-1">
          <p className="text-sm font-medium">AI 引导创建</p>
          <p className="text-xs text-muted-foreground">
            用自然语言描述你想要的代理，AI 将为你生成完整的配置建议。你可以在后续步骤中审阅和修改。
          </p>
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="ai-prompt" className="text-sm font-medium">
          描述你想要的代理
        </label>
        <Textarea
          ref={textareaRef}
          id="ai-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            "例如：我需要一个能做金融数据分析的代理，擅长使用 Tushare 获取数据，能生成可视化报告"
          }
          className="min-h-24 resize-y"
          disabled={loading}
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            描述越详细，AI 生成的配置越准确。包含角色、用途、所需工具等信息效果更好。
          </p>
          <span
            className={cn(
              "shrink-0 text-xs tabular-nums",
              tooShort ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {charCount} 字
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Step 1: Basic Info ──────────────────────────────────── */

function StepBasicInfo({
  form,
  update,
  isEdit,
}: {
  form: AgentFormData;
  update: <K extends keyof AgentFormData>(key: K, value: AgentFormData[K]) => void;
  isEdit: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="agent-name" className="text-sm font-medium">
          名称 <span className="text-destructive">*</span>
        </label>
        <Input
          id="agent-name"
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          disabled={isEdit}
          placeholder="如：financial-analyst"
          className="h-9"
        />
        <p className="text-xs text-muted-foreground">
          只允许字母、数字和连字符（-），创建后不可修改
        </p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="agent-desc" className="text-sm font-medium">
          描述
        </label>
        <Input
          id="agent-desc"
          value={form.description}
          onChange={(e) => update("description", e.target.value)}
          placeholder="该代理的用途说明"
          className="h-9"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">编排角色</label>
        <p className="text-xs text-muted-foreground">
          角色决定该代理在多代理编排中的定位。大多数场景选择「执行者」即可。
        </p>
        <div className="grid gap-2">
          {ROLE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isSelected = form.role === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => update("role", opt.value)}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border hover:bg-muted/50",
                )}
              >
                <div
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg",
                    opt.bg,
                  )}
                >
                  <Icon className={cn("size-4.5", opt.accent)} />
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">{opt.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {opt.labelCn}
                    </span>
                    {opt.recommended && (
                      <Badge variant="secondary" className="text-[10px]">
                        推荐
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  <p className="text-[11px] text-muted-foreground/70">
                    适用：{opt.examples}
                  </p>
                </div>
                {isSelected && (
                  <CheckIcon className="text-primary mt-0.5 size-4 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Step 2: Soul / System Prompt ─────────────────────── */

function StepSoul({
  form,
  update,
}: {
  form: AgentFormData;
  update: <K extends keyof AgentFormData>(key: K, value: AgentFormData[K]) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <span className="text-xs text-muted-foreground">快捷模板：</span>
        {SOUL_TEMPLATES.map((tpl) => (
          <Badge
            key={tpl.label}
            variant="outline"
            className="cursor-pointer hover:bg-muted/50"
            onClick={() => update("soul", tpl.text)}
          >
            {tpl.label}
          </Badge>
        ))}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="agent-soul" className="text-sm font-medium">
          系统提示词 (Soul)
        </label>
        <Textarea
          id="agent-soul"
          value={form.soul}
          onChange={(e) => update("soul", e.target.value)}
          placeholder="定义该代理的行为、角色和工作方式。这段文字会作为系统提示词注入代理的 LLM 调用…"
          className="min-h-32 max-h-[45vh] resize-y"
        />
        <p className="text-xs text-muted-foreground">
          即 SOUL.md 内容。良好的系统提示词应包含：角色定位、工作范围、输出格式要求、约束条件
        </p>
      </div>
    </div>
  );
}

/* ── Step 3: Capabilities ─────────────────────────────── */

function StepCapabilities({
  form,
  update,
  availableSkills,
}: {
  form: AgentFormData;
  update: <K extends keyof AgentFormData>(key: K, value: AgentFormData[K]) => void;
  availableSkills: string[];
}) {
  return (
    <div className="space-y-4">
      <TagInput
        label="工具组 (tool_groups)"
        description="允许该代理使用的工具分组。留空表示继承全部工具"
        tags={form.toolGroups}
        onChange={(tags) => update("toolGroups", tags)}
        suggestions={["read_file", "edit_file", "bash", "web_search", "read_url", "write_file", "glob", "grep", "task"]}
        placeholder="输入工具名，回车添加"
      />
      <TagInput
        label="禁用工具 (disallowed_tools)"
        description="显式禁止该代理使用的工具（黑名单，优先级高于工具组白名单）"
        tags={form.disallowedTools}
        onChange={(tags) => update("disallowedTools", tags)}
        suggestions={["task", "bash", "web_search"]}
        placeholder="输入工具名，回车添加"
      />
      <TagInput
        label="技能 (skills)"
        description="该代理可用的技能列表。留空表示继承全部已启用技能"
        tags={form.skills}
        onChange={(tags) => update("skills", tags)}
        suggestions={availableSkills}
        placeholder="输入技能名，回车添加"
      />
    </div>
  );
}

/* ── Step 4: Model Parameters ─────────────────────────── */

function StepModel({
  form,
  update,
  models,
}: {
  form: AgentFormData;
  update: <K extends keyof AgentFormData>(key: K, value: AgentFormData[K]) => void;
  models: string[];
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">模型</label>
        <Select
          value={form.model || "__inherit__"}
          onValueChange={(v) => update("model", v === "__inherit__" ? "" : v)}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="继承默认模型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__inherit__">继承默认模型</SelectItem>
            {models.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
        <div className="min-w-0">
          <span className="text-sm font-medium">思维模式 (thinking)</span>
          <p className="text-xs text-muted-foreground">
            启用后允许模型进行深度推理（需模型支持）
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={form.thinkingEnabled === null ? "secondary" : "outline"}
            className="h-7 px-2 text-xs"
            onClick={() => update("thinkingEnabled", null)}
          >
            默认
          </Button>
          <Button
            size="sm"
            variant={form.thinkingEnabled === true ? "secondary" : "outline"}
            className="h-7 px-2 text-xs"
            onClick={() => update("thinkingEnabled", true)}
          >
            开启
          </Button>
          <Button
            size="sm"
            variant={form.thinkingEnabled === false ? "secondary" : "outline"}
            className="h-7 px-2 text-xs"
            onClick={() => update("thinkingEnabled", false)}
          >
            关闭
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">推理力度 (reasoning_effort)</label>
        <Select
          value={form.reasoningEffort ?? "__default__"}
          onValueChange={(v) =>
            update("reasoningEffort", v === "__default__" ? null : (v as ReasoningEffort))
          }
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="默认" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__default__">默认</SelectItem>
            <SelectItem value="low">low - 最小推理</SelectItem>
            <SelectItem value="medium">medium - 中等推理</SelectItem>
            <SelectItem value="high">high - 深度推理</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="agent-max-turns" className="text-sm font-medium">
            最大轮次
          </label>
          <Input
            id="agent-max-turns"
            type="number"
            value={form.maxTurns}
            onChange={(e) => update("maxTurns", e.target.value)}
            placeholder="留空使用默认值"
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="agent-timeout" className="text-sm font-medium">
            超时（秒）
          </label>
          <Input
            id="agent-timeout"
            type="number"
            value={form.timeoutSeconds}
            onChange={(e) => update("timeoutSeconds", e.target.value)}
            placeholder="留空使用默认值"
            className="h-9"
          />
        </div>
      </div>
    </div>
  );
}

/* ── Reusable Tag Input ───────────────────────────────── */

function TagInput({
  label,
  description,
  tags,
  onChange,
  suggestions,
  placeholder,
}: {
  label: string;
  description?: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput("");
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  const filteredSuggestions = (suggestions ?? []).filter(
    (s) => !tags.includes(s) && s.toLowerCase().includes(input.toLowerCase()),
  );

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5">
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1">
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="hover:text-destructive"
            >
              <XIcon className="size-3" />
            </button>
          </Badge>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag(input);
            }
            if (e.key === "Backspace" && !input && tags.length > 0) {
              removeTag(tags[tags.length - 1]!);
            }
          }}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {filteredSuggestions.length > 0 && input && (
        <div className="flex flex-wrap gap-1">
          {filteredSuggestions.slice(0, 8).map((s) => (
            <Badge
              key={s}
              variant="outline"
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => addTag(s)}
            >
              <PlusIcon className="size-2.5" />
              {s}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
