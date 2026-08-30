"use client";

import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBytes } from "@/core/persistence/format";

import { ConfigFormShell, SettingSwitchRow } from "../config-form-shell";
import { hintCls, labelCls } from "../form-styles";
import { useConfigSection } from "../use-config-section";
import { useLocalDraft } from "../use-local-draft";

interface UploadsConfig {
  max_files: number;
  max_file_size: number;
  max_total_size: number;
  auto_convert_documents: boolean;
  pdf_converter: string;
}

const defaultConfig: UploadsConfig = {
  max_files: 10,
  max_file_size: 52428800, // 50 MiB
  max_total_size: 104857600, // 100 MiB
  auto_convert_documents: false,
  pdf_converter: "auto",
};

export function UploadsForm() {
  const { data, loading, saving, save } = useConfigSection<UploadsConfig>(
    "uploads",
    defaultConfig,
  );
  const { draft: local, setDraft: setLocal, dirty, reset } = useLocalDraft(data);

  const update = <K extends keyof UploadsConfig>(
    key: K,
    value: UploadsConfig[K],
  ) => setLocal((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    try {
      await save(local);
      toast.success("上传限制配置已更新");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  return (
    <ConfigFormShell
      title="上传限制 (Uploads)"
      description="控制用户上传文件的数量和大小限制"
      loading={loading}
      saving={saving}
      dirty={dirty}
      onSave={handleSave}
      onReset={reset}
    >
      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-1.5">
          <label className={labelCls}>最大文件数</label>
          <Input
            type="number"
            min={1}
            max={100}
            value={local.max_files}
            onChange={(e) => update("max_files", Number(e.target.value))}
            disabled={saving}
          />
        </div>
        <div className="grid gap-1.5">
          <label className={labelCls}>单文件上限 (bytes)</label>
          <Input
            type="number"
            min={1}
            value={local.max_file_size}
            onChange={(e) =>
              update("max_file_size", Number(e.target.value))
            }
            disabled={saving}
          />
          <p className={hintCls}>{formatBytes(local.max_file_size)}</p>
        </div>
        <div className="grid gap-1.5">
          <label className={labelCls}>总大小上限 (bytes)</label>
          <Input
            type="number"
            min={1}
            value={local.max_total_size}
            onChange={(e) =>
              update("max_total_size", Number(e.target.value))
            }
            disabled={saving}
          />
          <p className={hintCls}>{formatBytes(local.max_total_size)}</p>
        </div>
      </div>

      <SettingSwitchRow
        label="自动转换文档"
        hint="将 PDF / Word / Excel 等文档自动转换为纯文本"
        checked={local.auto_convert_documents}
        onCheckedChange={(v) => update("auto_convert_documents", v)}
        disabled={saving}
      />

      <div className="grid gap-2">
        <label className={labelCls}>PDF 转换器</label>
        <Select
          value={local.pdf_converter}
          onValueChange={(v) => update("pdf_converter", v)}
        >
          <SelectTrigger className="w-48" disabled={saving}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">自动检测 (auto)</SelectItem>
            <SelectItem value="pymupdf4llm">pymupdf4llm</SelectItem>
            <SelectItem value="markitdown">markitdown</SelectItem>
          </SelectContent>
        </Select>
        <p className={hintCls}>指定 PDF 文件转文本时使用的库</p>
      </div>
    </ConfigFormShell>
  );
}
