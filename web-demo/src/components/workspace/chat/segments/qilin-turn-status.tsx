"use client";

import { useEffect, useRef, useState } from "react";

import { formatTurnDuration } from "@/core/messages/turn-timing";
import { cn } from "@/lib/utils";

const WORD = "QiLin";
const DOTS = "....";
/** 波光相位差：每字符依次延迟亮起，形成自左向右扫过的光波。 */
const WAVE_STAGGER_MS = 110;
const TICK_MS = 100;

/**
 * QilinTurnStatus — turn 尾品牌状态字。
 *
 * 「QiLin....」以品牌朱砂色（--ql-cinnabar，与麒麟方印 logo 底色相同）
 * 为基色，每个字符携带相位递增的波光动画（颜色浮起 + 鎏金光晕），
 * 视觉上是一道光波周期性地扫过整串字符；其后紧跟本轮 turn 的
 * 实时用时统计（挂载即 turn 开始，卸载即 turn 结束，组件内自持
 * 100ms ticker，不触发父级 message-feed 重渲染）。
 */
export function QilinTurnStatus({ className }: { className?: string }) {
  // 行只在 thread.isLoading 为真时挂载，挂载时刻即本轮 turn 起点。
  const startRef = useRef(Date.now());
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsedMs(Math.max(0, Date.now() - startRef.current));
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const chars = [...WORD, ...DOTS];

  return (
    <span className={cn("flex items-baseline gap-1.5", className)}>
      <span aria-label="QiLin 处理中" className="ql-turn-word" role="status">
        {chars.map((char, index) => (
          <span
            key={`${index}-${char}`}
            aria-hidden="true"
            className="ql-turn-char"
            style={{ animationDelay: `${(index * WAVE_STAGGER_MS) / 1000}s` }}
          >
            {char}
          </span>
        ))}
      </span>
      <span className="text-muted-foreground text-xs tabular-nums">
        · {formatTurnDuration(elapsedMs)}
      </span>
    </span>
  );
}
