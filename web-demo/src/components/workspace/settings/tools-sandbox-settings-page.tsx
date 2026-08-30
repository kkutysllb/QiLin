"use client";

import {
  FileTextIcon,
  RepeatIcon,
  SearchIcon,
  TerminalIcon,
  TrendingUpIcon,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/core/i18n/hooks";

import { LoopDetectionForm } from "./config/settings-forms/loop-detection-form";
import { SandboxForm } from "./config/settings-forms/sandbox-form";
import { ToolOutputForm } from "./config/settings-forms/tool-output-form";
import { ToolProgressForm } from "./config/settings-forms/tool-progress-form";
import { ToolSearchForm } from "./config/settings-forms/tool-search-form";
import { SettingsPageShell } from "./config/settings-page-shell";
import { useApplyAndRestart } from "./use-apply-and-restart";

export function ToolsSandboxSettingsPage() {
  const { t } = useI18n();
  const { restarting, applyAndRestart } = useApplyAndRestart();

  return (
    <SettingsPageShell
      title={t.settings.view.titles.toolsSandbox}
      description={t.settings.view.summaries.toolsSandbox}
      restarting={restarting}
      onRestart={applyAndRestart}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <TerminalIcon className="size-4" /> 沙箱环境
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SandboxForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileTextIcon className="size-4" /> 工具输出预算
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ToolOutputForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <SearchIcon className="size-4" /> 工具延迟加载
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ToolSearchForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <TrendingUpIcon className="size-4" /> 工具进度追踪
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ToolProgressForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <RepeatIcon className="size-4" /> 循环检测
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LoopDetectionForm />
        </CardContent>
      </Card>
    </SettingsPageShell>
  );
}
