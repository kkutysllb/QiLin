"use client";
import { useRouter } from "next/navigation";

import { PluginsSettingsPage } from "@/components/workspace/settings/plugins-settings-page";

/**
 * Standalone plugins management route — thin shell around the shared
 * PluginsSettingsPage (same content as the settings "插件管理" section).
 */
export default function PluginsPage() {
  const router = useRouter();
  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-4 p-6 text-sm">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">插件管理 · Plugins</h1>
        <button
          type="button"
          onClick={() => router.push("/workspace")}
          className="hover:bg-muted rounded-md border px-2 py-1 text-xs"
        >
          返回工作区
        </button>
      </div>
      <PluginsSettingsPage />
    </div>
  );
}
