"use client";

import { Loader2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

import { useConfigSection } from "../use-config-section";

const labelCls = "text-sm font-medium leading-none";
const hintCls = "mt-0.5 text-xs text-muted-foreground";

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
  const data: BrowserConfig = { ...defaultConfig, ...rawData };
  const [local, setLocal] = useState<BrowserConfig>(data);

  useEffect(() => {
    setLocal({ ...defaultConfig, ...rawData });
  }, [rawData]);

  const dirty = JSON.stringify(local) !== JSON.stringify(data);

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
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold">浏览器自动化</h4>
        <p className={hintCls}>
          Playwright Chromium 无头浏览器的运行参数
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          加载中…
        </div>
      ) : (
        <div className="space-y-3">
          {/* Headless toggle */}
          <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
            <div>
              <p className={labelCls}>无头模式 (Headless)</p>
              <p className={hintCls}>
                开启后浏览器在后台运行，不显示窗口
              </p>
            </div>
            <Switch
              checked={local.browser_headless}
              onCheckedChange={(v) => update("browser_headless", v)}
              disabled={saving}
            />
          </div>

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

          <div className="flex gap-2 pt-1">
            <Button size="sm" disabled={!dirty || saving} onClick={handleSave}>
              {saving ? "保存中…" : "保存"}
            </Button>
            {dirty && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLocal(data)}
                disabled={saving}
              >
                重置
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
