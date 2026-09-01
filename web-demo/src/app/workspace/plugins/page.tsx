"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/**
 * Plugin management page (H3 + npm install) - install (npm registry) /
 * list / enable / disable / remove DSH third-party plugins via the
 * loopback management API on the web-demo server. Every mutation
 * requires a web-demo restart to take effect (DSH-isomorphic lifecycle:
 * server halves mount at boot).
 */
interface PluginRow {
  id: string;
  client: boolean;
  server: boolean;
  disabled: boolean;
  version: string | null;
  source: string | null;
}

interface InstallResult {
  ok: boolean;
  id?: string;
  version?: string | null;
  replaced?: boolean;
  error?: string;
}

const API = "/qilin-plugins/api";

async function callApi(body: Record<string, unknown>) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<
    | (InstallResult & { baseline?: string; plugins?: PluginRow[] })
    | { ok: boolean; error?: string }
  >;
}

export default function PluginsPage() {
  const router = useRouter();
  const [plugins, setPlugins] = useState<PluginRow[]>([]);
  const [baseline, setBaseline] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pkg, setPkg] = useState("");
  const [installing, setInstalling] = useState(false);
  const [installMsg, setInstallMsg] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const body = (await callApi({ action: "list" })) as {
        ok: boolean;
        baseline?: string;
        plugins?: PluginRow[];
      };
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

  const mutate = useCallback(
    async (body: Record<string, unknown>) => {
      const body2 = await callApi(body);
      if (!body2.ok) setError(body2.error ?? "unknown error");
      setDirty(true);
      await refresh();
    },
    [refresh],
  );

  const install = useCallback(async () => {
    const name = pkg.trim();
    if (!name || installing) return;
    setInstalling(true);
    setInstallMsg(null);
    try {
      const body = (await callApi({
        action: "install",
        pkg: name,
      })) as InstallResult;
      if (body.ok) {
        setInstallMsg({
          ok: true,
          text: `已安装 ${body.id} v${body.version ?? "?"}${body.replaced ? "（升级覆盖）" : ""} —— 重启 web-demo 后生效。`,
        });
        setPkg("");
      } else {
        setInstallMsg({ ok: false, text: body.error ?? "安装失败" });
      }
      setDirty(true);
      await refresh();
    } catch (err) {
      setInstallMsg({
        ok: false,
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setInstalling(false);
    }
  }, [pkg, installing, refresh]);

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
      <p className="text-muted-foreground text-xs">
        DSH 插件宿主基线 / host baseline:{" "}
        <span className="font-mono">dsh {baseline}</span>。 支持从 npm
        安装已发布的 DSH 插件（等价官方{" "}
        <code className="font-mono">dsh plugin --profile web add</code> 的 pnpm
        转义安装）， 也可用 CLI：
        <code className="font-mono">
          node scripts/plugin.mjs add &lt;dir&gt;
        </code>
        。 所有变更需重启 web-demo 生效。
      </p>

      {dirty && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          有未生效的变更 —— 重启 web-demo dev server 后按新清单挂载。
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs">
          {error}
        </div>
      )}

      <div className="rounded-lg border p-4">
        <div className="text-sm font-medium">从 npm 安装</div>
        <p className="text-muted-foreground mt-1 text-xs">
          包名与 npm 一致（支持 scope），例如{" "}
          <code className="font-mono">@kkutysllb/dsh-git-panel</code>、
          <code className="font-mono">@kkutysllb/dsh-terminal</code>、
          <code className="font-mono">dsh-super-ppts</code>
          。拉包失败会自动回退官方源重试。
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={pkg}
            onChange={(e) => setPkg(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void install();
            }}
            placeholder="@scope/plugin-name 或 plugin-name"
            spellCheck={false}
            className="focus:ring-ql-gold-500 flex-1 rounded-md border bg-transparent px-2 py-1.5 font-mono text-xs outline-none focus:ring-1"
          />
          <button
            type="button"
            disabled={!pkg.trim() || installing}
            onClick={() => void install()}
            className="border-ql-gold-700 bg-ql-gold-500/10 hover:bg-ql-gold-500/20 rounded-md border px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            {installing ? "安装中…" : "安装"}
          </button>
        </div>
        {installMsg && (
          <div
            className={
              "mt-2 rounded-md border px-3 py-2 text-xs " +
              (installMsg.ok
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-red-500/40 bg-red-500/10")
            }
          >
            {installMsg.text}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-muted-foreground text-left">
            <tr>
              <th className="px-3 py-2">插件 / id</th>
              <th className="px-3 py-2">版本</th>
              <th className="px-3 py-2">client</th>
              <th className="px-3 py-2">server</th>
              <th className="px-3 py-2">来源</th>
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
                <td
                  className="text-muted-foreground max-w-52 truncate px-3 py-2 font-mono text-[10px]"
                  title={p.source ?? undefined}
                >
                  {p.source ?? "—"}
                </td>
                <td className="px-3 py-2">{p.disabled ? "已停用" : "启用"}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="hover:bg-muted rounded border px-1.5 py-0.5"
                      onClick={() =>
                        mutate({
                          action: "setDisabled",
                          id: p.id,
                          disabled: !p.disabled,
                        })
                      }
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
                <td
                  colSpan={7}
                  className="text-muted-foreground px-3 py-6 text-center"
                >
                  尚未安装任何插件 —— 在上方输入 npm 包名安装，或用 CLI
                  添加本地目录。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
