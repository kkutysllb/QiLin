// Smoke: typert host facility end-to-end — entry mounts ctx.typertHost,
// runtime route answers the typert envelope. Run: node scripts/smoke-typert.mjs
import { writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

import {
  loadPluginServer,
  matchPluginRoute,
} from "../plugins-host-runtime.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url))); // web-demo
const ENTRY = "plugins/.smoke-typert-entry.mjs";

writeFileSync(
  join(ROOT, ENTRY),
  [
    "export const inject = [];",
    "export function apply(ctx) {",
    '  ctx.typertHost.mount("canary/echo", async (method, payload) => {',
    '    if (method === "boom") throw new Error("intentional");',
    "    return { echo: payload.request, method, sessionId: payload.sessionId };",
    "  });",
    "}",
  ].join("\n"),
);

function makeReqRes(body, method = "POST") {
  const req = {
    method,
    socket: { remoteAddress: "127.0.0.1" },
    on(ev, cb) {
      if (ev === "data") cb(Buffer.from(JSON.stringify(body ?? {})));
      if (ev === "end") cb();
    },
  };
  let status = 0;
  let out = "";
  const res = {
    writeHead(code) {
      status = code;
    },
    end(txt) {
      out = txt || "";
    },
  };
  return { req, res, result: () => ({ status, out }) };
}

try {
  await loadPluginServer(ENTRY);

  const handler = matchPluginRoute("/qilin-plugins/typert/canary/echo");
  assert(handler, "typert route registered");

  // happy path
  let r = makeReqRes({
    service: "echo",
    method: "ping",
    sessionId: "t1",
    request: { hi: 1 },
  });
  await handler(r.req, r.res);
  let out = JSON.parse(r.result().out);
  assert.equal(r.result().status, 200);
  assert.equal(out.ok, true);
  assert.deepEqual(out.value.echo, { hi: 1 });
  assert.equal(out.value.method, "ping");
  assert.equal(out.value.sessionId, "t1");

  // throwing handler -> typert error envelope (HTTP 200)
  r = makeReqRes({ method: "boom" });
  await handler(r.req, r.res);
  out = JSON.parse(r.result().out);
  assert.equal(out.ok, false);
  assert.match(out.error.message, /intentional/);

  // non-POST -> 405
  r = makeReqRes({}, "GET");
  await handler(r.req, r.res);
  assert.equal(r.result().status, 405);

  console.log("SMOKE OK: typert mount -> route -> envelope");
} finally {
  rmSync(join(ROOT, ENTRY), { force: true });
}
