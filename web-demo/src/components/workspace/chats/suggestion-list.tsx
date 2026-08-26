"use client";

import { PlusIcon, SparklesIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback } from "react";

import {
  Suggestion,
  Suggestions,
} from "@/components/ai-elements/suggestion";
import { ConfettiButton } from "@/components/ui/confetti-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePromptInputController } from "@/components/ai-elements/prompt-input";
import { useI18n } from "@/core/i18n/hooks";
import { cn } from "@/lib/utils";

/** Per-suggestion color theme */
const SUGGESTION_COLORS = {
  // 小惊喜 / Surprise
  surprise: {
    bg: "bg-orange-500/10 dark:bg-orange-500/15",
    text: "text-orange-700 dark:text-orange-300",
    icon: "text-orange-500",
    border: "border-orange-500/25 dark:border-orange-400/20",
    hoverBg: "bg-orange-500/20",
  },
  // 写作 / Write
  write: {
    bg: "bg-sky-500/10 dark:bg-sky-500/15",
    text: "text-sky-700 dark:text-sky-300",
    icon: "text-sky-500",
    border: "border-sky-500/25 dark:border-sky-400/20",
    hoverBg: "bg-sky-500/20",
  },
  // 研究 / Research
  research: {
    bg: "bg-violet-500/10 dark:bg-violet-500/15",
    text: "text-violet-700 dark:text-violet-300",
    icon: "text-violet-500",
    border: "border-violet-500/25 dark:border-violet-400/20",
    hoverBg: "bg-violet-500/20",
  },
  // 收集 / Collect
  collect: {
    bg: "bg-cyan-500/10 dark:bg-cyan-500/15",
    text: "text-cyan-700 dark:text-cyan-300",
    icon: "text-cyan-500",
    border: "border-cyan-500/25 dark:border-cyan-400/20",
    hoverBg: "bg-cyan-500/20",
  },
  // 学习 / Learn
  learn: {
    bg: "bg-amber-500/10 dark:bg-amber-500/15",
    text: "text-amber-700 dark:text-amber-300",
    icon: "text-amber-500",
    border: "border-amber-500/25 dark:border-amber-400/20",
    hoverBg: "bg-amber-500/20",
  },
  // 创建 / Create
  create: {
    bg: "bg-fuchsia-500/10 dark:bg-fuchsia-500/15",
    text: "text-fuchsia-700 dark:text-fuchsia-300",
    icon: "text-fuchsia-500",
    border: "border-fuchsia-500/25 dark:border-fuchsia-400/20",
    hoverBg: "bg-fuchsia-500/20",
  },
};

/** Map suggestion text to color key */
function getSuggestionColorKey(suggestion: string): string {
  const lower = suggestion.toLowerCase();
  if (lower.includes("惊喜") || lower.includes("surprise")) return "surprise";
  if (lower.includes("写作") || lower.includes("write")) return "write";
  if (lower.includes("研究") || lower.includes("research")) return "research";
  if (lower.includes("收集") || lower.includes("collect")) return "collect";
  if (lower.includes("学习") || lower.includes("learn")) return "learn";
  return "create";
}

/**
 * Quick-prompt suggestion chips (Surprise / Write / Research / Collect /
 * Learn / Create). Clicking a chip writes the prompt into the underlying
 * PromptInput controller and focuses the textarea, so the user can refine
 * before sending.
 *
 * Rendered above the main content area on the new-task page (and outside
 * the input box itself) so the layout flows: welcome content → suggestions
 * → input box anchored at the bottom.
 */
export function SuggestionList() {
  const { t } = useI18n();
  const { textInput } = usePromptInputController();
  const searchParams = useSearchParams();
  const handleSuggestionClick = useCallback(
    (prompt: string | undefined) => {
      if (!prompt) return;
      textInput.setInput(prompt);
      setTimeout(() => {
        const textarea = document.querySelector<HTMLTextAreaElement>(
          "textarea[name='message']",
        );
        if (textarea) {
          const selStart = prompt.indexOf("[");
          const selEnd = prompt.indexOf("]");
          if (selStart !== -1 && selEnd !== -1) {
            textarea.setSelectionRange(selStart, selEnd + 1);
            textarea.focus();
          }
        }
      }, 500);
    },
    [textInput],
  );

  // Hide quick-prompts on dedicated skill / cron creation pages — those
  // flows have their own on-boarding copy.
  const mode = searchParams.get("mode");
  if (mode === "skill" || mode === "cron") return null;

  return (
    <Suggestions className="min-h-16 w-fit items-start">
      <ConfettiButton
        className={cn(
          "cursor-pointer rounded-full border px-4 py-2 text-xs font-medium transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
          SUGGESTION_COLORS.surprise.bg,
          SUGGESTION_COLORS.surprise.text,
          SUGGESTION_COLORS.surprise.border,
        )}
        variant="outline"
        size="sm"
        onClick={() => handleSuggestionClick(t.inputBox.surpriseMePrompt)}
      >
        <SparklesIcon className={cn("size-4", SUGGESTION_COLORS.surprise.icon)} /> {t.inputBox.surpriseMe}
      </ConfettiButton>
      {t.inputBox.suggestions.map((suggestion) => {
        const colorKey = getSuggestionColorKey(suggestion.suggestion);
        const colorTheme = SUGGESTION_COLORS[colorKey];
        return (
          <Suggestion
            key={suggestion.suggestion}
            icon={suggestion.icon}
            suggestion={suggestion.suggestion}
            colorTheme={colorTheme}
            onClick={() => handleSuggestionClick(suggestion.prompt)}
          />
        );
      })}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Suggestion
            icon={PlusIcon}
            suggestion={t.common.create}
            colorTheme={SUGGESTION_COLORS.create}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuGroup>
            {t.inputBox.suggestionsCreate.map((suggestion, index) =>
              "type" in suggestion && suggestion.type === "separator" ? (
                <DropdownMenuSeparator key={index} />
              ) : (
                !("type" in suggestion) && (
                  <DropdownMenuItem
                    key={suggestion.suggestion}
                    onClick={() => handleSuggestionClick(suggestion.prompt)}
                  >
                    {suggestion.icon && <suggestion.icon className="size-4" />}
                    {suggestion.suggestion}
                  </DropdownMenuItem>
                )
              ),
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </Suggestions>
  );
}
