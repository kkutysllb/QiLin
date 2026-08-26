import { afterEach, describe, expect, test, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.mock("@/core/api/fetcher", () => ({
  fetch: fetchMock,
}));

vi.mock("@/core/config", () => ({
  getBackendBaseURL: () => "",
}));

import { suggestAgentConfig } from "@/core/agents/api";

const VALID_RESPONSE = {
  name: "financial-analyst",
  description: "Financial data analysis agent",
  soul: "You are a financial analyst...",
  tool_groups: ["web", "bash"],
  disallowed_tools: [],
  skills: ["tushare"],
  model: "gpt-4o",
  thinking_enabled: true,
  reasoning_effort: "high" as const,
  max_turns: 100,
  timeout_seconds: 1800,
  role: "worker",
  rationale: "Configured for data analysis with web and bash access",
};

describe("suggestAgentConfig", () => {
  afterEach(() => {
    fetchMock.mockReset();
  });

  test("sends a POST request and returns the suggestion", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(VALID_RESPONSE), { status: 200 }),
    );

    const result = await suggestAgentConfig({
      description: "I need a financial data analyst",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/agents/suggest");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(init?.body as string);
    expect(body.description).toBe("I need a financial data analyst");

    expect(result.name).toBe("financial-analyst");
    expect(result.tool_groups).toEqual(["web", "bash"]);
    expect(result.rationale).toContain("data analysis");
  });

  test("throws with detail on 403 (agents API disabled)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail:
            "Custom-agent management API is disabled. Set agents_api.enabled=true to expose agent and user-profile routes over HTTP.",
        }),
        { status: 403 },
      ),
    );

    await expect(
      suggestAgentConfig({ description: "test agent" }),
    ).rejects.toThrow(/agents_api.enabled=true/);
  });

  test("falls back to generic message on 403 without detail", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("", { status: 403 }),
    );

    await expect(
      suggestAgentConfig({ description: "test agent" }),
    ).rejects.toThrow(/代理 API 未启用/);
  });

  test("throws with detail from the response body on non-ok", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: "AI returned an unparseable response." }),
        { status: 502 },
      ),
    );

    await expect(
      suggestAgentConfig({ description: "test agent" }),
    ).rejects.toThrow(/unparseable response/);
  });

  test("falls back to a generic error when detail is absent", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 }),
    );

    await expect(
      suggestAgentConfig({ description: "test agent" }),
    ).rejects.toThrow(/AI 生成失败/);
  });
});
