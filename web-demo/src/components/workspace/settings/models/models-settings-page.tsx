"use client";

import {
  AlertTriangleIcon,
  BoxesIcon,
  CpuIcon,
  Edit2Icon,
  EyeIcon,
  EyeOffIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  loadModels,
  createModel,
  updateModel,
  deleteModel,
} from "@/core/models/api";
import type { Model, ModelRequest } from "@/core/models/types";
import { cn } from "@/lib/utils";

import {
  CUSTOM_TEMPLATE_ID,
  MODEL_TEMPLATES,
  type ModelTemplate,
} from "./model-templates";

const labelCls =
  "text-muted-foreground text-xs leading-none";
const hintCls = "text-muted-foreground/70 mt-0.5 text-[11px] leading-relaxed";

/** 将模板转换为 ModelRequest 初始值（预填 provider 等字段）。 */
function templateToRequest(tpl: ModelTemplate): Partial<ModelRequest> {
  const isNative = tpl.endpointField === "native";
  return {
    name: tpl.id,
    display_name: tpl.name,
    use: tpl.provider,
    model: tpl.model,
    base_url: isNative ? null : tpl.endpoint,
    endpoint_field: isNative ? null : tpl.endpointField,
    api_key: tpl.apiKeyEnv,
    supports_thinking: tpl.thinking,
    supports_vision: tpl.vision,
    supports_reasoning_effort: Boolean(tpl.reasoningEffort),
  };
}

export function ModelsSettingsPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 内联展开表单状态
  const [activeTemplate, setActiveTemplate] = useState<ModelTemplate | null>(
    null,
  );
  const [editingModel, setEditingModel] = useState<Model | null>(null);

  const [deletingModel, setDeletingModel] = useState<Model | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadModels();
      setModels(data.models);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleEdit = (model: Model) => {
    setEditingModel(model);
    setActiveTemplate(null);
  };

  const handleDelete = async () => {
    if (!deletingModel) return;
    const target = deletingModel;
    setDeleting(true);
    setModels((prev) => prev.filter((m) => m.name !== target.name));
    setDeletingModel(null);
    try {
      await deleteModel(target.name);
      await refresh();
      toast.success(`模型「${target.name}」已删除`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
      setModels((prev) =>
        prev.some((m) => m.name === target.name) ? prev : [...prev, target],
      );
    } finally {
      setDeleting(false);
    }
  };

  const handlePickTemplate = (tpl: ModelTemplate | null) => {
    setActiveTemplate(tpl);
    setEditingModel(null);
  };

  const handleSaveInline = async (req: ModelRequest) => {
    if (editingModel) {
      await updateModel(editingModel.name, req);
      toast.success(`模型「${req.name}」已更新`);
      setEditingModel(null);
    } else {
      await createModel(req);
      toast.success(`模型「${req.name}」已创建`);
      setActiveTemplate(null);
    }
    await refresh();
  };

  const handleCancelInline = () => {
    setActiveTemplate(null);
    setEditingModel(null);
  };

  return (
    <div className="space-y-6">
      {/* ── 已配置模型 ── */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            已配置模型（{models.length}）
          </h3>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="bg-muted/30 h-14 animate-pulse rounded-lg border"
              />
            ))}
          </div>
        ) : error ? (
          <div className="border-destructive/20 bg-destructive/5 flex items-center justify-between gap-2 rounded-lg border px-4 py-3">
            <p className="text-destructive text-sm">{error}</p>
            <Button variant="outline" size="sm" onClick={refresh}>
              重试
            </Button>
          </div>
        ) : models.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center">
            <div className="flex size-10 items-center justify-center rounded-xl bg-cyan-500/10">
              <CpuIcon className="size-5 text-cyan-500" />
            </div>
            <div>
              <p className="text-sm font-medium">尚未配置模型</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                从下方模板卡片快速创建，或点击「空白自定义」
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            {models.map((model, idx) => (
              <div
                key={model.name}
                className={cn(
                  "hover:bg-muted/40 flex items-center gap-3 px-4 py-2.5 transition-colors",
                  idx > 0 && "border-t",
                )}
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-500">
                  <CpuIcon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate text-sm font-medium">
                      {model.display_name || model.name}
                    </span>
                    {model.supports_thinking && (
                      <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                        思考
                      </span>
                    )}
                    {model.supports_vision && (
                      <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-400">
                        视觉
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground truncate font-mono text-xs">
                    {model.model}
                    <span className="mx-1">·</span>
                    <span className="opacity-60">{model.use}</span>
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="hover:bg-cyan-500/10 hover:text-cyan-500 size-7"
                    onClick={() => handleEdit(model)}
                  >
                    <Edit2Icon className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="hover:bg-destructive/10 hover:text-destructive size-7"
                    onClick={() => setDeletingModel(model)}
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 内联展开编辑表单（编辑已有模型） ── */}
      {editingModel && (
        <InlineModelForm
          key={`edit-${editingModel.name}`}
          mode="edit"
          model={editingModel}
          onSave={handleSaveInline}
          onCancel={handleCancelInline}
        />
      )}

      {/* ── 模板卡片 ── */}
      {!editingModel && (
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              从模板创建
            </h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                handlePickTemplate({
                  id: CUSTOM_TEMPLATE_ID,
                  name: "空白自定义",
                  family: "Custom",
                  provider: "",
                  model: "",
                  endpointField: "base_url",
                  endpoint: "",
                  apiKeyEnv: "",
                  thinking: false,
                  vision: false,
                  note: "手动填写全部字段",
                })
              }
              className="h-7 gap-1 px-2 text-xs"
            >
              <PlusIcon className="size-3" />
              空白自定义
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {MODEL_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => handlePickTemplate(tpl)}
                className={cn(
                  "group flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-all hover:border-primary/40 hover:shadow-sm",
                  activeTemplate?.id === tpl.id && "border-primary ring-primary/20 ring-1",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex size-7 items-center justify-center rounded-md bg-gradient-to-br from-cyan-500/10 to-blue-500/10 text-cyan-600 dark:text-cyan-400">
                      <SparklesIcon className="size-3.5" />
                    </div>
                    <span className="text-sm font-semibold">{tpl.name}</span>
                  </div>
                  <div className="flex gap-0.5">
                    {tpl.thinking && (
                      <span className="rounded bg-amber-500/10 px-1 py-0.5 text-[9px] font-medium text-amber-600 dark:text-amber-400">
                        思考
                      </span>
                    )}
                    {tpl.vision && (
                      <span className="rounded bg-sky-500/10 px-1 py-0.5 text-[9px] font-medium text-sky-600 dark:text-sky-400">
                        视觉
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-muted-foreground text-[11px] font-medium">
                  {tpl.family}
                </p>
                <p className="text-muted-foreground/70 text-[11px] leading-relaxed line-clamp-2">
                  {tpl.note}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── 内联展开创建表单 ── */}
      {activeTemplate && !editingModel && (
        <InlineModelForm
          key={`create-${activeTemplate.id}`}
          mode="create"
          template={activeTemplate}
          onSave={handleSaveInline}
          onCancel={handleCancelInline}
        />
      )}

      {/* ── 删除确认 ── */}
      <Dialog
        open={!!deletingModel}
        onOpenChange={(open) => {
          if (!open) setDeletingModel(null);
        }}
      >
        <DialogContent className="p-0">
          <div className="h-1.5 w-full rounded-t-lg bg-gradient-to-r from-red-400 to-rose-400" />
          <DialogHeader className="px-6 pt-4">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="flex size-8 items-center justify-center rounded-lg bg-red-500/10 text-red-500">
                <AlertTriangleIcon className="size-4" />
              </span>
              删除模型
            </DialogTitle>
            <DialogDescription className="pl-10">
              确定要删除模型 &ldquo;{deletingModel?.name}&rdquo;
              吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="px-6 pb-5">
            <Button
              variant="outline"
              onClick={() => setDeletingModel(null)}
              disabled={deleting}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "删除中…" : "删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ──────────────────────────────────────────────
// 内联展开模型表单
// ──────────────────────────────────────────────

interface InlineModelFormProps {
  mode: "create" | "edit";
  template?: ModelTemplate | null;
  model?: Model | null;
  onSave: (req: ModelRequest) => Promise<void>;
  onCancel: () => void;
}

function InlineModelForm({
  mode,
  template,
  model,
  onSave,
  onCancel,
}: InlineModelFormProps) {
  const isEdit = mode === "edit";
  const initial = isEdit
    ? model
    : template && template.id !== CUSTOM_TEMPLATE_ID
      ? templateToRequest(template)
      : ({} as Partial<ModelRequest>);

  const [name, setName] = useState(initial?.name ?? "");
  const [displayName, setDisplayName] = useState(initial?.display_name ?? "");
  const [useVal, setUseVal] = useState(initial?.use ?? "");
  const [modelId, setModelId] = useState(initial?.model ?? "");
  const [apiKey, setApiKey] = useState(initial?.api_key ?? "");
  const [baseUrl, setBaseUrl] = useState(initial?.base_url ?? "");
  const endpointField: string | null =
    initial?.endpoint_field ??
    (template?.endpointField && template.endpointField !== "native"
      ? template.endpointField
      : null);
  const [supportsThinking, setSupportsThinking] = useState(
    initial?.supports_thinking ?? false,
  );
  const [supportsVision, setSupportsVision] = useState(
    initial?.supports_vision ?? false,
  );
  const [supportsReasoningEffort, setSupportsReasoningEffort] = useState(
    initial?.supports_reasoning_effort ?? false,
  );
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errFields, setErrFields] = useState<Set<string>>(new Set());

  const fieldCls = (field: string) =>
    errFields.has(field) ? "border-destructive" : "";

  const handleSave = async () => {
    const missing = new Set<string>();
    if (!name.trim()) missing.add("name");
    if (!useVal.trim()) missing.add("use");
    if (!modelId.trim()) missing.add("modelId");
    setErrFields(missing);
    if (missing.size > 0) return;

    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        display_name: displayName.trim() || null,
        use: useVal.trim(),
        model: modelId.trim(),
        api_key: apiKey.trim() || null,
        base_url: baseUrl.trim() || null,
        endpoint_field: endpointField,
        supports_thinking: supportsThinking,
        supports_vision: supportsVision,
        supports_reasoning_effort: supportsReasoningEffort,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border bg-muted/20 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <BoxesIcon className="size-3.5" />
          </div>
          <h3 className="text-sm font-semibold">
            {isEdit
              ? `编辑「${model?.display_name ?? model?.name}」`
              : template && template.id !== CUSTOM_TEMPLATE_ID
                ? `创建：${template.name}`
                : "空白自定义模型"}
          </h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="text-muted-foreground hover:text-foreground h-7 text-xs"
        >
          取消
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* 名称 */}
        <FieldGroup label="名称" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="deepseek-v4"
            disabled={isEdit}
            className={cn("h-8", fieldCls("name"))}
          />
          <p className={hintCls}>唯一标识符</p>
        </FieldGroup>

        {/* 显示名称 */}
        <FieldGroup label="显示名称">
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="DeepSeek V4"
            className="h-8"
          />
        </FieldGroup>

        {/* Provider */}
        <FieldGroup label="Provider" required>
          <Input
            value={useVal}
            onChange={(e) => setUseVal(e.target.value)}
            placeholder="qilin.models.patched_deepseek:PatchedChatDeepSeek"
            className={cn("h-8 font-mono text-xs", fieldCls("use"))}
          />
          <p className={hintCls}>Provider 类路径（模板已预填）</p>
        </FieldGroup>

        {/* 模型 ID */}
        <FieldGroup label="模型 ID" required>
          <Input
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            placeholder="deepseek-v4-pro"
            className={cn("h-8", fieldCls("modelId"))}
          />
        </FieldGroup>

        {/* Base URL / 端点 */}
        <FieldGroup label={endpointField === "api_base" ? "API Base" : "Base URL"}>
          <Input
            value={baseUrl ?? ""}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.deepseek.com"
            className="h-8"
          />
          {endpointField && endpointField !== "base_url" && (
            <p className={hintCls}>
              YAML 字段名：<code className="font-mono">{endpointField}</code>
            </p>
          )}
        </FieldGroup>

        {/* API Key */}
        <FieldGroup label="API Key">
          <div className="relative">
            <Input
              type={showApiKey ? "text" : "password"}
              value={apiKey ?? ""}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="$DEEPSEEK_API_KEY"
              className="h-8 pr-8 font-mono text-xs"
              autoComplete="off"
            />
            {apiKey && (
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showApiKey ? (
                  <EyeOffIcon className="size-3.5" />
                ) : (
                  <EyeIcon className="size-3.5" />
                )}
              </button>
            )}
          </div>
          <p className={hintCls}>密钥或 $ENV_VAR 引用</p>
        </FieldGroup>
      </div>

      {/* 能力开关 */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-background/50 px-3 py-2.5">
        <CapabilitySwitch
          label="思考模式"
          checked={supportsThinking}
          onCheckedChange={(v) => {
            setSupportsThinking(v);
            if (!v) setSupportsReasoningEffort(false);
          }}
        />
        <CapabilitySwitch
          label="视觉输入"
          checked={supportsVision}
          onCheckedChange={setSupportsVision}
        />
        <CapabilitySwitch
          label="推理深度"
          checked={supportsReasoningEffort}
          disabled={!supportsThinking}
          onCheckedChange={setSupportsReasoningEffort}
        />
      </div>

      {error && (
        <p className="text-destructive rounded-md bg-destructive/5 px-3 py-2 text-sm">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          取消
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600"
        >
          {saving ? "保存中…" : isEdit ? "保存修改" : "创建模型"}
        </Button>
      </div>
    </section>
  );
}

function FieldGroup({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className={labelCls}>
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function CapabilitySwitch({
  label,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2", disabled && "opacity-50")}>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className="scale-90" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
