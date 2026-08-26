import type { Message } from "@langchain/langgraph-sdk";
import { useMemo } from "react";

import type { SkillContextEntry } from "@/core/threads/types";
import { extractPresentFilesFromMessage } from "@/core/messages/utils";

export interface ThreadResources {
  /** 本任务实际加载的技能列表（来自后端 skill_context 状态频道）。 */
  skills: SkillContextEntry[];
  /** 本任务产出文件路径列表（扫描所有 assistant 消息的 present_files 工具调用）。 */
  artifacts: string[];
}

/**
 * 从 messages + values 中提取技能与产出文件。
 *
 * Skills 来自后端 ``ThreadState.skill_context`` 频道（由
 * ``DurableContextMiddleware`` 在每次 agent turn 结束时从消息流中
 * 扫描 read_file(SKILL.md) 调用并持久化），而非消息上不存在的
 * ``msg.skills`` 字段。
 *
 * Artifacts 来自 AI 消息的 ``present_files`` tool call 参数
 * （``toolCall.args.filepaths``）。扫描全部 assistant 消息以汇聚历史产出。
 */
export function useThreadResources(
  messages: Message[],
  values?: Record<string, unknown> | null,
): ThreadResources {
  return useMemo(() => {
    const rawSkills = values?.skill_context;
    const skills: SkillContextEntry[] = Array.isArray(rawSkills)
      ? rawSkills.filter(
          (s): s is SkillContextEntry =>
            typeof s === "object" &&
            s !== null &&
            typeof (s as SkillContextEntry).name === "string",
        )
      : [];

    const artifacts: string[] = [];
    const seen = new Set<string>();

    for (let i = messages.length - 1; i >= 0; i--) {
      if ((messages[i] as { type?: string })?.type === "ai") {
        const files = extractPresentFilesFromMessage(messages[i]!);
        for (const f of files) {
          if (!seen.has(f)) {
            seen.add(f);
            artifacts.unshift(f);
          }
        }
      }
    }
    return { skills, artifacts };
  }, [messages, values]);
}
