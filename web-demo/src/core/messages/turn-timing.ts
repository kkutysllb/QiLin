/**
 * turn-timing — turn 墙钟用时的客户端实测归档与展示格式。
 *
 * MessageFeed 在 `thread.isLoading` 的 false→true 跳变记录起点，
 * true→false 时冻结总用时，并以本轮 assistant runId（与
 * `getAssistantRunId` 的解析结果同源，键必然对齐）为键归档，
 * 供 AssistantMessageFooter 在 turn 结束后固定展示。
 *
 * 仅覆盖本会话内实时观察到的 turn；历史恢复的 turn 从未被观测，
 * 查无记录时相应字段留空，不臆造数据。
 */

/** 归档上限：超出的最旧条目按插入序淘汰，长会话防无界增长。 */
const MAX_ENTRIES = 200;

/** runId → turn 总用时（毫秒）的不可变归档记录。 */
export type TurnDurations = Readonly<Record<string, number>>;

/** 归档一条 turn 总用时（毫秒），返回裁剪后的新记录（不可变更新）。 */
export function pushTurnDuration(
  record: TurnDurations,
  runId: string,
  durationMs: number,
): TurnDurations {
  const merged: Record<string, number> = {
    ...record,
    [runId]: Math.max(0, durationMs),
  };
  const keys = Object.keys(merged);
  if (keys.length <= MAX_ENTRIES) {
    return merged;
  }
  const trimmed: Record<string, number> = {};
  for (const key of keys.slice(keys.length - MAX_ENTRIES)) {
    const value = merged[key];
    if (value !== undefined) {
      trimmed[key] = value;
    }
  }
  return trimmed;
}

/** 毫秒 → 「12.3s」/「1m 05s」。turn 尾实时计时与 footer 固定展示共用。 */
export function formatTurnDuration(durationMs: number): string {
  const seconds = Math.max(0, durationMs) / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}
