/**
 * Plugin server-half host runtime (Node side).
 *
 * Loads installed DSH plugin server halves (entry.js, ESM) behind the
 * same isomorphic lifecycle as the client halves: install = files +
 * manifest entry + restart. Each entry exports the cordis convention:
 *   export const inject = ["webServer"]
 *   export function apply(ctx)
 * The shim ctx provides: webServer.register (prefix route on raw
 * req/res), ctx.effect, and ctx.get soft service lookup. It also hosts
 * the management API used by the admin page and the lifecycle CLI.
 * Baseline: dsh 0.1.2-alpha.2, T1 self-contained plugins.
 */

import { execFile } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, dirname, relative, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ROOT = dirname(fileURLToPath(import.meta.url));
/** Thread workspace roots: only these trees are exposed to plugin bridges. */
const THREADS_ROOT = resolvePath(ROOT, "..", ".qilin", "threads");
const MANIFEST_PATH = join(ROOT, "public", "plugins", "manifest.json");
const PUBLIC_PLUGINS_ROOT = join(ROOT, "public", "plugins");
const SERVER_PLUGINS_ROOT = join(ROOT, "plugins");
/** Host compatibility baseline (user-pinned; tracked upstream). */
export const DSH_BASELINE = "0.1.2-alpha.2";

/** @type {Map<string, { prefix: string, handler: (req, res) => void }>} */
const pluginRoutes = new Map();
/** Soft service table - extend as more host surfaces get bridged (H2). */
const hostServices = {
  webRuntime: { trustedHosts: [] },
  fs: makeFsService(),
  git: makeGitService(),
  typertHost: { mount: mountTypertHost },
};

/** Test/smoke access to the bridged capability services. */
export function pluginServices() {
  return hostServices;
}

// ----- H5-a: language port — system-prompt section bridge -----
// T2 runtime plugins (kcoder-language) register prompt sections via
// ctx.systemPrompt.section({name, order, text}); the runtime announces
// them to the gateway port (in-process registry consumed by the lead
// agent at prompt assembly). Fire-and-forget: apply() is sync, and the
// announcement races nothing that matters (agent runs follow boot).
const GATEWAY_URL = process.env.QILIN_GATEWAY_URL ?? "http://127.0.0.1:28081";

function internalAuthToken() {
  if (process.env.QILIN_INTERNAL_AUTH_TOKEN) {
    return process.env.QILIN_INTERNAL_AUTH_TOKEN;
  }
  try {
    // start-gateway.sh persists the generated secret here.
    return readFileSync(resolvePath(ROOT, "..", ".qilin-internal-token"), "utf8").trim();
  } catch {
    return undefined;
  }
}

async function announceSection(section, method = "POST") {
  const token = internalAuthToken();
  if (!token) {
    console.error("[system-prompt] no internal token; section not announced:", section.name);
    return;
  }
  const url =
    method === "DELETE"
      ? GATEWAY_URL + "/api/ports/system-prompt/sections/" + encodeURIComponent(section.name)
      : GATEWAY_URL + "/api/ports/system-prompt/sections";
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json", "X-QiLin-Internal-Token": token },
    body: method === "DELETE" ? undefined : JSON.stringify(section),
  });
  if (!res.ok) {
    console.error("[system-prompt] announce failed:", section.name, res.status);
  }
}

// ----- H5-b: tools/post-execute event face -----
// Polls the gateway ports ring and fans events out to handlers registered
// via ctx.on("tools/post-execute", (exec, result, next) => ...). Cross-
// process semantics are observability-only: next() resolves {kind:"accept"}
// because execution has already happened when an event is published.
const toolEventHandlers = new Set();
let toolEventCursor = 0;
let toolEventTimer = null;

function ensureToolEventPoller() {
  if (toolEventTimer !== null) return;
  toolEventTimer = setInterval(async () => {
    const token = internalAuthToken();
    if (!token || toolEventHandlers.size === 0) return;
    try {
      const res = await fetch(
        GATEWAY_URL + "/api/ports/tools/events?cursor=" + String(toolEventCursor),
        { headers: { "X-QiLin-Internal-Token": token } },
      );
      if (!res.ok) return;
      const body = await res.json();
      toolEventCursor = body.cursor ?? toolEventCursor;
      for (const ev of body.events ?? []) {
        const exec = {
          name: ev.name,
          callId: ev.callId,
          rootCallId: ev.callId,
          threadId: ev.threadId,
          parent: { id: ev.threadId },
          agent: { id: ev.threadId },
        };
        const result = { value: undefined };
        const next = async () => ({ kind: "accept" });
        for (const handler of toolEventHandlers) {
          try {
            await handler(exec, result, next);
          } catch (err) {
            console.error("[tool-events] handler failed:", err.message);
          }
        }
      }
    } catch {
      /* gateway unreachable — retry next tick */
    }
  }, 1500);
  if (typeof toolEventTimer.unref === "function") toolEventTimer.unref();
}

const systemPromptService = {
  /** Register a prompt section; returns the disposer (de-announce). */
  section({ name, order = 100, text, source = "plugin" }) {
    const section = { name: String(name), order: Number(order), text: String(text), source };
    void announceSection(section, "POST").catch((err) =>
      console.error("[system-prompt] announce error:", err.message),
    );
    return () => {
      void announceSection(section, "DELETE").catch(() => {
        /* best effort */
      });
    };
  },
};

hostServices.systemPrompt = systemPromptService;

// ----- H4-d slice 2: typert host facility (api-remotes endpoint face) -----
// Plugins with a typert server half mount it via ctx.typertHost.mount(pkg,
// handler); the runtime exposes POST /qilin-plugins/typert/<pkg> taking
// {service, method, sessionId, request} and answering the typert result
// envelope {ok:true,value}|{ok:false,error:{message}}. Loopback-only, same
// trust stance as the rest of the plugin surface.
const typertHosts = new Map();

function isLoopbackReq(req) {
  const addr = req.socket?.remoteAddress ?? "";
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

function readBody(req, limit = 4 * 1024 * 1024) {
  return new Promise((resolveBody, rejectBody) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        rejectBody(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", rejectBody);
  });
}

function writeJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/**
 * Mount one typert host: handler(method, payload) -> value|Promise<value>,
 * payload = { sessionId, request }. A throwing handler becomes the typert
 * error envelope (never a 500 with a stack).
 */
function mountTypertHost(packageName, handler) {
  if (typeof handler !== "function") throw new Error("typert handler required");
  typertHosts.set(packageName, handler);
  const prefix = "/qilin-plugins/typert/" + packageName;
  pluginRoutes.set(prefix, {
    prefix,
    handler: async (req, res) => {
      if (!isLoopbackReq(req)) {
        writeJson(res, 403, { ok: false, error: { message: "forbidden" } });
        return;
      }
      if (req.method !== "POST") {
        writeJson(res, 405, {
          ok: false,
          error: { message: "method not allowed" },
        });
        return;
      }
      let body;
      try {
        body = JSON.parse((await readBody(req)) || "{}");
      } catch (err) {
        writeJson(res, 400, {
          ok: false,
          error: { message: "bad json: " + err.message },
        });
        return;
      }
      const fn = typertHosts.get(packageName);
      if (fn === undefined) {
        writeJson(res, 404, {
          ok: false,
          error: { message: "typert host not mounted" },
        });
        return;
      }
      try {
        const value = await fn(String(body.method ?? ""), {
          sessionId: body.sessionId,
          request: body.request,
        });
        writeJson(res, 200, { ok: true, value });
      } catch (err) {
        writeJson(res, 200, {
          ok: false,
          error: { message: String(err.message ?? err) },
        });
      }
    },
  });
}

function makeCtx() {
  const disposers = [];
  return {
    id: "qilin-plugin-host",
    config: {},
    webServer: {
      register({ kind, path, handler }) {
        if (kind !== "prefix")
          throw new Error("unsupported route kind: " + kind);
        pluginRoutes.set(path, { prefix: path, handler });
      },
    },
    typertHost: {
      mount: mountTypertHost,
    },
    systemPrompt: systemPromptService,
    on(event, handler) {
      if (event !== "tools/post-execute") return () => {};
      toolEventHandlers.add(handler);
      ensureToolEventPoller();
      return () => {
        toolEventHandlers.delete(handler);
      };
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

export async function loadPluginServer(entryPath) {
  const abs = join(ROOT, entryPath);
  const mod = await import(pathToFileURL(abs).href);
  const ctx = makeCtx();
  const apply = mod.apply ?? mod.default?.apply;
  if (typeof apply !== "function")
    throw new Error("plugin server has no apply(): " + entryPath);
  const inject = mod.inject ?? mod.default?.inject ?? [];
  const args = inject.map((name) =>
    name === "webServer" ? ctx.webServer : ctx.get(name),
  );
  apply(ctx, ...args);
}

export async function initPluginServers() {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
  } catch (err) {
    console.error("[plugin-servers] manifest unreadable:", err.message);
    return;
  }
  for (const entry of manifest.plugins ?? []) {
    if (entry.disabled) {
      console.log("[plugin-servers] skipped (disabled):", entry.id);
      continue;
    }
    if (!entry.server) continue;
    try {
      await loadPluginServer(entry.server);
      console.log("[plugin-servers] mounted:", entry.id, entry.server);
    } catch (err) {
      console.error("[plugin-servers] mount failed:", entry.id, err.message);
    }
  }
}

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

// ----- H2 capability bridges: fenced fs / git over thread workspaces -----

function threadWorkspaceScope(absPath) {
  const rel = relative(THREADS_ROOT, resolvePath(absPath));
  if (!rel || rel.startsWith("..")) return null;
  const parts = rel.split("/");
  if (parts.length < 3 || parts[1] !== "user-data" || parts[2] !== "workspace")
    return null;
  return { threadId: parts[0], relPath: parts.slice(3).join("/") };
}

function fsList(absPath) {
  if (!threadWorkspaceScope(absPath))
    throw new Error("fs bridge: outside thread workspaces");
  return readdirSync(absPath, { withFileTypes: true }).map((d) => ({
    name: d.name,
    dir: d.isDirectory(),
  }));
}

function fsReadText(absPath) {
  if (!threadWorkspaceScope(absPath))
    throw new Error("fs bridge: outside thread workspaces");
  const st = statSync(absPath);
  if (!st.isFile()) throw new Error("not a file");
  if (st.size > 1048576) throw new Error("file too large (1 MiB cap)");
  return readFileSync(absPath, "utf-8");
}

function fsWriteText(absPath, content) {
  if (!threadWorkspaceScope(absPath))
    throw new Error("fs bridge: outside thread workspaces");
  writeFileSync(absPath, String(content), "utf-8");
}

function makeFsService() {
  return { list: fsList, readText: fsReadText, writeText: fsWriteText };
}

function makeGitService() {
  return {
    async exec(args, cwd) {
      if (!Array.isArray(args) || args.some((a) => typeof a !== "string")) {
        throw new Error("git.exec: args must be string[]");
      }
      if (!cwd || !threadWorkspaceScope(cwd)) {
        throw new Error("git bridge: cwd outside thread workspaces");
      }
      const { stdout } = await execFileAsync("git", args, {
        cwd,
        maxBuffer: 4194304,
      });
      return stdout;
    },
  };
}

// ----- management surface (admin page + CLI share one source of truth) -----

function readManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
  } catch {
    return { plugins: [] };
  }
}

function writeManifest(manifest) {
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
}

export function listInstalled() {
  const manifest = readManifest();
  return (manifest.plugins ?? []).map((p) => ({
    id: p.id,
    client: Boolean(p.script),
    server: Boolean(p.server),
    disabled: Boolean(p.disabled),
    version: p.version ?? null,
    source: p.source ?? null,
  }));
}

export function setPluginDisabled(id, disabled) {
  const manifest = readManifest();
  const entry = (manifest.plugins ?? []).find((p) => p.id === id);
  if (!entry) return false;
  entry.disabled = disabled;
  writeManifest(manifest);
  return true;
}

export function uninstallPlugin(id) {
  const manifest = readManifest();
  const before = (manifest.plugins ?? []).length;
  manifest.plugins = (manifest.plugins ?? []).filter((p) => p.id !== id);
  if (manifest.plugins.length === before) return false;
  writeManifest(manifest);
  rmSync(join(PUBLIC_PLUGINS_ROOT, id), { recursive: true, force: true });
  rmSync(join(SERVER_PLUGINS_ROOT, id), { recursive: true, force: true });
  return true;
}

/**
 * Management HTTP API - POST /qilin-plugins/api
 * Body: { action: "list" | "setDisabled" | "remove", id?, disabled? }
 * Loopback-only (DSH isTrusted convention) and POST-only.
 */
export function handleManagementApi(req, res) {
  const remote = req.socket?.remoteAddress ?? "";
  const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote);
  const writeJson = (code, obj) => {
    res.statusCode = code;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(obj));
  };
  if (!loopback) return writeJson(403, { ok: false, error: "forbidden" });
  if (req.method !== "POST")
    return writeJson(405, { ok: false, error: "method not allowed" });
  let body = "";
  req.on("data", (c) => {
    body += c;
    if (body.length > 65536) req.destroy();
  });
  req.on("end", () => {
    try {
      const { action, id, disabled } = JSON.parse(body || "{}");
      if (action === "list")
        return writeJson(200, {
          ok: true,
          baseline: DSH_BASELINE,
          plugins: listInstalled(),
        });
      if (action === "setDisabled" && id)
        return writeJson(200, { ok: setPluginDisabled(id, Boolean(disabled)) });
      if (action === "remove" && id)
        return writeJson(200, { ok: uninstallPlugin(id) });
      writeJson(400, { ok: false, error: "unknown action" });
    } catch (err) {
      writeJson(400, { ok: false, error: String(err?.message ?? err) });
    }
  });
}
