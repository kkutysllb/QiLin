"use client";

import { BarChart3Icon, GaugeIcon, WalletIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/core/i18n/hooks";

import { TokenUsageDashboard } from "../token-usage/token-usage-dashboard";

import { TokenBudgetForm } from "./config/settings-forms/token-budget-form";
import { TokenUsageForm } from "./config/settings-forms/token-usage-form";
import { SettingsPageShell } from "./config/settings-page-shell";
import { useApplyAndRestart } from "./use-apply-and-restart";

export function TokenUsageBudgetSettingsPage() {
  const { t } = useI18n();
  const { restarting, applyAndRestart } = useApplyAndRestart();

  return (
    <SettingsPageShell
      title={t.settings.view.titles.tokenUsageBudget}
      description={t.settings.view.summaries.tokenUsageBudget}
      restarting={restarting}
      onRestart={applyAndRestart}
    >
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
    </SettingsPageShell>
  );
}
