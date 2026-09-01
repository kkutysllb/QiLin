#!/usr/bin/env node
/**
 * QiLin plugin lifecycle CLI - install / list / remove / upgrade /
 * enable / disable DSH third-party plugins (T1 self-contained family)
 * into the web-demo host.
 *
 * Isomorphic with the DSH official model (install = files + manifest +
 * RESTART; no hot-swap): sources are local plugin directories laid out
 * like the dsh-plugins monorepo; npm-published installs go through the
 * management API (web-demo/plugins page) which shares the same runtime
 * distribution helper. manifest/disabled state also lives in the runtime.
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

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  DSH_BASELINE,
  installPluginDir,
  listInstalled,
  setPluginDisabled,
  uninstallPlugin,
} from "../plugins-host-runtime.mjs";

const args = process.argv.slice(2);
const command = args[0];

function fail(msg) {
  console.error("error:", msg);
  process.exit(1);
}

function dirOrFail(dir) {
  const abs = resolve(dir);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    fail("source dir not found: " + abs);
  }
  return abs;
}

// Install distribution lives in the shared runtime (single source of truth
// with the management API npm action); the CLI is a thin wrapper.

function install(sourceDir) {
  const out = installPluginDir(dirOrFail(sourceDir));
  console.log(
    (out.replaced ? "upgraded:" : "installed:") + " " + out.id,
    "| version:", out.version ?? "-",
    "| client:", out.client ? "yes" : "no",
    "| server:", out.server ? "yes" : "no",
  );
  console.log("baseline: dsh " + DSH_BASELINE, "| restart web-demo to (re)mount server halves.");
}

function main() {
  if (command === "add" && args[1]) {
    install(args[1]);
    return;
  }
  if (command === "upgrade" && args[1] && args[2]) {
    install(args[2]);
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