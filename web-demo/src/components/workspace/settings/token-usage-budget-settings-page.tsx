"use client";

import {
  BarChart3Icon,
  GaugeIcon,
  Loader2Icon,
  PowerIcon,
  WalletIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/core/i18n/hooks";

import { TokenUsageDashboard } from "../token-usage/token-usage-dashboard";
import { TokenBudgetForm } from "./config/settings-forms/token-budget-form";
import { TokenUsageForm } from "./config/settings-forms/token-usage-form";
import { useApplyAndRestart } from "./use-apply-and-restart";

export function TokenUsageBudgetSettingsPage() {
  const { t } = useI18n();
  const { restarting, applyAndRestart } = useApplyAndRestart();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">
            {t.settings.view.titles.tokenUsageBudget}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t.settings.view.summaries.tokenUsageBudget}
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
            <GaugeIcon className="size-4" /> Token 使用统计
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TokenUsageForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <WalletIcon className="size-4" /> Token 预算限制
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TokenBudgetForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <BarChart3Icon className="size-4" /> {t.settings.tokenUsage.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TokenUsageDashboard />
        </CardContent>
      </Card>
    </div>
  );
}
