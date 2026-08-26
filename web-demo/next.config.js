/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

function getInternalServiceURL(envKey, fallbackURL) {
  const configured = process.env[envKey]?.trim();
  return configured && configured.length > 0
    ? configured.replace(/\/+$/, "")
    : fallbackURL;
}
import nextra from "nextra";

const isDesktopBuild = process.env.DESKTOP_BUILD === "true" || process.env.DESKTOP_BUILD === "1";
const desktopDevOrigins = ["127.0.0.1", "localhost"];

// Nextra injects documentation routes and its own _global-error handling that
// are incompatible with `output: "export"` (causes LayoutRouterContext null
// errors during prerendering). Skip the Nextra wrapper entirely for desktop
// static-export builds — the desktop app doesn't include the docs site.
const withNextra = isDesktopBuild
  ? (config) => config
  : nextra({});

/** @type {import("next").NextConfig} */
const config = {
  allowedDevOrigins: desktopDevOrigins,
  // Desktop production builds use static export (no server, no SSR).
  // i18n and rewrites are incompatible with output: "export".
  ...(isDesktopBuild
    ? {
        output: "export",
        images: { unoptimized: true },
        // Electron serves the static export via the app://- custom scheme.
        // Absolute paths resolve against the scheme root, so we MUST NOT use
        // "./" (relative) here because
        // webpack would resolve chunk URLs relative to window.location,
        // breaking all sub-route pages (e.g. /workspace/coding/xxx would
        // request /workspace/coding/_next/... instead of /_next/...,
        // causing chunk 404 → global-error).
      }
    : {
        i18n: {
          locales: ["en", "zh"],
          defaultLocale: "en",
        },
        async rewrites() {
          // Rewrites are ONLY used in web dev mode (non-desktop). Desktop dev
          // mode connects directly to the gateway via getBackendBaseURL() /
          // getLangGraphBaseURL(), bypassing the Next.js proxy entirely.
          const rewrites = [];
          const gatewayURL = getInternalServiceURL(
            "KWORKS_INTERNAL_GATEWAY_BASE_URL",
            "http://127.0.0.1:9193",
          );

          // LangGraph SDK routes keep their /api/langgraph prefix in web
          // mode and are rewritten to the gateway's native /api path.
          if (!process.env.NEXT_PUBLIC_LANGGRAPH_BASE_URL) {
            rewrites.push({
              source: "/api/langgraph",
              destination: `${gatewayURL}/api`,
            });
            rewrites.push({
              source: "/api/langgraph/:path*",
              destination: `${gatewayURL}/api/:path*`,
            });
          }

          // Catch-all for all remaining gateway API routes. Individual
          // route rules (/api/agents, /api/skills, etc.) are no longer
          // listed separately because the catch-all covers them all.
          if (!process.env.NEXT_PUBLIC_BACKEND_BASE_URL) {
            rewrites.push({
              source: "/health",
              destination: `${gatewayURL}/health`,
            });
            // Must come AFTER /api/langgraph so that prefix is preserved.
            rewrites.push({
              source: "/api/:path*",
              destination: `${gatewayURL}/api/:path*`,
            });
          }

          return rewrites;
        },
      }),
  devIndicators: false,
  // The skill install/upload endpoints run an LLM-based security scan that
  // can take 20-60s on remote providers (MiniMax, etc.) before responding.
  // The default dev proxy timeout (30s) resets the socket mid-scan and the
  // user sees "socket hang up" / ECONNRESET. 120s gives the scan (now also
  // capped at 45s per call in security_scanner.py) comfortable headroom for
  // multi-file archives.
  experimental: {
    proxyTimeout: 120_000,
  },
};

export default withNextra(config);
