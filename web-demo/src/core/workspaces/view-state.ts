"use client";
/**
 * 侧栏树推导的浏览器本地视图状态：折叠的工作区键集合。
 *
 * 与 DSH 的 expandedGroups 方向相反、语义等价：注册表是持续增量的，
 * 「只记住用户主动折叠的组」让新登记的工作区默认展开，避免每次
 * 注册新目录都要去 localStorage 里补一次展开动作。折叠集按
 * ``kworks.workspace.collapsedGroups`` 单键持久化，读写全程 try-catch
 * （隐私模式 / SSR 下静默退化为内存态）。
 */
import { useCallback, useState } from "react";

const COLLAPSED_KEY = "kworks.workspace.collapsedGroups";

function readCollapsed(): Set<string> {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const raw = window.localStorage.getItem(COLLAPSED_KEY);
    if (!raw) return new Set<string>();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set<string>();
  }
}

function writeCollapsed(collapsed: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(
      COLLAPSED_KEY,
      JSON.stringify([...collapsed]),
    );
  } catch {
    // 存储不可用时保持会话内状态即可
  }
}

export function useWorkspaceViewCollapse() {
  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsed);

  const toggleCollapse = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      writeCollapsed(next);
      return next;
    });
  }, []);

  /** 组被删除后清理残留的折叠记忆。 */
  const retainKeys = useCallback((keys: ReadonlySet<string>) => {
    setCollapsed((prev) => {
      const stale = [...prev].filter((k) => !keys.has(k));
      if (stale.length === 0) return prev;
      const next = new Set(prev);
      for (const k of stale) next.delete(k);
      writeCollapsed(next);
      return next;
    });
  }, []);

  const isCollapsed = useCallback(
    (key: string): boolean => collapsed.has(key),
    [collapsed],
  );

  return { collapsed, isCollapsed, toggleCollapse, retainKeys };
}
