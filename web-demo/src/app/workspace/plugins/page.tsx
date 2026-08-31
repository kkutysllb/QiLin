"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/**
 * Plugin management page (H3) - list / enable / disable / remove DSH
 * third-party plugins via the loopback management API on the web-demo
 * server. Every mutation requires a web-demo restart to take effect
 * (DSH-isomorphic lifecycle: server halves mount at boot).
 */
interface PluginRow {
  id: string;
  client: boolean;
  server: boolean;
  disabled: boolean;
  version: string | null;
  source: string | null;
}

const API = "/qilin-plugins/api";

async function callApi(body: Record<string, unknown>) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<{ ok: boolean; baseline?: string; plugins?: PluginRow[]; error?: string }>;
}

export default function PluginsPage() {
  const router = useRouter();
  const [plugins, setPlugins] = useState<PluginRow[]>([]);
  const [baseline, setBaseline] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const body = await callApi({ action: "list" });
      setPlugins(body.plugins ?? []);
      setBaseline(body.baseline ?? "");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const mutate = useCallback(async (body: Record<string, unknown>) => {
    const body2 = await callApi(body);
    if (!body2.ok) setError(body2.error ?? "unknown error");
    setDirty(true);
    await refresh();
  }, [refresh]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-4 p-6 text-sm">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">插件管理 · Plugins</h1>
        <button type="button" onClick={() => router.push("/workspace")} className="rounded-md border px-2 py-1 text-xs hover:bg-muted">
          返回工作区
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        DSH 插件宿主基线 / host baseline: <span className="font-mono">dsh {baseline}</span>。
        安装新插件请使用 CLI：<code className="font-mono">node scripts/plugin.mjs add &lt;dir&gt;</code>。
        所有变更需重启 web-demo 生效。
      </p>
      {dirty && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          有未生效的变更 —— 重启 web-demo dev server 后按新清单挂载。
        </div>
      )}
      {error && <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs">{error}</div>}
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2">插件 / id</th>
              <th className="px-3 py-2">版本</th>
              <th className="px-3 py-2">client</th>
              <th className="px-3 py-2">server</th>
              <th className="px-3 py-2">状态</th>
              <th className="px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {plugins.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-3 py-2 font-mono">{p.id}</td>
                <td className="px-3 py-2">{p.version ?? "—"}</td>
                <td className="px-3 py-2">{p.client ? "✓" : "—"}</td>
                <td className="px-3 py-2">{p.server ? "✓" : "—"}</td>
                <td className="px-3 py-2">{p.disabled ? "已停用" : "启用"}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="rounded border px-1.5 py-0.5 hover:bg-muted"
                      onClick={() => mutate({ action: "setDisabled", id: p.id, disabled: !p.disabled })}
                    >
                      {p.disabled ? "启用" : "停用"}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-red-500/40 px-1.5 py-0.5 text-red-600 hover:bg-red-500/10"
                      onClick={() => mutate({ action: "remove", id: p.id })}
                    >
                      卸载
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {plugins.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  尚未安装任何插件 —— 用 CLI 安装后刷新本页。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}