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

  test("QilinSeal outline variant 用描边而非实底填充", () => {
    const { container } = render(<QilinSeal variant="outline" />);
    const rect = container.querySelector("rect");
    expect(rect?.getAttribute("fill")).toBe("none");
    expect(rect?.getAttribute("stroke")).toContain("var(--ql-cinnabar");
  });

  test("ScalePattern 含可平铺的鳞纹 pattern 定义且标记为装饰", () => {
    const { container } = render(<ScalePattern patternId="test-scale" />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector('pattern[id="test-scale"]')).toBeTruthy();
    expect(container.querySelector('rect[fill="url(#test-scale)"]')).toBeTruthy();
  });

  test("GoldDivider 渲染菱形中点与左右两段渐隐线", () => {
    const { container } = render(<GoldDivider />);
    expect(container.querySelectorAll("span.h-px").length).toBe(2);
    expect(container.querySelector("span.rotate-45")).toBeTruthy();
  });
});
