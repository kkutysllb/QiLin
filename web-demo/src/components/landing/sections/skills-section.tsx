"use client";

import { BookOpen, Package, Plug, Rocket } from "lucide-react";

import { cn } from "@/lib/utils";

import { Section } from "../section";

const skillPoints = [
  {
    icon: BookOpen,
    color: "text-amber-400",
    title: "内置技能库",
    desc: "搜索、文档、代码、多媒体等常用技能开箱即用",
  },
  {
    icon: Package,
    color: "text-cyan-400",
    title: "自定义技能",
    desc: "用自己的技能文件扩展平台，按需渐进加载",
  },
  {
    icon: Plug,
    color: "text-violet-400",
    title: "工具与 MCP",
    desc: "即插即用或自由替换内置工具，对接外部服务",
  },
  {
    icon: Rocket,
    color: "text-emerald-400",
    title: "按需装配",
    desc: "智能体只在需要的时候加载需要的技能",
  },
];

export function SkillsSection({ className }: { className?: string }) {
  return (
    <Section
      className={cn("w-full", className)}
      title="智能体技能"
      subtitle="技能按需渐进加载——只在需要的时候加载需要的技能，也可用自己的技能文件扩展。"
    >
      <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {skillPoints.map((point) => {
          const Icon = point.icon;
          return (
            <div
              key={point.title}
              className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
            >
              <Icon className={`size-5 ${point.color}`} />
              <h3 className="mt-2 text-sm font-semibold text-zinc-100">
                {point.title}
              </h3>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                {point.desc}
              </p>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
