/**
 * QiLin Web Demo — same-origin custom server.
 *
 * Proxies /api/* and /health to the QiLin gateway with NO response
 * buffering (SSE streams token-by-token) and WebSocket upgrade support.
 * next.config.js rewrites remain as fallback for plain `next dev`, but
 * this server intercepts first when running via `pnpm dev`.
 */
import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { createProxyMiddleware } from "http-proxy-middleware";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.WEB_DEMO_HOST || "127.0.0.1";
const port = Number.parseInt(process.env.WEB_DEMO_PORT || "28080", 10);
const gatewayTarget =
  process.env.GATEWAY_TARGET_URL || "http://127.0.0.1:28081";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const apiProxy = createProxyMiddleware({
  target: gatewayTarget,
  changeOrigin: false,
  // WebSocket upgrades are forwarded via apiProxy.upgrade() in the "upgrade"
  // handler below (http-proxy-middleware v4 removed the v3 `ws: true` option).
  // Frontend LangGraph SDK calls use /api/langgraph/*; the gateway natively
  // exposes /api/* (same mapping as KWorks next.config rewrites).
  pathRewrite: { "^/api/langgraph": "/api" },
  on: {
    error: (err, req, res) => {
      console.error(`[proxy] ${req.method} ${req.url} ->`, err.message);
      if (res && "writeHead" in res && !res.headersSent) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "gateway_unreachable",
            message: err.message,
          }),
        );
      }
    },
  },
});

function shouldProxy(pathname) {
  return pathname === "/health" || pathname.startsWith("/api/");
}

await app.prepare();

const server = createServer((req, res) => {
  const parsedUrl = parse(req.url || "", true);
  if (shouldProxy(parsedUrl.pathname || "")) {
    apiProxy(req, res, () => handle(req, res, parsedUrl));
    return;
  }
  handle(req, res, parsedUrl);
});

server.on("upgrade", (req, socket, head) => {
  const pathname = parse(req.url || "").pathname || "";
  if (shouldProxy(pathname)) {
    apiProxy.upgrade(req, socket, head);
    return;
  }
  // Non-proxied upgrades (Next dev HMR) must be delegated back to Next,
  // otherwise the dev hot-reload websocket drops.
  app.getUpgradeHandler()(req, socket, head);
});

server.listen(port, hostname, () => {
  console.log(
    `[web-demo] http://${hostname}:${port} -> gateway ${gatewayTarget} (dev=${dev})`,
  );
});
