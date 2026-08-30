"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { writeTextToClipboard } from "@/core/clipboard";

/**
 * 复制文本到剪贴板并维护一小段时间的「已复制」反馈态。
 *
 * 内部走 core/clipboard 的 ``writeTextToClipboard``（clipboard API 优先，
 * execCommand 降级回退）。失败时 ``copied`` 不置位、不抛错，由调用方决定
 * 错误展示。
 *
 * @param timeout 反馈态回退时长（ms）。
 * @returns `copied` 反馈态，以及异步 `copy(text)`（返回是否复制成功）。
 */
export function useCopyToClipboard(timeout = 2000) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      const ok = await writeTextToClipboard(text);
      if (ok) {
        setCopied(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), timeout);
      }
      return ok;
    },
    [timeout],
  );

  return { copied, copy };
}
