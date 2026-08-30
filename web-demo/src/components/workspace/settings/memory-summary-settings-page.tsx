"use client";

import {
  ChevronDownIcon,
  DatabaseIcon,
  MessageSquareTextIcon,
  ScrollTextIcon,
  TypeIcon,
} from "lucide-react";
import { useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { MemoryForm } from "./config/settings-forms/memory-form";
import { SummarizationForm } from "./config/settings-forms/summarization-form";
import { TitleForm } from "./config/settings-forms/title-form";
import { SettingsPageShell } from "./config/settings-page-shell";
import { MemoryFactsManager } from "./memory-facts-manager";
import { useApplyAndRestart } from "./use-apply-and-restart";

export function MemorySummarySettingsPage() {
  const { restarting, applyAndRestart } = useApplyAndRestart();
  // 记忆事实管理整块可折叠（默认展开）：点击标题栏收起/展开整个
  // 事实列表，避免长列表占据页面空间。
  const [factsOpen, setFactsOpen] = useState(true);

  return (
    <SettingsPageShell
      title="记忆与摘要"
      description="管理长期记忆、对话摘要压缩与标题生成策略。修改后点击「应用并重启」生效。"
      restarting={restarting}
      onRestart={applyAndRestart}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <ScrollTextIcon className="size-4" /> 记忆配置
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MemoryForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="cursor-pointer select-none" onClick={() => setFactsOpen((v) => !v)}>
          <CardTitle className="flex items-center gap-2 text-sm">
            <DatabaseIcon className="size-4" /> 记忆事实管理
            <ChevronDownIcon
              className={cn(
                "ml-auto size-4 text-muted-foreground transition-transform duration-200",
                factsOpen ? "" : "-rotate-90",
              )}
            />
          </CardTitle>
        </CardHeader>
        {factsOpen && (
          <CardContent>
            <MemoryFactsManager />
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <MessageSquareTextIcon className="size-4" /> 对话摘要
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SummarizationForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <TypeIcon className="size-4" /> 标题生成
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TitleForm />
        </CardContent>
      </Card>
    </SettingsPageShell>
  );
}
