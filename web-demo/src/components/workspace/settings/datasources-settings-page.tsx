"use client";

import {
  CheckCircle2Icon,
  DatabaseIcon,
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
  PlugIcon,
  SaveIcon,
  XCircleIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetch, getCsrfHeaders } from "@/core/api/fetcher";
import { getBackendBaseURL } from "@/core/config";

import { SettingsSection } from "./settings-section";

interface DatasourceItem {
  key: string;
  display_name: string;
  description: string;
  configured: boolean;
  masked_value: string;
  secret: boolean;
  placeholder?: string | null;
  test_method?: string | null;
}

interface DatasourcesResponse {
  datasources: DatasourceItem[];
  env_file: string;
}

interface TestResult {
  success: boolean;
  message: string;
}

const MASK_SUFFIX = "***";

function isMasked(v: string): boolean {
  return v.endsWith(MASK_SUFFIX);
}

export function DatasourcesSettingsPage() {
  const [datasources, setDatasources] = useState<DatasourceItem[]>([]);
  const [envFile, setEnvFile] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${getBackendBaseURL()}/api/datasources/`, {
        headers: getCsrfHeaders(),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as DatasourcesResponse;
      setDatasources(data.datasources);
      setEnvFile(data.env_file);
      const initialEdits: Record<string, string> = {};
      for (const ds of data.datasources) {
        initialEdits[ds.key] = ds.masked_value;
      }
      setEdits(initialEdits);
      setTestResults({});
    } catch {
      setError("加载数据源配置失败，请确认网关已启动。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch(`${getBackendBaseURL()}/api/datasources/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
        body: JSON.stringify({ values: edits }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as DatasourcesResponse;
      setDatasources(data.datasources);
      const nextEdits: Record<string, string> = {};
      for (const ds of data.datasources) {
        nextEdits[ds.key] = ds.masked_value;
      }
      setEdits(nextEdits);
      setTestResults({});
      setMessage("凭证已保存到用户数据空间 .env。");
    } catch {
      setError("保存失败，请重试。");
    } finally {
      setSaving(false);
    }
  }, [edits]);

  const handleTest = useCallback(
    async (key: string) => {
      setTesting((prev) => ({ ...prev, [key]: true }));
      const currentValue = edits[key] ?? "";
      const body: { key: string; value: string | null } = {
        key,
        value: isMasked(currentValue) ? null : currentValue,
      };
      try {
        const res = await fetch(`${getBackendBaseURL()}/api/datasources/test`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as TestResult;
        setTestResults((prev) => ({ ...prev, [key]: data }));
      } catch {
        setTestResults((prev) => ({
          ...prev,
          [key]: { success: false, message: "网络错误，请重试。" },
        }));
      } finally {
        setTesting((prev) => ({ ...prev, [key]: false }));
      }
    },
    [edits],
  );

  return (
    <div className="space-y-8">
      <SettingsSection
        title="数据源凭证"
        description="管理金融数据接口凭证。凭证保存在用户数据空间的 .env 文件中，技能运行时自动加载。"
        icon={<DatabaseIcon className="w-5 h-5 text-cyan-500" />}
      >
        {envFile && (
          <p className="mb-4 font-mono text-xs text-muted-foreground">
            存储路径：{envFile}
          </p>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            加载中…
          </div>
        ) : datasources.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无数据源。</p>
        ) : (
          <div className="space-y-5">
            {datasources.map((ds) => {
              const val = edits[ds.key] ?? "";
              const result = testResults[ds.key];
              const isTesting = testing[ds.key];
              const show = showSecret[ds.key];
              const edited = val !== ds.masked_value && val !== "";
              return (
                <div key={ds.key} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <PlugIcon className="size-4 text-cyan-500" />
                    <span className="text-sm font-semibold">{ds.display_name}</span>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {ds.key}
                    </code>
                    {ds.configured && (
                      <span className="flex items-center gap-1 text-xs text-emerald-600">
                        <CheckCircle2Icon className="size-3.5" />
                        已配置
                      </span>
                    )}
                    {edited && (
                      <span className="text-xs text-amber-600">未保存</span>
                    )}
                  </div>
                  {ds.description && (
                    <p className="text-xs text-muted-foreground">{ds.description}</p>
                  )}
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={ds.secret && !show ? "password" : "text"}
                        placeholder={ds.placeholder ?? "输入凭证值"}
                        value={val}
                        onChange={(e) =>
                          setEdits((prev) => ({ ...prev, [ds.key]: e.target.value }))
                        }
                        className="pr-9 font-mono text-sm"
                      />
                      {ds.secret && (
                        <button
                          type="button"
                          onClick={() =>
                            setShowSecret((prev) => ({ ...prev, [ds.key]: !prev[ds.key] }))
                          }
                          className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label={show ? "隐藏" : "显示"}
                        >
                          {show ? (
                            <EyeOffIcon className="size-4" />
                          ) : (
                            <EyeIcon className="size-4" />
                          )}
                        </button>
                      )}
                    </div>
                    {ds.test_method && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isTesting || (!ds.configured && !edited)}
                        onClick={() => void handleTest(ds.key)}
                      >
                        {isTesting ? (
                          <Loader2Icon className="size-4 animate-spin" />
                        ) : (
                          "测试"
                        )}
                      </Button>
                    )}
                  </div>
                  {result && (
                    <div
                      className={`flex items-start gap-1.5 text-xs ${
                        result.success ? "text-emerald-600" : "text-red-500"
                      }`}
                    >
                      {result.success ? (
                        <CheckCircle2Icon className="mt-0.5 size-3.5 shrink-0" />
                      ) : (
                        <XCircleIcon className="mt-0.5 size-3.5 shrink-0" />
                      )}
                      <span>{result.message}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
        {message && <p className="mt-4 text-sm text-emerald-600">{message}</p>}

        <div className="mt-5">
          <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saving || loading}>
            {saving ? <Loader2Icon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
            保存
          </Button>
        </div>
      </SettingsSection>
    </div>
  );
}
