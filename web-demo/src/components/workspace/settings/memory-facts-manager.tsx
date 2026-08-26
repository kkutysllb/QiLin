"use client";

import {
  DownloadIcon,
  Loader2Icon,
  PenLineIcon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { exportMemory } from "@/core/memory/api";
import {
  useClearMemory,
  useCreateMemoryFact,
  useDeleteMemoryFact,
  useImportMemory,
  useMemory,
  useUpdateMemoryFact,
} from "@/core/memory/hooks";
import type {
  MemoryFactInput,
  MemoryFactPatchInput,
  UserMemory,
} from "@/core/memory/types";
import { pathOfThread } from "@/core/threads/utils";
import { formatTimeAgo } from "@/core/utils/datetime";

type MemoryFact = UserMemory["facts"][number];

interface FactFormState {
  content: string;
  category: string;
  confidence: string;
}

const DEFAULT_FACT_FORM: FactFormState = {
  content: "",
  category: "context",
  confidence: "0.8",
};

// ---------------------------------------------------------------------------
// Import-validation guards
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isImportedMemory(value: unknown): value is UserMemory {
  if (!isRecord(value)) return false;
  if (
    typeof value.version !== "string" ||
    typeof value.lastUpdated !== "string" ||
    !isRecord(value.user) ||
    !isRecord(value.history) ||
    !Array.isArray(value.facts)
  ) {
    return false;
  }
  return true;
}

function truncate(text: string, max = 120): string {
  const s = text.replace(/\s+/g, " ").trim();
  return s.length <= max ? s : `${s.slice(0, max - 3)}...`;
}

function confidenceLabel(v: number): string {
  if (v >= 0.85) return "高";
  if (v >= 0.65) return "中";
  if (Number.isFinite(v)) return "低";
  return "未知";
}

function confidenceColor(v: number): string {
  if (v >= 0.85) return "text-emerald-600 dark:text-emerald-400";
  if (v >= 0.65) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MemoryFactsManager() {
  const { memory, isLoading, error } = useMemory();
  const clearMem = useClearMemory();
  const createFact = useCreateMemoryFact();
  const deleteFact = useDeleteMemoryFact();
  const updateFact = useUpdateMemoryFact();
  const importMut = useImportMemory();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [query, setQuery] = useState("");
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [factToDelete, setFactToDelete] = useState<MemoryFact | null>(null);
  const [factToEdit, setFactToEdit] = useState<MemoryFact | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [factForm, setFactForm] = useState<FactFormState>(DEFAULT_FACT_FORM);
  const [pendingImport, setPendingImport] = useState<{
    fileName: string;
    memory: UserMemory;
  } | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredFacts = memory
    ? memory.facts.filter((f) =>
        normalizedQuery
          ? `${f.content} ${f.category}`.toLowerCase().includes(normalizedQuery)
          : true,
      )
    : [];

  // --- Handlers -----------------------------------------------------------

  async function handleExport() {
    try {
      setIsExporting(true);
      const data = await exportMemory();
      const fileName = `kworks-memory-${(data.lastUpdated || new Date().toISOString()).replace(/[:.]/g, "-")}.json`;
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("记忆已导出");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导出失败");
    } finally {
      setIsExporting(false);
    }
  }

  function handleFileSelect(e: { target: HTMLInputElement }) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    file
      .text()
      .then((text) => {
        const parsed: unknown = JSON.parse(text);
        if (!isImportedMemory(parsed)) {
          toast.error("无效的记忆文件格式");
          return;
        }
        setPendingImport({ fileName: file.name, memory: parsed });
      })
      .catch(() => toast.error("无法解析文件"));
  }

  async function handleConfirmImport() {
    if (!pendingImport) return;
    try {
      await importMut.mutateAsync(pendingImport.memory);
      toast.success("记忆已导入");
      setPendingImport(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导入失败");
    }
  }

  async function handleClear() {
    try {
      await clearMem.mutateAsync();
      toast.success("所有记忆已清空");
      setClearDialogOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "清空失败");
    }
  }

  async function handleDeleteFact() {
    if (!factToDelete) return;
    try {
      await deleteFact.mutateAsync(factToDelete.id);
      toast.success("事实已删除");
      setFactToDelete(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  function openCreate() {
    setFactToEdit(null);
    setFactForm(DEFAULT_FACT_FORM);
    setEditorOpen(true);
  }

  function openEdit(fact: MemoryFact) {
    setFactToEdit(fact);
    setFactForm({
      content: fact.content,
      category: fact.category,
      confidence: String(fact.confidence),
    });
    setEditorOpen(true);
  }

  async function handleSaveFact() {
    const content = factForm.content.trim();
    if (!content) {
      toast.error("内容不能为空");
      return;
    }
    const confidence = Number(factForm.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      toast.error("置信度必须在 0~1 之间");
      return;
    }
    const input: MemoryFactInput = {
      content,
      category: factForm.category.trim() || "context",
      confidence,
    };
    try {
      if (factToEdit) {
        const patch: MemoryFactPatchInput = {
          content: input.content,
          category: input.category,
          confidence: input.confidence,
        };
        await updateFact.mutateAsync({ factId: factToEdit.id, input: patch });
        toast.success("事实已更新");
      } else {
        await createFact.mutateAsync(input);
        toast.success("事实已添加");
      }
      setEditorOpen(false);
      setFactToEdit(null);
      setFactForm(DEFAULT_FACT_FORM);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  }

  // --- Render -------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        加载记忆数据…
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-destructive">
        加载失败：{error.message}
      </div>
    );
  }

  const totalFacts = memory?.facts.length ?? 0;
  const isFactFormPending = createFact.isPending || updateFact.isPending;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索记忆事实…"
          className="sm:max-w-xs"
        />
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => void handleFileSelect(e)}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={importMut.isPending}
          >
            <UploadIcon className="mr-1.5 size-3.5" />
            导入
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleExport()}
            disabled={isExporting}
          >
            <DownloadIcon className="mr-1.5 size-3.5" />
            {isExporting ? "导出中…" : "导出"}
          </Button>
          <Button variant="outline" size="sm" onClick={openCreate}>
            <PlusIcon className="mr-1.5 size-3.5" />
            新增事实
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setClearDialogOpen(true)}
            disabled={clearMem.isPending || totalFacts === 0}
          >
            <Trash2Icon className="mr-1.5 size-3.5" />
            清空
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>共 <strong className="text-foreground">{totalFacts}</strong> 条事实</span>
        {normalizedQuery && (
          <span>匹配 <strong className="text-foreground">{filteredFacts.length}</strong> 条</span>
        )}
      </div>

      {/* Facts list */}
      {filteredFacts.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {normalizedQuery ? "没有匹配的记忆事实" : "暂无记忆事实，对话中智能体将自动学习"}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredFacts.map((fact) => (
            <div
              key={fact.id}
              className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                  <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-medium">
                    {fact.category}
                  </span>
                  <span className={confidenceColor(fact.confidence)}>
                    置信度：{confidenceLabel(fact.confidence)}（{fact.confidence.toFixed(2)}）
                  </span>
                  <span className="text-muted-foreground">
                    {formatTimeAgo(fact.createdAt)}
                  </span>
                  {fact.source && fact.source !== "manual" && fact.source !== "unknown" && (
                    <Link
                      href={pathOfThread(fact.source)}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      来源
                    </Link>
                  )}
                  {fact.source === "manual" && (
                    <span className="text-muted-foreground">手动添加</span>
                  )}
                </div>
                <p className="text-sm break-words">{fact.content}</p>
              </div>

              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => openEdit(fact)}
                  disabled={deleteFact.isPending}
                  title="编辑"
                >
                  <PenLineIcon className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive size-7"
                  onClick={() => setFactToDelete(fact)}
                  disabled={deleteFact.isPending}
                  title="删除"
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* --- Dialogs ------------------------------------------------------- */}

      {/* Clear confirmation */}
      <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>清空所有记忆？</DialogTitle>
            <DialogDescription>
              此操作将删除所有记忆事实和摘要，且不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setClearDialogOpen(false)}
              disabled={clearMem.isPending}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleClear()}
              disabled={clearMem.isPending}
            >
              {clearMem.isPending ? "清空中…" : "确认清空"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fact editor */}
      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) {
            setFactToEdit(null);
            setFactForm(DEFAULT_FACT_FORM);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{factToEdit ? "编辑事实" : "新增事实"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">内容</label>
              <Textarea
                value={factForm.content}
                onChange={(e) =>
                  setFactForm((c) => ({ ...c, content: e.target.value }))
                }
                placeholder="输入记忆事实内容…"
                rows={4}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">类别</label>
                <Input
                  value={factForm.category}
                  onChange={(e) =>
                    setFactForm((c) => ({ ...c, category: e.target.value }))
                  }
                  placeholder="context"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">置信度（0~1）</label>
                <Input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={factForm.confidence}
                  onChange={(e) =>
                    setFactForm((c) => ({ ...c, confidence: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  0.85+ 为高，0.65+ 为中，其余为低
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditorOpen(false);
                setFactToEdit(null);
                setFactForm(DEFAULT_FACT_FORM);
              }}
              disabled={isFactFormPending}
            >
              取消
            </Button>
            <Button
              onClick={() => void handleSaveFact()}
              disabled={isFactFormPending}
            >
              {isFactFormPending ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={factToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setFactToDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除此事实？</DialogTitle>
            <DialogDescription>此操作不可撤销。</DialogDescription>
          </DialogHeader>
          {factToDelete && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="break-words">{truncate(factToDelete.content)}</p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFactToDelete(null)}
              disabled={deleteFact.isPending}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDeleteFact()}
              disabled={deleteFact.isPending}
            >
              {deleteFact.isPending ? "删除中…" : "删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import confirmation */}
      <Dialog
        open={pendingImport !== null}
        onOpenChange={(open) => {
          if (!open) setPendingImport(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认导入记忆？</DialogTitle>
            <DialogDescription>
              导入将覆盖当前所有记忆数据。
            </DialogDescription>
          </DialogHeader>
          {pendingImport && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
              <div>
                <span className="text-muted-foreground">文件：</span>
                {pendingImport.fileName}
              </div>
              <div>
                <span className="text-muted-foreground">事实数：</span>
                {pendingImport.memory.facts.length}
              </div>
              <div>
                <span className="text-muted-foreground">最后更新：</span>
                {pendingImport.memory.lastUpdated
                  ? formatTimeAgo(pendingImport.memory.lastUpdated)
                  : "-"}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingImport(null)}
              disabled={importMut.isPending}
            >
              取消
            </Button>
            <Button
              onClick={() => void handleConfirmImport()}
              disabled={importMut.isPending}
            >
              {importMut.isPending ? "导入中…" : "确认导入"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
