"use client";

import {
  Blocks,
  Brain,
  Clock,
  Code2,
  HardDrive,
  Layers,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { Section } from "../section";

const features = [
  {
    icon: Brain,
    color: "text-purple-400",
    title: "长短期记忆",
    desc: "智能体现在能更好地理解你",
  },
  {
    icon: Clock,
    color: "text-amber-400",
    title: "规划与子任务拆分",
    desc: "提前规划，理清复杂逻辑，按序或并行执行",
  },
  {
    icon: Blocks,
    color: "text-blue-400",
    title: "技能与工具",
    desc: "即插即用，或自由替换内置工具",
  },
  {
    icon: HardDrive,
    color: "text-emerald-400",
    title: "带文件系统的沙箱",
    desc: "读取、写入、执行——像真实电脑一样",
  },
  {
    icon: Layers,
    color: "text-cyan-400",
    title: "多模型支持",
    desc: "豆包、DeepSeek、OpenAI、Gemini 等",
  },
  {
    icon: Code2,
    color: "text-teal-400",
    title: "开源",
    desc: "MIT 协议，自主部署，完全掌控",
  },
];

export function WhatsNewSection({ className }: { className?: string }) {
  return (
    <Section
      className={cn("", className)}
      title="KWorks 平台特性"
      subtitle="从深度研究智能体进化为全栈超级智能体。"
    >
      <div className="mx-auto grid w-full max-w-4xl grid-cols-2 gap-3 lg:grid-cols-3">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <div
              key={feature.title}
              className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
            >
              <Icon className={`mt-0.5 size-5 shrink-0 ${feature.color}`} />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-zinc-100">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                  {feature.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
