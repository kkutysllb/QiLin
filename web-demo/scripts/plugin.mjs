#!/usr/bin/env node
/**
 * QiLin plugin lifecycle CLI - install / list / remove / upgrade /
 * enable / disable DSH third-party plugins (T1 self-contained family)
 * into the web-demo host.
 *
 * Isomorphic with the DSH official model (install = files + manifest +
 * RESTART; no hot-swap), minus the network: sources are local plugin
 * directories laid out like the dsh-plugins monorepo. File-level install
 * lives here; manifest/disabled state goes through the shared runtime.
 *
 * Usage:
 *   node scripts/plugin.mjs add <plugin-dir>
 *   node scripts/plugin.mjs remove <id>
 *   node scripts/plugin.mjs upgrade <id> <dir>
 *   node scripts/plugin.mjs enable <id> | disable <id>
 *   node scripts/plugin.mjs list
 *
 * After any mutation: RESTART the web-demo dev server (DSH-isomorphic).
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DSH_BASELINE, listInstalled, setPluginDisabled, uninstallPlugin } from "../plugins-host-runtime.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = resolve(ROOT, "public/plugins/manifest.json");
const PUBLIC_DIR = resolve(ROOT, "public/plugins");
const SERVER_DIR = resolve(ROOT, "plugins");

const args = process.argv.slice(2);
const command = args[0];

function fail(msg) {
  console.error("error:", msg);
  process.exit(1);
}

function readManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST, "utf-8"));
  } catch {
    return { plugins: [] };
  }
}

function dirOrFail(dir) {
  const abs = resolve(dir);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    fail("source dir not found: " + abs);
  }
  return abs;
}

/** Install (or overwrite) one plugin dir into the host. */
/** Top-level directories of a plugin source that must ship with the
 * server half (everything except dot-dirs and node_modules). */
function listContentDirs(src) {
  return readdirSync(src, { withFileTypes: true })
    .filter(
      (e) =>
        e.isDirectory() &&
        !e.name.startsWith(".") &&
        e.name !== "node_modules" &&
        e.name !== "vendor",
    )
    .map((e) => e.name);
}

function install(sourceDir, manifest) {
  const src = dirOrFail(sourceDir);
  const id = basename(src);
  const pkgPath = resolve(src, "package.json");
  const version = existsSync(pkgPath) ? (JSON.parse(readFileSync(pkgPath, "utf-8")).version ?? null) : null;
  const clientEntry = existsSync(resolve(src, "client.js"));
  const serverEntry = existsSync(resolve(src, "entry.js"));
  if (!clientEntry && !serverEntry) {
    fail("no client.js / entry.js in " + src + " - not a T1 self-contained plugin");
  }

  const entry = { id, version, source: src, script: "/plugins/" + id + "/client.js" };

  // Client half -> public (browser loads it as a same-origin script).
  if (clientEntry) {
    const dst = resolve(PUBLIC_DIR, id);
    mkdirSync(dst, { recursive: true });
    cpSync(resolve(src, "client.js"), resolve(dst, "client.js"));
  } else {
    entry.script = "";
  }

  // Server half -> plugins/ (Node host imports it at boot; kept out of
  // public so server code is never served to the browser).
  if (serverEntry) {
    const dst = resolve(SERVER_DIR, id);
    mkdirSync(dst, { recursive: true });
    cpSync(resolve(src, "entry.js"), resolve(dst, "entry.js"));
    const vendor = resolve(src, "vendor");
    if (existsSync(vendor)) {
      rmSync(resolve(dst, "vendor"), { recursive: true, force: true });
      cpSync(vendor, resolve(dst, "vendor"), { recursive: true });
    }
    // H5-c: content directories a server half may resolve at runtime
    // (e.g. kcoder-skills reads skills/manifest.json next to entry.js).
    for (const name of listContentDirs(src)) {
      const contentDir = resolve(src, name);
      rmSync(resolve(dst, name), { recursive: true, force: true });
      cpSync(contentDir, resolve(dst, name), { recursive: true });
    }
    entry.server = "plugins/" + id + "/entry.js";
  }

  const others = manifest.plugins.filter((p) => p.id !== id);
  const replaced = others.length !== manifest.plugins.length;
  manifest.plugins = [...others, entry];
  const tmp = MANIFEST + ".tmp";
  writeFileSync(tmp, JSON.stringify(manifest, null, 2) + "\n");
  renameSync(tmp, MANIFEST);

  console.log(
    (replaced ? "upgraded:" : "installed:") + " " + id,
    "| version:", version ?? "-",
    "| client:", clientEntry ? "yes" : "no",
    "| server:", serverEntry ? "yes" : "no",
  );
  console.log("baseline: dsh " + DSH_BASELINE, "| restart web-demo to (re)mount server halves.");
}

function main() {
  const manifest = readManifest();
  if (command === "add" && args[1]) {
    install(args[1], manifest);
    return;
  }
  if (command === "upgrade" && args[1] && args[2]) {
    install(args[2], manifest);
    return;
  }
  if (command === "remove" && args[1]) {
    const id = args[1];
    if (uninstallPlugin(id)) {
      console.log("removed:", id, "| restart web-demo to fully unload.");
    } else {
      fail("plugin not found in manifest: " + id);
    }
    return;
  }
  if (command === "enable" && args[1]) {
    console.log(setPluginDisabled(args[1], false) ? "enabled:" + args[1] : "not found: " + args[1]);
    return;
  }
  if (command === "disable" && args[1]) {
    console.log(setPluginDisabled(args[1], true) ? "disabled:" + args[1] : "not found: " + args[1]);
    return;
  }
  if (command === "list") {
    const plugins = listInstalled();
    if (plugins.length === 0) {
      console.log("(no plugins installed)");
      return;
    }
    for (const p of plugins) {
      console.log(
        p.id.padEnd(20),
        ("v" + (p.version ?? "-")).padEnd(8),
        "client:" + (p.client ? "y" : "-"),
        "server:" + (p.server ? "y" : "-"),
        p.disabled ? "DISABLED" : "",
      );
    }
    return;
  }
  fail("usage: plugin.mjs add <dir> | remove <id> | upgrade <id> <dir> | enable <id> | disable <id> | list");
}

main();