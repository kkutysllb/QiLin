"use client";

import { DatabaseIcon, HardDriveIcon, Loader2Icon, PowerIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { DataDirectoryTable } from "./data-directory-table";
import { PersistenceStatusDashboard } from "./persistence-status-dashboard";
import { DatabaseForm } from "./config/settings-forms/database-form";
import { RunEventsForm } from "./config/settings-forms/run-events-form";
import { useApplyAndRestart } from "./use-apply-and-restart";

export function DataPersistenceSettingsPage() {
  const { restarting, applyAndRestart } = useApplyAndRestart();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">数据与持久化</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            管理数据落盘策略、查看持久化状态与磁盘占用。修改后点击「应用并重启」生效。
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
    </div>
  );
}
