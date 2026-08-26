"use client";

import { Loader2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useConfigSection } from "../use-config-section";

const labelCls = "text-sm font-medium leading-none";
const hintCls = "mt-0.5 text-xs text-muted-foreground";

interface NetworkConfig {
  proxy: string | null;
  web_search_max_results: number;
  web_fetch_timeout: number;
  image_search_max_results: number;
}

const defaultConfig: NetworkConfig = {
  proxy: null,
  web_search_max_results: 5,
  web_fetch_timeout: 10,
  image_search_max_results: 5,
};

export function NetworkForm() {
  const { data: rawData, loading, saving, save } = useConfigSection<NetworkConfig>(
    "network",
    defaultConfig,
  );
  // Merge defaults so partial API data never leaves fields undefined.
  const data: NetworkConfig = { ...defaultConfig, ...rawData };
  const [local, setLocal] = useState<NetworkConfig>(data);

  useEffect(() => {
    setLocal({ ...defaultConfig, ...rawData });
  }, [rawData]);

  const dirty = JSON.stringify(local) !== JSON.stringify(data);

  const update = <K extends keyof NetworkConfig>(
    key: K,
    value: NetworkConfig[K],
  ) => setLocal((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    try {
      await save(local);
      toast.success("网络配置已更新");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold">网络代理与搜索</h4>
        <p className={hintCls}>
          全局代理供所有 web 工具共享（web_search、image_search、web_fetch、浏览器自动化）
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          加载中…
        </div>
      ) : (
        <div className="space-y-3">
          {/* Proxy */}
          <div className="grid gap-1.5">
            <label className={labelCls}>代理地址</label>
            <Input
              type="text"
              value={local.proxy ?? ""}
              onChange={(e) => update("proxy", e.target.value || null)}
              placeholder="http://127.0.0.1:7890"
              disabled={saving}
            />
            <p className={hintCls}>
              支持 http://host:port、https://、socks5://。留空则直连。需重启后端生效。
            </p>
          </div>

          {/* Search defaults */}
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <label className={labelCls}>网页搜索结果数</label>
              <Input
                type="number"
                min={1}
                max={50}
                value={local.web_search_max_results}
                onChange={(e) =>
                  update("web_search_max_results", Number(e.target.value))
                }
                disabled={saving}
              />
            </div>
            <div className="grid gap-1.5">
              <label className={labelCls}>网页抓取超时（秒）</label>
              <Input
                type="number"
                min={1}
                max={120}
                value={local.web_fetch_timeout}
                onChange={(e) =>
                  update("web_fetch_timeout", Number(e.target.value))
                }
                disabled={saving}
              />
            </div>
            <div className="grid gap-1.5">
              <label className={labelCls}>图片搜索结果数</label>
              <Input
                type="number"
                min={1}
                max={50}
                value={local.image_search_max_results}
                onChange={(e) =>
                  update("image_search_max_results", Number(e.target.value))
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
