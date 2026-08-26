#!/usr/bin/env node
/**
 * QiLin Web Demo 代理冒烟测试
 * 验证: /health 同源可达、认证闭环、SSE 首字节 < 500ms
 * 用法: pnpm smoke   (等价于 BASE=http://127.0.0.1:28080 node scripts/smoke-proxy.mjs)
 * env:  SMOKE_EMAIL / SMOKE_PASSWORD 覆盖默认测试账号
 */
import process from "node:process";

const BASE = process.env.BASE || "http://127.0.0.1:28080";
const EMAIL = process.env.SMOKE_EMAIL || "admin@example.com";
const PASSWORD = process.env.SMOKE_PASSWORD || "QiLin#Demo2026";

function cookiesFrom(res) {
  const out = {};
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(";");
    const idx = pair.indexOf("=");
    out[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return out;
}

async function main() {
  const jar = {};

  // 1. /health 经同源代理
  const health = await fetch(`${BASE}/health`);
  const healthBody = await health.json();
  if (!health.ok || healthBody.status !== "healthy") {
    throw new Error(`/health failed: ${health.status} ${JSON.stringify(healthBody)}`);
  }
  console.log("✓ /health via proxy:", JSON.stringify(healthBody));

  // 2. 认证: 首次 initialize, 之后 login
  const setupRes = await fetch(`${BASE}/api/v1/auth/setup-status`);
  const setupBody = await setupRes.json();
  let authRes;
  if (setupBody.needs_setup) {
    console.log("→ 首次启动: POST /api/v1/auth/initialize");
    authRes = await fetch(`${BASE}/api/v1/auth/initialize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, remember_me: true }),
    });
  } else {
    console.log("→ 已初始化: POST /api/v1/auth/login/local");
    authRes = await fetch(`${BASE}/api/v1/auth/login/local`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username: EMAIL, password: PASSWORD, remember_me: "true" }),
    });
  }
  if (!authRes.ok) throw new Error(`auth failed: ${authRes.status} ${await authRes.text()}`);
  Object.assign(jar, cookiesFrom(authRes));
  if (!jar.access_token) throw new Error("未获得 access_token cookie");
  const cookieHeader = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
  console.log("✓ auth OK, cookies:", Object.keys(jar).join(","));

  // 3. 创建 thread (CSRF 双提交)
  const threadRes = await fetch(`${BASE}/api/threads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader,
      "X-CSRF-Token": jar.csrf_token || "",
    },
    body: JSON.stringify({ metadata: { title: "web-demo smoke" } }),
  });
  if (!threadRes.ok) {
    throw new Error(`create thread failed: ${threadRes.status} ${await threadRes.text()}`);
  }
  const thread = await threadRes.json();
  console.log("✓ thread:", thread.thread_id);

  // 4. 流式 run: SSE 首字节 < 500ms
  const t0 = Date.now();
  const streamRes = await fetch(
    `${BASE}/api/threads/${thread.thread_id}/runs/stream`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
        "X-CSRF-Token": jar.csrf_token || "",
      },
      body: JSON.stringify({
        input: { messages: [{ role: "user", content: "ping" }] },
      }),
    },
  );
  if (!streamRes.ok) {
    throw new Error(`runs/stream failed: ${streamRes.status} ${await streamRes.text()}`);
  }
  const reader = streamRes.body.getReader();
  const { value } = await reader.read();
  const firstByteMs = Date.now() - t0;
  const head = new TextDecoder().decode(value).slice(0, 80).replace(/\n/g, "\\n");
  console.log(`✓ SSE 首字节: ${firstByteMs}ms — head: ${head}`);
  await reader.cancel();
  if (firstByteMs >= 500) {
    throw new Error(`SSE 首字节过慢: ${firstByteMs}ms (代理疑似缓冲)`);
  }

  console.log("\n✅ PASS — 同源代理 + 认证 + SSE 流式全部正常");
}

main().catch((err) => {
  console.error("\n❌ FAIL —", err.message);
  process.exit(1);
});
