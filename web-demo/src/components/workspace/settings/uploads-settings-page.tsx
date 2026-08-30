"use client";

import { PaperclipIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/core/i18n/hooks";

import { UploadsForm } from "./config/settings-forms/uploads-form";
import { SettingsPageShell } from "./config/settings-page-shell";
import { useApplyAndRestart } from "./use-apply-and-restart";

export function UploadsSettingsPage() {
  const { t } = useI18n();
  const { restarting, applyAndRestart } = useApplyAndRestart();

  return (
    <SettingsPageShell
      title={t.settings.view.titles.uploads}
      description={t.settings.view.summaries.uploads}
      restarting={restarting}
      onRestart={applyAndRestart}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <PaperclipIcon className="size-4" /> 上传限制与文档转换
          </CardTitle>
        </CardHeader>
        <CardContent>
          <UploadsForm />
        </CardContent>
      </Card>
    </SettingsPageShell>
  );
}
