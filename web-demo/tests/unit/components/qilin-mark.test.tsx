// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { GoldDivider, QilinSeal, ScalePattern } from "@/components/brand/qilin-mark";

describe("QilinMark 品牌组件", () => {
  test("QilinSeal 默认为装饰元素(aria-hidden)，传 label 时暴露 role=img", () => {
    const { container, rerender } = render(<QilinSeal />);
    const decorative = container.querySelector("svg");
    expect(decorative?.getAttribute("aria-hidden")).toBe("true");
    expect(decorative?.getAttribute("role")).toBeNull();

    rerender(<QilinSeal label="麒麟印记" />);
    expect(screen.getByRole("img", { name: "麒麟印记" })).toBeTruthy();
  });

  test("QilinSeal label 为空串时仍按纯装饰处理(边界行为)", () => {
    const { container } = render(<QilinSeal label="" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("role")).toBeNull();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });

  test("QilinSeal outline variant 用描边而非实底填充", () => {
    const { container } = render(<QilinSeal variant="outline" />);
    const rect = container.querySelector("rect");
    expect(rect?.getAttribute("fill")).toBe("none");
    expect(rect?.getAttribute("stroke")).toContain("var(--ql-cinnabar");
  });

  test("ScalePattern 默认生成含安全字符的唯一 pattern id 且正确引用", () => {
    const { container } = render(<ScalePattern />);
    const pattern = container.querySelector("pattern");
    const id = pattern?.getAttribute("id") ?? "";
    expect(id).toMatch(/^ql-scale-[a-zA-Z0-9_-]+$/);
    expect(container.querySelector(`rect[fill="url(#${id})"]`)).toBeTruthy();
  });

  test("ScalePattern 同页两实例 pattern id 不冲突", () => {
    const { container } = render(
      <>
        <ScalePattern />
        <ScalePattern />
      </>,
    );
    const ids = Array.from(container.querySelectorAll("pattern")).map((p) =>
      p.getAttribute("id"),
    );
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  test("ScalePattern 支持显式 patternId 覆盖(向后兼容)", () => {
    const { container } = render(<ScalePattern patternId="test-scale" />);
    expect(container.querySelector('pattern[id="test-scale"]')).toBeTruthy();
    expect(container.querySelector('rect[fill="url(#test-scale)"]')).toBeTruthy();
  });

  test("GoldDivider 根节点为装饰元素，结构为两段线+一个菱形中点", () => {
    const { container } = render(<GoldDivider />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("aria-hidden")).toBe("true");
    // 语义契约：3 个 span 子元素（左右渐隐线段 ×2 + 菱形中点 ×1）
    const spans = root.querySelectorAll(":scope > span");
    expect(spans.length).toBe(3);
    // 线段使用透明→金渐变（对 Tailwind 语义类的契约断言）
    const lines = Array.from(spans).filter((s) =>
      s.className.includes("h-px"),
    );
    expect(lines.length).toBe(2);
    for (const line of lines) {
      expect(line.className).toContain("from-transparent");
      expect(line.className).toContain("to-ql-gold-700");
    }
  });
});
