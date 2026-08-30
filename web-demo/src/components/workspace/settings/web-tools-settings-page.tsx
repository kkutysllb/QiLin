"use client";

import { GlobeIcon, MonitorIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/core/i18n/hooks";

import { BrowserForm } from "./config/settings-forms/browser-form";
import { NetworkForm } from "./config/settings-forms/network-form";
import { SettingsPageShell } from "./config/settings-page-shell";
import { useApplyAndRestart } from "./use-apply-and-restart";

export function WebToolsSettingsPage() {
  const { t } = useI18n();
  const { restarting, applyAndRestart } = useApplyAndRestart();

  return (
    <SettingsPageShell
      title={t.settings.view.titles.webTools}
      description={t.settings.view.summaries.webTools}
      restarting={restarting}
      onRestart={applyAndRestart}
    >
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
    </SettingsPageShell>
  );
}
