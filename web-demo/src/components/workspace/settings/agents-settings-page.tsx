"use client";

import {
  BotIcon,
  CrownIcon,
  EyeIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  WrenchIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  deleteAgent,
  getAgent,
  listAgents,
} from "@/core/agents/api";
import type { Agent } from "@/core/agents/types";

import { AgentWizardDialog } from "./agent-wizard-dialog";
import { useConfigSection } from "./config/use-config-section";
import { SettingsSection } from "./settings-section";

interface AgentsApiConfig {
  enabled: boolean;
}

export function AgentsSettingsPage() {
  const { data, loading, saving, save } = useConfigSection<AgentsApiConfig>(
    "agents_api",
    { enabled: false },
  );
  const [enabled, setEnabled] = useState(data.enabled);

  useEffect(() => {
    setEnabled(data.enabled);
  }, [data.enabled]);

  const dirty = enabled !== data.enabled;

  const handleSave = async () => {
    try {
      await save({ enabled });
      toast.success("代理 API 设置已更新");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  return (
    <SettingsSection
      title="代理"
      description="管理自定义代理，启用/禁用代理管理 API。创建的代理可同时用于 single 模式委派和 multi 编排。"
      icon={<BotIcon className="h-5 w-5 text-primary" />}
    >
      <div className="space-y-6">
        {/* Agent API 开关 */}
        <section className="space-y-2">
          <h3 className="text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase">
            API
          </h3>
          <div className="divide-y overflow-hidden rounded-xl border">
            {loading ? (
              <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" />
                加载中…
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      启用代理管理 API
                    </div>
                    <div className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                      开启后允许通过 HTTP 创建、编辑和删除自定义代理
                    </div>
                  </div>
                  <div className="shrink-0">
                    <Switch
                      checked={enabled}
                      onCheckedChange={setEnabled}
                      disabled={saving}
                    />
                  </div>
                </div>
                <div className="flex gap-2 px-4 py-3">
                  <Button
                    size="sm"
                    disabled={!dirty || saving}
                    onClick={handleSave}
                  >
                    {saving ? "保存中…" : "保存"}
                  </Button>
                  {dirty && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEnabled(data.enabled)}
                      disabled={saving}
                    >
                      重置
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </section>

        {/* Agent 列表 */}
        <AgentsList enabled={data.enabled} />
      </div>
    </SettingsSection>
  );
}

/* ── Agent list ───────────────────────────────────────── */

function AgentsList({ enabled }: { enabled: boolean }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listAgents();
      setAgents(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载代理列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents, enabled]);

  const handleDelete = async (name: string) => {
    setDeleting(name);
    try {
      await deleteAgent(name);
      setAgents((prev) => prev.filter((a) => a.name !== name));
      toast.success(`已删除代理「${name}」`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeleting(null);
    }
  };

  const handleNew = () => {
    if (!enabled) {
      toast.warning("请先启用代理管理 API");
      return;
    }
    setEditingAgent(null);
    setDialogOpen(true);
  };

  const handleEdit = async (name: string) => {
    try {
      const agent = await getAgent(name);
      setEditingAgent(agent);
      setDialogOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载代理详情失败");
    }
  };

  const handleDialogSuccess = () => {
    void loadAgents();
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          自定义代理
        </h3>
        <Button size="sm" variant="outline" onClick={handleNew}>
          <PlusIcon className="size-3.5" />
          新建
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border px-4 py-6 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          加载中…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 px-4 py-4 text-sm text-red-500">
          {error}
        </div>
      ) : agents.length === 0 ? (
        <div className="rounded-xl border px-4 py-8 text-center text-sm text-muted-foreground">
          暂无自定义代理，点击「新建」创建第一个代理
        </div>
      ) : (
        <div className="space-y-2">
          {agents.map((agent) => (
            <div
              key={agent.name}
              className="rounded-xl border p-4 transition-colors hover:bg-muted/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <BotIcon className="text-muted-foreground size-4 shrink-0" />
                    <span className="text-sm font-medium">{agent.name}</span>
                    {agent.role && agent.role !== "worker" && (
                      <Badge variant="secondary" className="gap-1 text-[10px]">
                        {agent.role === "orchestrator" ? (
                          <CrownIcon className="size-2.5" />
                        ) : agent.role === "reviewer" ? (
                          <EyeIcon className="size-2.5" />
                        ) : null}
                        {agent.role}
                      </Badge>
                    )}
                  </div>
                  {agent.description && (
                    <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-relaxed">
                      {agent.description}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                    {agent.model && (
                      <Badge variant="outline" className="text-[10px]">
                        {agent.model}
                      </Badge>
                    )}
                    {agent.tool_groups && agent.tool_groups.length > 0 && (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <WrenchIcon className="size-2.5" />
                        {agent.tool_groups.length} 工具
                      </Badge>
                    )}
                    {agent.skills && agent.skills.length > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {agent.skills.length} 技能
                      </Badge>
                    )}
                    {agent.max_turns != null && (
                      <span className="text-muted-foreground text-[10px]">
                        {agent.max_turns} 轮
                      </span>
                    )}
                    {agent.timeout_seconds != null && (
                      <span className="text-muted-foreground text-[10px]">
                        {agent.timeout_seconds}s
                      </span>
                    )}
                    {agent.thinking_enabled != null && (
                      <span className="text-muted-foreground text-[10px]">
                        thinking: {agent.thinking_enabled ? "on" : "off"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleEdit(agent.name)}
                    className="h-8 px-2"
                  >
                    <PencilIcon className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(agent.name)}
                    disabled={deleting === agent.name}
                    className="text-destructive hover:text-destructive h-8 px-2"
                  >
                    {deleting === agent.name ? (
                      <Loader2Icon className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2Icon className="size-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <AgentWizardDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        agent={editingAgent}
        onSuccess={handleDialogSuccess}
      />
    </section>
  );
}
