"use client";

import { useMemo } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";

import { ConfigFormShell, SettingSwitchRow } from "../config-form-shell";
import { labelCls } from "../form-styles";
import { useConfigSection } from "../use-config-section";
import { useLocalDraft } from "../use-local-draft";

interface BrowserConfig {
  browser_headless: boolean;
  browser_viewport_width: number;
  browser_viewport_height: number;
  browser_timeout_ms: number;
}

const defaultConfig: BrowserConfig = {
  browser_headless: true,
  browser_viewport_width: 1280,
  browser_viewport_height: 720,
  browser_timeout_ms: 30000,
};

export function BrowserForm() {
  const { data: rawData, loading, saving, save } = useConfigSection<BrowserConfig>(
    "network",
    defaultConfig,
  );
  // Merge defaults so partial API data never leaves fields undefined.
  const data = useMemo<BrowserConfig>(
    () => ({ ...defaultConfig, ...rawData }),
    [rawData],
  );
  const { draft: local, setDraft: setLocal, dirty, reset } = useLocalDraft(data);

  const update = <K extends keyof BrowserConfig>(
    key: K,
    value: BrowserConfig[K],
  ) => setLocal((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    try {
      await save(local);
      toast.success("浏览器配置已更新");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  return (
    <ConfigFormShell
      title="浏览器自动化"
      description="Playwright Chromium 无头浏览器的运行参数"
      loading={loading}
      saving={saving}
      dirty={dirty}
      onSave={handleSave}
      onReset={reset}
    >
      {/* Headless toggle */}
      <SettingSwitchRow
        label="无头模式 (Headless)"
        hint="开启后浏览器在后台运行，不显示窗口"
        checked={local.browser_headless}
        onCheckedChange={(v) => update("browser_headless", v)}
        disabled={saving}
      />

      {/* Viewport + timeout */}
      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-1.5">
          <label className={labelCls}>视口宽度</label>
          <Input
            type="number"
            min={320}
            max={3840}
            value={local.browser_viewport_width}
            onChange={(e) =>
              update("browser_viewport_width", Number(e.target.value))
            }
            disabled={saving}
          />
        </div>
        <div className="grid gap-1.5">
          <label className={labelCls}>视口高度</label>
          <Input
            type="number"
            min={240}
            max={2160}
            value={local.browser_viewport_height}
            onChange={(e) =>
              update("browser_viewport_height", Number(e.target.value))
            }
            disabled={saving}
          />
        </div>
        <div className="grid gap-1.5">
          <label className={labelCls}>超时（毫秒）</label>
          <Input
            type="number"
            min={1000}
            max={120000}
            value={local.browser_timeout_ms}
            onChange={(e) =>
              update("browser_timeout_ms", Number(e.target.value))
            }
            disabled={saving}
          />
        </div>
      </div>
    </ConfigFormShell>
  );
}
