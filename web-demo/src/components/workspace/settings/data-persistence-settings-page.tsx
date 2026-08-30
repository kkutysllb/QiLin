"use client";

import { DatabaseIcon, HardDriveIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { DatabaseForm } from "./config/settings-forms/database-form";
import { RunEventsForm } from "./config/settings-forms/run-events-form";
import { SettingsPageShell } from "./config/settings-page-shell";
import { DataDirectoryTable } from "./data-directory-table";
import { PersistenceStatusDashboard } from "./persistence-status-dashboard";
import { useApplyAndRestart } from "./use-apply-and-restart";

export function DataPersistenceSettingsPage() {
  const { restarting, applyAndRestart } = useApplyAndRestart();

  return (
    <SettingsPageShell
      title="数据与持久化"
      description="管理数据落盘策略、查看持久化状态与磁盘占用。修改后点击「应用并重启」生效。"
      restarting={restarting}
      onRestart={applyAndRestart}
    >
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">持久化状态总览</h4>
        <PersistenceStatusDashboard />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <DatabaseIcon className="size-4" /> 数据库后端
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DatabaseForm />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <HardDriveIcon className="size-4" /> 运行事件
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RunEventsForm />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-semibold">数据目录管理</h4>
        <DataDirectoryTable />
      </section>
    </SettingsPageShell>
  );
}
