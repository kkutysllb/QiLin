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
  { icon: Brain, title: "长短期记忆", desc: "跨会话理解你，上下文不断延续" },
  { icon: Clock, title: "规划与子任务", desc: "拆解复杂任务，按序或并行执行" },
  { icon: Blocks, title: "技能与工具", desc: "内置技能库 + MCP，按需渐进加载" },
  { icon: HardDrive, title: "沙箱环境", desc: "多后端隔离：本地、Docker 与云端沙箱" },
  { icon: Layers, title: "多模型支持", desc: "豆包、DeepSeek、OpenAI、Gemini 等" },
  { icon: Code2, title: "开源可部署", desc: "MIT 协议，自主部署、完全掌控" },
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
        <p className="font-mono text-xs tracking-[0.35em] text-ql-gold-500">
          QILIN · AUTONOMOUS AGENT ENGINE
        </p>
        <h1 className="mt-4 flex flex-wrap items-center justify-center gap-2 text-3xl font-bold text-ql-ink-hi lg:justify-start lg:text-5xl">
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
          <span className="bg-gradient-to-r from-ql-gold-300 to-ql-gold-500 bg-clip-text text-transparent">
            就用 QiLin
          </span>
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-ql-ink-mid">
          一个开源的智能体编排平台，由沙箱、记忆、工具、技能和子智能体驱动，
          可自主完成从数分钟到数小时的复杂任务。
        </p>
        <Button
          size="lg"
          asChild
          className="group h-11 rounded-lg border-0 bg-ql-gold-500 px-8 text-base font-semibold text-[#141006] shadow-lg shadow-black/40 transition-colors hover:bg-ql-gold-300 active:bg-ql-gold-500"
        >
          <Link href="/workspace">
            <span>探索平台</span>
            <ChevronRightIcon className="size-5 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </Button>
        <div className="mt-6 flex flex-wrap justify-center gap-2 lg:justify-start">
          {["多沙箱隔离", "多模型", "MIT 开源"].map((tag) => (
            <span
              key={tag}
              className="rounded-md border border-white/10 px-3 py-1 font-mono text-xs text-ql-ink-mid"
            >
              [ {tag} ]
            </span>
          ))}
        </div>
      </div>

      {/* 右：引擎模块清单 */}
      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:w-[55%]">
        {features.map((feature, i) => {
          const Icon = feature.icon;
          const num = String(i + 1).padStart(2, "0");
          return (
            <div
              key={feature.title}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-ql-gold-700 hover:bg-white/[0.05]"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-ql-gold-700">{num}</span>
                <Icon className="size-5 shrink-0 text-ql-gold-500" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-zinc-100">{feature.title}</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-ql-ink-mid">{feature.desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
