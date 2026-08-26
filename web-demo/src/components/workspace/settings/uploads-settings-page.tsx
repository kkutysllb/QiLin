"use client";

import {
  Loader2Icon,
  PaperclipIcon,
  PowerIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/core/i18n/hooks";

import { UploadsForm } from "./config/settings-forms/uploads-form";
import { useApplyAndRestart } from "./use-apply-and-restart";

export function UploadsSettingsPage() {
  const { t } = useI18n();
  const { restarting, applyAndRestart } = useApplyAndRestart();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">
            {t.settings.view.titles.uploads}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t.settings.view.summaries.uploads}
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
            <PaperclipIcon className="size-4" /> 上传限制与文档转换
          </CardTitle>
        </CardHeader>
        <CardContent>
          <UploadsForm />
        </CardContent>
      </Card>
    </div>
  );
}
