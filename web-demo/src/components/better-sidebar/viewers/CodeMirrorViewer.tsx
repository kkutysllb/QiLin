"use client";
import { useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import type { FC } from "react";
import type { FileViewerProps } from "@/core/sidebar/protocol";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// NOTE: @codemirror/lang-yaml / @codemirror/lang-sql are not project dependencies
// (Task 4 allows no new deps besides pdfjs-dist), so .yaml/.sql fall back below.
function langFor(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".py") || lower.endsWith(".ipynb")) return python();
  if (lower.endsWith(".md")) return markdown();
  if (lower.endsWith(".json")) return json();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return html();
  if (lower.endsWith(".css") || lower.endsWith(".scss")) return css();
  return javascript();
}

const CodeMirrorViewer: FC<FileViewerProps> = ({ entry, content, onSave }) => {
  const [value, setValue] = useState(() => (typeof content === "string" ? content : ""));
  const [saving, setSaving] = useState(false);
  const dirty = typeof content === "string" && value !== content;

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between border-b px-2 py-1 text-xs">
        <span className="text-muted-foreground">{entry.name}</span>
        <Button
          size="sm"
          variant={dirty ? "default" : "ghost"}
          // Only `saving` disables the button: the plan's test clicks Save with an
          // unmodified buffer, and React suppresses clicks on disabled buttons.
          disabled={saving}
          onClick={async () => {
            if (!onSave) return;
            setSaving(true);
            try {
              await onSave(value);
              toast.success("saved");
            } catch (e) {
              toast.error((e as Error).message ?? "save failed");
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <CodeMirror
          value={value}
          height="100%"
          extensions={[langFor(entry.name)]}
          onChange={(next) => setValue(next)}
          basicSetup={{ lineNumbers: true, foldGutter: true }}
        />
      </div>
    </div>
  );
};

export { CodeMirrorViewer };
export default CodeMirrorViewer;
