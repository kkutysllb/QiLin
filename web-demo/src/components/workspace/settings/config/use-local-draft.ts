"use client";

import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

/**
 * Config 表单本地草稿：草稿同步 + dirty + reset。
 *
 * - 草稿同步沿用原表单的 `useEffect(() => setLocal(data), [data])` 写法：
 *   外部 `data` 引用变化时覆盖本地未保存草稿。调用方若在渲染期现场合并
 *   默认值（`{ ...defaultConfig, ...rawData }`），必须先用 `useMemo`
 *   固定合并结果，否则每帧新引用会把草稿不停重置。
 * - `dirty` 保持原 `JSON.stringify(draft) !== JSON.stringify(data)` 的
 *   深比较语义（键序一致的对象逐字段等价）。
 */
export function useLocalDraft<T>(data: T): {
  /** 本地草稿（原各表单的 `local`）。 */
  draft: T;
  /** 草稿写入函数（原各表单的 `setLocal`）。 */
  setDraft: Dispatch<SetStateAction<T>>;
  /** 草稿与外部数据是否不一致。 */
  dirty: boolean;
  /** 丢弃草稿，回到外部数据（原各表单重置按钮的 `setLocal(data)`）。 */
  reset: () => void;
} {
  const [draft, setDraft] = useState<T>(data);

  useEffect(() => {
    setDraft(data);
  }, [data]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(data);

  const reset = useCallback(() => {
    setDraft(data);
  }, [data]);

  return { draft, setDraft, dirty, reset };
}
