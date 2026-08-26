"use client";

import { AlertTriangleIcon, PlusIcon, SparklesIcon, TerminalIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
import { useI18n } from "@/core/i18n/hooks";
import {
  addMCPServer,
  deleteMCPServer,
  loadMCPConfig,
  updateMCPConfig,
} from "@/core/mcp/api";
import type { MCPServerConfig } from "@/core/mcp/types";

import { McpCard } from "./mcp-card";
import { McpDialog } from "./mcp-dialog";

/**
 * Built-in preset MCP servers (free, no API key required).
 *
 * Note: Python-based servers (fetch/time) use `--with "mcp>=1.9,<1.10"` to pin
 * a compatible mcp library version. Their PyPI packages still import `McpError`
 * (the old name), while mcp >= 1.10 renamed it to `MCPError`.
 */
const MCP_PRESETS: MCPServerConfig[] = [
  {
    enabled: true,
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
    description: "Dynamic and reflective problem-solving through thought sequences",
  },
  {
    enabled: true,
    type: "stdio",
    command: "npx",
    args: ["-y", "@upstash/context7-mcp"],
    description: "Query up-to-date documentation for any library or framework",
  },
  {
    enabled: true,
    type: "stdio",
    command: "uvx",
    args: ["--with", "mcp>=1.9,<1.10", "mcp-server-fetch"],
    description: "Fetch and summarize web content directly from URLs",
  },
  {
    enabled: true,
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
    description: "Knowledge-graph based persistent memory for long-term recall",
  },
  {
    enabled: true,
    type: "stdio",
    command: "uvx",
    args: ["--with", "mcp>=1.9,<1.10", "mcp-server-time"],
    description: "Time zone conversion and current time across regions",
  },
  {
    enabled: true,
    type: "stdio",
    command: "uvx",
    args: ["--with", "mcp>=1.9,<1.10", "mcp-server-git"],
    description: "Git repository operations: log, diff, status, and more",
  },
  {
    enabled: true,
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
    description: "Secure file system access (edit /tmp in args to your path)",
  },
];

export function McpGallery({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const [servers, setServers] = useState<Record<string, MCPServerConfig>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState<MCPServerConfig | null>(
    null,
  );

  // Delete state
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadMCPConfig();
      setServers(data.mcp_servers);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load MCP config");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleAdd = () => {
    setEditingName(null);
    setEditingConfig(null);
    setDialogOpen(true);
  };

  const handleEdit = (name: string) => {
    setEditingName(name);
    setEditingConfig(servers[name] ?? null);
    setDialogOpen(true);
  };

  const handleSave = async (
    name: string,
    isNew: boolean,
    config: MCPServerConfig,
  ) => {
    if (isNew) {
      await addMCPServer(name, config);
      toast.success(t.mcp.createSuccess);
    } else {
      // Update via full config PUT
      const current = await loadMCPConfig();
      const updated = {
        mcp_servers: {
          ...current.mcp_servers,
          [name]: config,
        },
      };
      await updateMCPConfig(updated);
      toast.success(t.mcp.updateSuccess);
    }
    await refresh();
  };

  const handleDelete = async () => {
    if (!deletingName) return;
    setDeleting(true);
    try {
      await deleteMCPServer(deletingName);
      toast.success(t.mcp.deleteSuccess);
      setDeletingName(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const serverEntries = Object.entries(servers);

  /** Derive a unique server name from a preset's package name or URL host. */
  const derivePresetName = (preset: MCPServerConfig): string => {
    // For stdio servers: derive from the package name arg
    // Skip flags (--*), version specifiers (contain <>=), and paths (/tmp)
    const pkg =
      preset.args
        ?.filter((a) => !a.startsWith("-") && !/[<>=]/.test(a) && !a.startsWith("/"))
        .pop() ?? "";
    if (pkg) {
      const base = pkg
        .replace(/^@modelcontextprotocol\/server-/, "")
        .replace(/^[\w@.-]+\//, "")
        .replace(/^mcp-server-/, "")
        .replace(/-mcp$/, "");
      return base || "mcp-server";
    }
    // For http/sse servers: derive from URL host
    if (preset.url) {
      try {
        const host = new URL(preset.url).hostname;
        const parts = host.split(".");
        // e.g. zyhub.finance.sina.cn → "sina"
        return parts.length >= 2 ? parts[parts.length - 2]! : host;
      } catch {
        return "mcp-server";
      }
    }
    return "mcp-server";
  };

  const handleAddPreset = async (preset: MCPServerConfig) => {
    const baseName = derivePresetName(preset);
    let name = baseName;
    let suffix = 1;
    while (servers[name]) {
      name = `${baseName}-${suffix++}`;
    }
    try {
      await addMCPServer(name, preset);
      toast.success(t.mcp.createSuccess);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add preset");
    }
  };

  const header = (
    <div
      className={
        embedded
          ? "flex flex-wrap items-center justify-between gap-3 pb-4"
          : "relative flex items-center justify-between px-6 py-5"
      }
    >
      <div
        className={
          embedded
            ? "flex items-center gap-2"
            : "space-y-1.5"
        }
      >
        {embedded ? (
          <div className="flex items-center gap-2">
            {serverEntries.length > 0 && !loading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex size-2 rounded-full bg-amber-400" />
                {serverEntries.length} {t.mcp.title}
              </div>
            )}
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
              <TerminalIcon className="w-6 h-6 text-rose-500" />
              <span className="bg-gradient-to-r from-amber-500 via-orange-400 to-rose-400 bg-clip-text text-transparent">
                {t.mcp.title}
              </span>
            </h1>
            <p className="text-muted-foreground text-sm max-w-xl">
              {t.mcp.description}
            </p>
          </>
        )}
      </div>
      <Button
        onClick={handleAdd}
        className={
          embedded
            ? "gap-1.5"
            : "bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 shadow-md shadow-amber-500/25 transition-all duration-200 hover:shadow-lg hover:shadow-amber-500/30"
        }
      >
        <PlusIcon className="mr-1.5 h-4 w-4" />
        {t.mcp.addServer}
      </Button>
    </div>
  );

  return (
    <div className={embedded ? "space-y-6" : "flex size-full flex-col"}>
      {!embedded && (
        <div className="relative shrink-0 border-b bg-gradient-to-b from-muted/30 to-transparent">
          {/* Decorative background */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-24 -right-24 size-64 rounded-full bg-amber-500/5 blur-3xl" />
            <div className="absolute -bottom-16 left-1/3 size-48 rounded-full bg-orange-500/5 blur-3xl" />
          </div>
          {header}
        </div>
      )}
      {embedded && header}

      {/* Content */}
      <div className={embedded ? "space-y-0" : "flex-1 overflow-y-auto p-6"}>
        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-lg border bg-muted/30"
              />
            ))}
          </div>
        ) : error ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
            <div className="size-16 rounded-2xl bg-red-500/10 flex items-center justify-center">
              <TerminalIcon className="size-7 text-red-400" />
            </div>
            <p className="text-destructive text-sm font-medium">{error}</p>
            <Button variant="outline" onClick={refresh}>
              Retry
            </Button>
          </div>
        ) : serverEntries.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-muted blur-xl" />
              <div className="relative bg-muted flex h-16 w-16 items-center justify-center rounded-2xl ring-1 ring-border">
                <TerminalIcon className="h-8 w-8" />
              </div>
            </div>
            <div>
              <p className="font-semibold text-lg">{t.mcp.emptyTitle}</p>
              <p className="text-muted-foreground mt-1 text-sm max-w-sm">
                {t.mcp.emptyDescription}
              </p>
            </div>
            <Button
              onClick={handleAdd}
              className="mt-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600"
            >
              <PlusIcon className="mr-1.5 h-4 w-4" />
              {t.mcp.addServer}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {serverEntries.map(([name, config]) => (
              <McpCard
                key={name}
                name={name}
                config={config}
                onEdit={handleEdit}
                onDelete={setDeletingName}
              />
            ))}
          </div>
        )}
      </div>

      {/* Built-in presets */}
      {!loading && !error && (
        <div className={embedded ? "space-y-3" : "px-6 pb-6"}>
          <div className="flex items-center gap-2">
            <SparklesIcon className="size-4 text-amber-500" />
            <h3
              className={embedded ? "text-sm font-semibold" : "text-sm font-semibold"}
            >
              {t.mcp.guideLinks}
            </h3>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {MCP_PRESETS.map((preset, i) => {
              const name = derivePresetName(preset);
              const exists = !!servers[name];
              return (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium">{name}</span>
                    </div>
                    <p className="text-muted-foreground truncate text-xs">
                      {preset.description}
                    </p>
                  </div>
                  <Button
                    variant={exists ? "secondary" : "outline"}
                    size="sm"
                    disabled={exists}
                    onClick={() => handleAddPreset(preset)}
                    className="shrink-0"
                  >
                    {exists ? (
                      "✓"
                    ) : (
                      <>
                        <PlusIcon className="mr-1 size-3" />
                        {t.common.install}
                      </>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add / Edit dialog */}
      <McpDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        name={editingName}
        config={editingConfig}
        onSave={handleSave}
      />

      {/* Delete confirmation */}
      <Dialog
        open={!!deletingName}
        onOpenChange={(open) => {
          if (!open) setDeletingName(null);
        }}
      >
        <DialogContent className="p-0">
          <div className="h-1.5 w-full rounded-t-lg bg-gradient-to-r from-red-400 to-rose-400" />
          <DialogHeader className="px-6 pt-4">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 text-red-500">
                <AlertTriangleIcon className="h-4 w-4" />
              </span>
              {t.mcp.deleteServer}
            </DialogTitle>
            <DialogDescription className="pl-10">
              {t.mcp.deleteConfirm.replace(
                "{name}",
                deletingName ?? "",
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="px-6 pb-5">
            <Button
              variant="outline"
              onClick={() => setDeletingName(null)}
              disabled={deleting}
            >
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
              className="shadow-sm"
            >
              {deleting ? t.common.loading : t.common.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
