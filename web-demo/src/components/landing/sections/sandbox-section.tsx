"use client";

import { cn } from "@/lib/utils";

import { Section } from "../section";

export function SandboxSection({ className }: { className?: string }) {
  return (
    <Section
      className={className}
      title="智能体运行环境"
      subtitle="为智能体提供一台「电脑」：执行命令、管理文件、运行长时间任务——全部在安全的多后端沙箱中完成。"
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-4">
        <p className="text-zinc-400">
          支持本地、Docker 与云端（E2B、Tenki 等）多种沙箱后端，推荐使用{" "}
          <a
            href="https://github.com/agent-infra/sandbox"
            className="underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            一体化沙箱（AIO Sandbox）
          </a>
          ：在单个容器中集成浏览器、Shell、文件系统、MCP 和 VSCode Server。
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {["隔离", "安全", "持久化", "可挂载文件系统", "长时间运行"].map(
            (tag) => (
              <span
                key={tag}
                className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-sm text-zinc-300"
              >
                {tag}
              </span>
            ),
          )}
        </div>
      </div>
    </Section>
  );
}
