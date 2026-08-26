"use client";

import {
  GlobeIcon,
  Loader2Icon,
  MonitorIcon,
  PowerIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/core/i18n/hooks";

import { BrowserForm } from "./config/settings-forms/browser-form";
import { NetworkForm } from "./config/settings-forms/network-form";
import { useApplyAndRestart } from "./use-apply-and-restart";

export function WebToolsSettingsPage() {
  const { t } = useI18n();
  const { restarting, applyAndRestart } = useApplyAndRestart();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">
            {t.settings.view.titles.webTools}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t.settings.view.summaries.webTools}
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
            <GlobeIcon className="size-4" /> 网络代理与搜索
          </CardTitle>
        </CardHeader>
        <CardContent>
          <NetworkForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <MonitorIcon className="size-4" /> 浏览器自动化
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BrowserForm />
        </CardContent>
      </Card>
    </div>
  );
}
