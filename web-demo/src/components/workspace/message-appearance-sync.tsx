"use client";

import { useEffect } from "react";

import {
  useLocalSettings,
  type MessageFontSize,
  type MessageLineHeight,
  type MessageWidth,
} from "@/core/settings";

const WIDTH_VALUES: Record<MessageWidth, string> = {
  narrow: "40rem",
  medium: "60rem",
  wide: "80rem",
};

const FONT_SIZE_VALUES: Record<MessageFontSize, string> = {
  small: "0.8125rem",
  medium: "0.875rem",
  large: "1rem",
};

const LINE_HEIGHT_VALUES: Record<MessageLineHeight, string> = {
  compact: "1.6",
  comfortable: "1.9",
  relaxed: "2.2",
};

/**
 * 把「消息正文阅读外观」设置（宽度 / 字体大小 / 行间距）写入根元素的
 * CSS 变量，供消息区域的 max-w 与 .streamdown-tight 排版读取。
 * 无 UI，仅在设置变化时同步变量。
 */
export function MessageAppearanceSync() {
  const [settings] = useLocalSettings();

  useEffect(() => {
    const root = document.documentElement;
    const { width, fontSize, lineHeight } = settings.appearance;
    root.style.setProperty("--chat-message-width", WIDTH_VALUES[width]);
    root.style.setProperty("--chat-message-font-size", FONT_SIZE_VALUES[fontSize]);
    root.style.setProperty(
      "--chat-message-line-height",
      LINE_HEIGHT_VALUES[lineHeight],
    );
  }, [settings.appearance]);

  return null;
}
