/**
 * core/settings per-thread 快照字段的内部共享件（非对外 API）。
 *
 * local.ts（localStorage 持久化）与 store.ts（内存快照缓存）围绕同一批
 * per-thread 字段（model / agent / workspace-path / workspace-id）各自
 * 维护读写逻辑，历史上 sentinel 三态解析表达式在两文件间逐字重复 6 处。
 * 本模块把可共享原语收敛到单一来源：
 *
 * - {@link parseRawThreadFieldValue}：sentinel 三态解析的唯一实现；
 * - {@link isBrowser}：SSR 守卫。
 */

/** SSR / 无 DOM 环境守卫：localStorage 仅在浏览器可用。 */
export function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/** localStorage 原始读取结果：``present`` 表示该 thread 是否存在覆写记录。 */
export interface RawThreadFieldValue {
  present: boolean;
  value: string | undefined;
}

/**
 * 解析 per-thread 字段的 localStorage 原始值（三态语义的唯一权威实现）：
 *
 * - ``raw === null``：从未存储 → ``present: false``，值回落全局设置；
 * - ``raw === sentinel``：用户显式恢复默认 → ``present: true`` 但值为
 *   ``undefined``（与「从未存储」区分开）；
 * - 其余：原值透传。
 *
 * ``sentinel`` 传 ``undefined`` 表示该字段无三态语义（如 model_name），
 * 此时除 ``null`` 外一律原值透传。
 */
export function parseRawThreadFieldValue(
  raw: string | null,
  sentinel: string | undefined,
): RawThreadFieldValue {
  if (raw === null) {
    return { present: false, value: undefined };
  }
  return {
    present: true,
    value: sentinel !== undefined && raw === sentinel ? undefined : raw,
  };
}
