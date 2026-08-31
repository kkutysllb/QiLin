#!/usr/bin/env node
/**
 * QiLin plugin lifecycle CLI — install / list / remove / upgrade DSH
 * third-party plugins (T1 self-contained family) into the web-demo host.
 *
 * Isomorphic with the DSH official model (install = files + manifest +
 * RESTART; no hot-swap), minus the network: sources are local plugin
 * directories laid out like the dsh-plugins monorepo (package.json with
 * dsh.bundle/dsh.client + client.js + entry.js).
 *
 * Usage:
 *   node scripts/plugin.mjs add <plugin-dir>      install
 *   node scripts/plugin.mjs remove <id>           uninstall by id
 *   node scripts/plugin.mjs upgrade <id> <dir>    re-install over existing
 *   node scripts/plugin.mjs list                  show installed plugins
 *
 * After add/remove/upgrade: RESTART the web-demo dev server. Server
 * halves mount at boot; client scripts are injected per page load.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

function writeManifest(manifest) {
  mkdirSync(PUBLIC_DIR, { recursive: true });
  const tmp = MANIFEST + ".tmp";
  writeFileSync(tmp, JSON.stringify(manifest, null, 2) + "\n");
  renameSync(tmp, MANIFEST);
}

function readPkg(dir) {
  const pkgPath = resolve(dir, "package.json");
  if (!existsSync(pkgPath)) fail("not a plugin dir (no package.json): " + dir);
  return JSON.parse(readFileSync(pkgPath, "utf-8"));
}

function dirOrFail(dir) {
  const abs = resolve(dir);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    fail("source dir not found: " + abs);
  }
  return abs;
}

/** Install (or overwrite) one plugin dir into the host. */
function install(sourceDir, manifest) {
  const src = dirOrFail(sourceDir);
  const id = basename(src);
  readPkg(src); // sanity: must look like a plugin dir
  const clientEntry = existsSync(resolve(src, "client.js"));
  const serverEntry = existsSync(resolve(src, "entry.js"));
  if (!clientEntry && !serverEntry) {
    fail("no client.js / entry.js in " + src + " — not a T1 self-contained plugin");
  }

  const entry = { id, source: src, script: "/plugins/" + id + "/client.js" };

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
    entry.server = "plugins/" + id + "/entry.js";
  }

  const others = manifest.plugins.filter((p) => p.id !== id);
  const replaced = others.length !== manifest.plugins.length;
  manifest.plugins = [...others, entry];
  writeManifest(manifest);

  console.log(
    (replaced ? "upgraded:" : "installed:") + " " + id,
    "| client:", clientEntry ? "yes" : "no",
    "| server:", serverEntry ? "yes" : "no",
  );
  console.log("restart the web-demo dev server to (re)mount server halves.");
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
    const before = manifest.plugins.length;
    manifest.plugins = manifest.plugins.filter((p) => p.id !== id);
    if (manifest.plugins.length === before) fail("plugin not in manifest: " + id);
    writeManifest(manifest);
    rmSync(resolve(PUBLIC_DIR, id), { recursive: true, force: true });
    rmSync(resolve(SERVER_DIR, id), { recursive: true, force: true });
    console.log("removed:", id, "| restart web-demo to fully unload.");
    return;
  }
  if (command === "list") {
    if (manifest.plugins.length === 0) {
      console.log("(no plugins installed)");
      return;
    }
    for (const p of manifest.plugins) {
      console.log(
        p.id.padEnd(20),
        "client:" + (p.script ? "y" : "-"),
        "server:" + (p.server ? "y" : "-"),
        p.source ?? "",
      );
    }
    return;
  }
  fail("usage: plugin.mjs add <dir> | remove <id> | upgrade <id> <dir> | list");
}

main();
