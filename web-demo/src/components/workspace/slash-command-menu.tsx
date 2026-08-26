"use client";

import { CornerDownLeftIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSkills } from "@/core/skills/hooks";
import { cn } from "@/lib/utils";

/**
 * SlashCommandMenu — Cursor-style "/" skill picker floating above the input
 * box. The backend activates skills on the strict `/skill-name task`
 * message syntax (message must START with the slash token), so the menu
 * tracks only the leading token of the textarea value: it opens on `/`,
 * filters while the user types the name, and closes once a space follows.
 *
 * The textarea lives inside the self-managed <PromptInput> (an uncontrolled
 * DOM textarea read via FormData on submit), so this component talks to it
 * through native listeners instead of React props:
 *  - a bubbling `input` listener keeps the query in sync;
 *  - a CAPTURE `keydown` listener intercepts Arrow/Enter/Tab/Esc before the
 *    textarea's own Enter-to-submit handler can fire.
 */

const SLASH_TOKEN_RE = /^\/([a-zA-Z0-9_-]*)$/;

function getTextarea(root: HTMLElement | null): HTMLTextAreaElement | null {
  return root?.querySelector("textarea[name='message']") ?? null;
}

export function SlashCommandMenu({
  rootRef,
}: {
  rootRef: React.RefObject<HTMLElement | null>;
}) {
  const { skills } = useSkills();
  const [query, setQuery] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  // Mirrors `query`/`selected` so native listeners can read current values
  // without re-binding on every state change.
  const queryRef = useRef<string | null>(null);
  const selectedRef = useRef(0);
  const filteredRef = useRef<{ name: string; description: string }[]>([]);

  queryRef.current = query;
  selectedRef.current = selected;

  const enabledSkills = useMemo(
    () => skills.filter((skill) => skill.enabled),
    [skills],
  );
  const filtered = useMemo(() => {
    if (query === null) return [];
    const needle = query.toLowerCase();
    return enabledSkills
      .filter(
        (skill) =>
          skill.name.toLowerCase().startsWith(needle) ||
          skill.description.toLowerCase().includes(needle),
      )
      .slice(0, 12);
  }, [enabledSkills, query]);
  filteredRef.current = filtered;

  const applySkill = useCallback(
    (name: string) => {
      const textarea = getTextarea(rootRef.current);
      if (!textarea) return;
      // Uncontrolled textarea (self-managed PromptInput) — direct assignment
      // plus a bubbling input event so React's onChange and our own native
      // listener both see the change exactly like a keystroke.
      textarea.value = `/${name} `;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.focus();
      setQuery(null);
      setSelected(0);
    },
    [rootRef],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const syncFromTextarea = () => {
      const textarea = getTextarea(root);
      if (!textarea) return;
      const match = SLASH_TOKEN_RE.exec(textarea.value);
      const next = match?.[1] ?? null;
      if (next !== queryRef.current) {
        setSelected(0);
      }
      queryRef.current = next;
      setQuery(next);
    };

    const handleInput = () => syncFromTextarea();

    const handleKeyDownCapture = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (queryRef.current === null) return;
      // Menu is open — navigate/select/close and swallow the key before the
      // textarea's Enter-to-submit handler can see it.
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        queryRef.current = null;
        setQuery(null);
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const max = Math.max(filteredRef.current.length - 1, 0);
        const next = Math.min(Math.max(selectedRef.current + delta, 0), max);
        selectedRef.current = next;
        setSelected(next);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const skill = filteredRef.current[selectedRef.current];
        if (!skill) return;
        event.preventDefault();
        event.stopPropagation();
        applySkill(skill.name);
      }
    };

    const bind = () => {
      const textarea = getTextarea(root);
      if (!textarea) return;
      textarea.addEventListener("input", handleInput);
      textarea.addEventListener("keydown", handleKeyDownCapture, true);
    };
    const unbind = () => {
      const textarea = getTextarea(root);
      if (!textarea) return;
      textarea.removeEventListener("input", handleInput);
      textarea.removeEventListener("keydown", handleKeyDownCapture, true);
    };

    bind();
    // The textarea can be remounted (thread switch, disabled toggle) —
    // rebind when the DOM under the root changes.
    const observer = new MutationObserver(() => {
      unbind();
      bind();
      syncFromTextarea();
    });
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      unbind();
      observer.disconnect();
    };
  }, [rootRef, applySkill]);

  // Keep the selected item in view when navigating with arrows.
  useEffect(() => {
    const node = listRef.current?.children[selected] as
      | HTMLElement
      | undefined;
    node?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  if (query === null || filtered.length === 0) return null;

  return (
    <div className="bg-background/95 absolute bottom-full left-0 right-0 z-20 mb-2 overflow-hidden rounded-xl border shadow-lg backdrop-blur">
      <div className="text-muted-foreground flex items-center gap-3 border-b px-3 py-1.5 text-[11px]">
        <span>技能命令</span>
        <span className="ml-auto flex items-center gap-2">
          <span>↑↓ 选择</span>
          <span className="flex items-center gap-1">
            <CornerDownLeftIcon className="size-3" />
            确认
          </span>
          <span>
            <kbd className="rounded border px-1">Esc</kbd> 关闭
          </span>
        </span>
      </div>
      <div className="max-h-64 overflow-y-auto p-1" ref={listRef}>
        {filtered.map((skill, index) => (
          <button
            key={skill.name}
            type="button"
            className={cn(
              "flex w-full items-baseline gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
              index === selected ? "bg-muted" : "hover:bg-muted/50",
            )}
            // onMouseDown (not onClick) so the textarea never loses focus.
            onMouseDown={(event) => {
              event.preventDefault();
              applySkill(skill.name);
            }}
            onMouseEnter={() => {
              selectedRef.current = index;
              setSelected(index);
            }}
          >
            <span className="font-mono text-emerald-600 shrink-0 dark:text-emerald-400">
              /{skill.name}
            </span>
            <span className="text-muted-foreground line-clamp-1 text-xs">
              {skill.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
