/**
 * Plugin server-half host runtime (Node side).
 *
 * Loads installed DSH plugin server halves (entry.js, ESM) behind the
 * same isomorphic lifecycle as the client halves: install = files +
 * manifest entry + restart. Each entry exports the cordis convention
 *
 *   export const inject = ['webServer']        // services it needs
 *   export function apply(ctx)                 // registers routes via ctx
 *
 * The shim ctx provides the minimal DSH service surface those plugins
 * use in practice:
 *
 *   ctx.webServer.register({ kind: 'prefix', path, handler(req, res) })
 *       — handler receives the RAW Node req/res (plugins write their own
 *         JSON: isTrusted / POST-only / readJsonBody are plugin-owned,
 *         matching the dsh security conventions).
 *   ctx.effect(setup, name) — run setup now, collect its disposer.
 *   ctx.get(name) — soft service lookup (webRuntime, sessions, …);
 *       unknown services resolve to undefined so plugins degrade
 *       gracefully (optional-chaining soft probes are the T1 convention).
 *
 * Baseline: dsh 0.1.2-alpha.2, T1 self-contained plugins.
 */

import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));

/** @type {Map<string, { prefix: string, handler: (req, res) => void }>} */
const pluginRoutes = new Map();

/** Soft service table — extend as more host surfaces get bridged (H2). */
const hostServices = {
  webRuntime: { trustedHosts: [] },
};

function makeCtx() {
  const disposers = [];
  return {
    id: "qilin-plugin-host",
    scope: null,
    config: {},
    webServer: {
      register({ kind, path, handler }) {
        if (kind !== "prefix") {
          throw new Error("unsupported route kind: " + kind);
        }
        pluginRoutes.set(path, { prefix: path, handler });
      },
    },
    effect(setup) {
      const dispose = setup();
      if (typeof dispose === "function") disposers.push(dispose);
      return () => disposers.splice(0).forEach((d) => d());
    },
    get(name) {
      return hostServices[name];
    },
  };
}

/**
 * Load one plugin server half. entryPath is resolved relative to the
 * web-demo root (the manifest stores a root-relative path).
 */
export async function loadPluginServer(entryPath) {
  const abs = join(ROOT, entryPath);
  const mod = await import(pathToFileURL(abs).href);
  const ctx = makeCtx();
  const apply = mod.apply ?? mod.default?.apply;
  if (typeof apply !== "function") {
    throw new Error("plugin server has no apply(): " + entryPath);
  }
  const inject = mod.inject ?? mod.default?.inject ?? [];
  const args = inject.map((name) =>
    name === "webServer" ? ctx.webServer : ctx.get(name),
  );
  apply(ctx, ...args);
}

/**
 * Boot all installed plugin server halves from the manifest. Safe to call
 * once per process; failures are logged per-plugin and never fatal.
 */
export async function initPluginServers() {
  let manifest;
  try {
    manifest = JSON.parse(
      readFileSync(join(ROOT, "public", "plugins", "manifest.json"), "utf-8"),
    );
  } catch (err) {
    console.error("[plugin-servers] manifest unreadable:", err.message);
    return;
  }
  for (const entry of manifest.plugins ?? []) {
    if (!entry.server) continue;
    try {
      await loadPluginServer(entry.server);
      console.log("[plugin-servers] mounted:", entry.id, entry.server);
    } catch (err) {
      console.error("[plugin-servers] mount failed:", entry.id, err.message);
    }
  }
}

/**
 * Find the plugin handler whose registered prefix matches the request
 * pathname. Longest prefix wins.
 */
export function matchPluginRoute(pathname) {
  let best = null;
  let bestLen = -1;
  for (const { prefix, handler } of pluginRoutes.values()) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      if (prefix.length > bestLen) {
        best = handler;
        bestLen = prefix.length;
      }
    }
  }
  return best;
}
