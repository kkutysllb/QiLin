"use client";

import { KeyRoundIcon, Loader2Icon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { fetch } from "@/core/api/fetcher";
import { getBackendBaseURL } from "@/core/config";

import { ConfigFormShell, SettingSwitchRow } from "../config-form-shell";
import { hintCls, labelCls } from "../form-styles";
import { useConfigSection } from "../use-config-section";
import { useLocalDraft } from "../use-local-draft";

interface SandboxConfig {
  use: string;
  allow_host_bash: boolean;
  bash_output_max_chars: number;
  read_file_output_max_chars: number;
  ls_output_max_chars: number;
  bash_command_timeout: number;
  environment: Record<string, string>;
}

const defaultConfig: SandboxConfig = {
  use: "kworks.sandbox.local:LocalSandboxProvider",
  allow_host_bash: true,
  bash_output_max_chars: 20000,
  read_file_output_max_chars: 50000,
  ls_output_max_chars: 20000,
  bash_command_timeout: 600,
  environment: {},
};

// ── Env key discovery ──────────────────────────────────────────────────

interface EnvKeyItem {
  key: string;
  configured: boolean;
  is_secret: boolean;
}

async function fetchEnvKeys(): Promise<EnvKeyItem[]> {
  // Absolute gateway URL is required: in the packaged build the frontend is a
  // static export served over the app:// protocol with no /api proxy, so a
  // relative fetch would hit the SPA fallback (index.html) and fail to parse.
  const resp = await fetch(`${getBackendBaseURL()}/api/datasources/env-keys`);
  if (!resp.ok) return [];
  const data = await resp.json();
  return (data.keys ?? []) as EnvKeyItem[];
}

export function SandboxForm() {
  const { data: rawData, loading, saving, save } = useConfigSection<SandboxConfig>(
    "sandbox",
    defaultConfig,
  );
  // Merge defaults so partial API data never leaves fields undefined.
  const data = useMemo<SandboxConfig>(
    () => ({ ...defaultConfig, ...rawData }),
    [rawData],
  );
  const { draft: local, setDraft: setLocal, dirty, reset } = useLocalDraft(data);
  const [providerKey, setProviderKey] = useState("local");
  const [envKeys, setEnvKeys] = useState<EnvKeyItem[]>([]);
  const [envKeysLoading, setEnvKeysLoading] = useState(true);

  // 草稿同步由 useLocalDraft 承担；这里仅保留 providerKey 与 rawData 的联动。
  useEffect(() => {
    setProviderKey(rawData.use?.includes("Local") ? "local" : "docker");
  }, [rawData]);

  const refreshEnvKeys = useCallback(async () => {
    setEnvKeysLoading(true);
    try {
      setEnvKeys(await fetchEnvKeys());
    } catch {
      setEnvKeys([]);
    } finally {
      setEnvKeysLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshEnvKeys();
  }, [refreshEnvKeys]);

  const update = <K extends keyof SandboxConfig>(
    key: K,
    value: SandboxConfig[K],
  ) => setLocal((prev) => ({ ...prev, [key]: value }));

  const handleProviderChange = (key: string) => {
    setProviderKey(key);
    if (key === "local") {
      update("use", "kworks.sandbox.local:LocalSandboxProvider");
    } else {
      update("use", "kworks.sandbox.docker:DockerSandboxProvider");
    }
  };

  // Toggle a credential key in sandbox.environment. When enabled, the value
  // is stored as "$KEY" so the gateway resolves it from os.environ at runtime.
  const toggleEnvKey = (key: string, enabled: boolean) => {
    setLocal((prev) => {
      const next = { ...prev.environment };
      if (enabled) {
        next[key] = `$${key}`;
      } else {
        delete next[key];
      }
      return { ...prev, environment: next };
    });
  };

  const isEnvKeyEnabled = (key: string) => key in local.environment;

  const handleSave = async () => {
    try {
      await save(local);
      toast.success("沙箱配置已更新");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  return (
    <ConfigFormShell
      title="沙箱 (Sandbox)"
      description="控制代码执行与文件操作的沙箱环境"
      loading={loading}
      saving={saving}
      dirty={dirty}
      onSave={handleSave}
      onReset={reset}
    >
      {/* Provider */}
      <div className="grid gap-2">
        <label className={labelCls}>沙箱提供者</label>
        <Select value={providerKey} onValueChange={handleProviderChange}>
          <SelectTrigger className="w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="local">
              本地执行 (LocalSandboxProvider)
            </SelectItem>
            <SelectItem value="docker">
              Docker (DockerSandboxProvider)
            </SelectItem>
          </SelectContent>
        </Select>
        <p className={hintCls}>
          桌面端推荐使用本地执行；Docker 模式需要已安装并运行 Docker
        </p>
      </div>

      {/* Allow host bash */}
      <SettingSwitchRow
        label="允许主机 Bash 执行"
        hint="开启后智能体可直接在主机上执行 bash 命令"
        checked={local.allow_host_bash}
        onCheckedChange={(v) => update("allow_host_bash", v)}
        disabled={saving}
      />

      {/* Output truncation limits */}
      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-1.5">
          <label className={labelCls}>Bash 输出截断</label>
          <Input
            type="number"
            value={local.bash_output_max_chars}
            onChange={(e) =>
              update(
                "bash_output_max_chars",
                Number(e.target.value),
              )
            }
            disabled={saving}
          />
        </div>
        <div className="grid gap-1.5">
          <label className={labelCls}>读文件截断</label>
          <Input
            type="number"
            value={local.read_file_output_max_chars}
            onChange={(e) =>
              update(
                "read_file_output_max_chars",
                Number(e.target.value),
              )
            }
            disabled={saving}
          />
        </div>
        <div className="grid gap-1.5">
          <label className={labelCls}>ls 输出截断</label>
          <Input
            type="number"
            value={local.ls_output_max_chars}
            onChange={(e) =>
              update("ls_output_max_chars", Number(e.target.value))
            }
            disabled={saving}
          />
        </div>
      </div>
      <p className={hintCls}>以上数值单位为字符数，超过将被截断</p>

      {/* Bash command timeout */}
      <div className="grid gap-1.5">
        <label className={labelCls}>Bash 命令超时（秒）</label>
        <Input
          type="number"
          min={1}
          value={local.bash_command_timeout}
          onChange={(e) =>
            update("bash_command_timeout", Number(e.target.value))
          }
          disabled={saving}
        />
        <p className={hintCls}>
          单条主机 Bash 命令的最大执行时间，超时后进程组将被终止
        </p>
      </div>

      {/* Credential passthrough */}
      <div className="space-y-2 border-t pt-3">
        <div className="flex items-center gap-1.5">
          <KeyRoundIcon className="size-3.5 text-muted-foreground" />
          <label className={labelCls}>凭证透传</label>
        </div>
        <p className={hintCls}>
          沙箱默认清除 <code className="text-xs">*KEY</code> / <code className="text-xs">*TOKEN</code> / <code className="text-xs">*SECRET</code> 环境变量。
          开启需要的凭证后，智能体的 bash/python 脚本才能读取它们。
        </p>
        {envKeysLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2Icon className="size-3 animate-spin" />
            加载凭证列表…
          </div>
        ) : envKeys.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            .env 中没有已配置的凭证。请在「数据源」或「技能模型」中先配置。
          </p>
        ) : (
          <div className="space-y-1.5">
            {envKeys.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-1.5"
              >
                <div className="min-w-0">
                  <span className="font-mono text-xs">{item.key}</span>
                  {!item.configured && (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      （未配置）
                    </span>
                  )}
                </div>
                <Switch
                  checked={isEnvKeyEnabled(item.key)}
                  onCheckedChange={(v) => toggleEnvKey(item.key, v)}
                  disabled={saving || !item.configured}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </ConfigFormShell>
  );
}
