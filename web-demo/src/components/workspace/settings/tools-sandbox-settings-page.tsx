"use client";

import {
  FileTextIcon,
  Loader2Icon,
  PowerIcon,
  RepeatIcon,
  SearchIcon,
  TerminalIcon,
  TrendingUpIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/core/i18n/hooks";

import { LoopDetectionForm } from "./config/settings-forms/loop-detection-form";
import { SandboxForm } from "./config/settings-forms/sandbox-form";
import { ToolOutputForm } from "./config/settings-forms/tool-output-form";
import { ToolProgressForm } from "./config/settings-forms/tool-progress-form";
import { ToolSearchForm } from "./config/settings-forms/tool-search-form";
import { useApplyAndRestart } from "./use-apply-and-restart";

export function ToolsSandboxSettingsPage() {
  const { t } = useI18n();
  const { restarting, applyAndRestart } = useApplyAndRestart();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">
            {t.settings.view.titles.toolsSandbox}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t.settings.view.summaries.toolsSandbox}
          </p>
        </div>
        <Button
          size="sm"
          onClick={applyAndRestart}
          disabled={restarting}
          className="w-fit gap-1.5 self-start sm:self-auto"
        >
          {restarting ? (
            <>
              <Loader2Icon className="size-3.5 animate-spin" />
              重启中…
            </>
          ) : (
            <>
              <PowerIcon className="size-3.5" />
              应用并重启
            </>
          )}
        </Button>
      </div>

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
    </div>
  );
}
