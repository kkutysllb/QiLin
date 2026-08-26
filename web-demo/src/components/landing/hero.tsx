"use client";

import {
  Blocks,
  Brain,
  ChevronRightIcon,
  Clock,
  Code2,
  HardDrive,
  Layers,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { WordRotate } from "@/components/ui/word-rotate";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: Brain,
    color: "text-purple-400",
    title: "长短期记忆",
    desc: "跨会话理解你，上下文不断延续",
  },
  {
    icon: Clock,
    color: "text-amber-400",
    title: "规划与子任务",
    desc: "拆解复杂任务，按序或并行执行",
  },
  {
    icon: Blocks,
    color: "text-blue-400",
    title: "技能与工具",
    desc: "内置技能库 + MCP，按需渐进加载",
  },
  {
    icon: HardDrive,
    color: "text-emerald-400",
    title: "沙箱环境",
    desc: "多后端隔离：本地、Docker 与云端沙箱",
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
    title: "开源可部署",
    desc: "MIT 协议，自主部署、完全掌控",
  },
];

export function Hero({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-6xl flex-col items-center gap-10 px-6 py-10 lg:flex-row lg:items-center lg:gap-14",
        className,
      )}
    >
      {/* 左：品牌文案 */}
      <div className="flex w-full flex-col items-center text-center lg:w-[45%] lg:items-start lg:text-left">
        <h1 className="flex flex-wrap items-center justify-center gap-2 text-3xl font-bold lg:justify-start lg:text-5xl">
          <WordRotate
            words={[
              "深度研究",
              "采集数据",
              "分析数据",
              "生成网页",
              "氛围编程",
              "制作幻灯片",
              "生成图像",
              "生成播客",
              "生成视频",
              "创作歌曲",
              "整理邮件",
              "做任何事",
              "学任何东西",
            ]}
          />{" "}
          <span className="bg-gradient-to-r from-cyan-300 via-blue-400 to-purple-400 bg-clip-text text-transparent">
            就用 KWorks
          </span>
        </h1>
        <p className="text-muted-foreground mt-4 max-w-xl text-base leading-relaxed">
          一个开源的智能体编排平台，由沙箱、记忆、工具、技能和子智能体驱动，
          可自主完成从数分钟到数小时的复杂任务。
        </p>
        <Link href="/workspace" className="group mt-6">
          <div className="relative inline-block">
            <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 opacity-75 blur-sm transition-all duration-500 group-hover:opacity-100 group-hover:blur-md" />
            <Button
              className="relative h-11 px-8 text-base font-semibold bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 hover:from-cyan-500 hover:via-purple-500 hover:to-pink-500 text-white shadow-xl shadow-purple-500/25 hover:shadow-purple-500/40 transition-all duration-500 hover:scale-105 rounded-xl border-0"
              size="lg"
            >
              <span className="text-md">探索平台</span>
              <ChevronRightIcon className="size-5 transition-all duration-300 group-hover:translate-x-1" />
            </Button>
          </div>
        </Link>
        <div className="mt-6 flex flex-wrap justify-center gap-2 lg:justify-start">
          {["多沙箱隔离", "多模型", "MIT 开源"].map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-400"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* 右：特性矩阵 */}
      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:w-[55%]">
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
    </div>
  );
}
