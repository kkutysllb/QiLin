"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { installModuleLoader } from "./module-loader";
import { PluginPanelDock } from "./panel-dock";
import { setCurrentThread } from "./services";

// Eager service registration: plugin scripts inject in a layout-level
// effect, which can run BEFORE the chat-page chunk (the previous lazy
// import path for slots/locale/conversation-store) has loaded. Register
// everything the plugins inject up front — lookups during apply() must
// not race the bundle graph.
import "./better-sidebar";
import "./conversation-store";
import "./locale";
import "./slots";

// Plugin entry buttons arrive with DSH titlebar conventions (absolute
// right-offsets); pull direct children of the anchor back into the flex
// flow. Direct children only — inner badges keep their own positioning.
const CSS_NORMALIZE_CHILDREN = [
  "#__dsh_desktop_titlebar > * {",
  "  position: relative !important;",
  "  inset: auto !important;",
  "  transform: none !important;",
  "}",
].join("\n");

/**
 * Plugin host boot — reads the build-time plugin manifest (installed
 * plugins, per the DSH-isomorphic lifecycle: install/uninstall = manifest
 * change + rebuild + restart) and injects each plugin's client.js as a
 * same-origin script. Scripts self-register via window.__ModuleLoader__.
 *
 * The boot is a module-level singleton promise: React strict-mode double
 * effects (and any number of mounts) share one injection sequence, and a
 * failure resets the promise so a later mount retries. Plugin scripts are
 * idempotent per the DSH convention (window.__xWired guards + the
 * loader's replace-on-reload registration).
 */

interface PluginManifestEntry {
  id: string;
  script: string;
  disabled?: boolean;
}

interface PluginManifest {
  plugins: PluginManifestEntry[];
}

let bootPromise: Promise<void> | null = null;

function startBoot(): Promise<void> {
  bootPromise ??= (async () => {
    installModuleLoader();
    const res = await fetch("/plugins/manifest.json", { cache: "no-store" });
    if (!res.ok) throw new Error("manifest " + res.status);
    const manifest = (await res.json()) as PluginManifest;
    for (const entry of manifest.plugins) {
      if (entry.disabled) continue; // disabled: manifest stays, host skips
      if (!entry.script) continue; // server-half-only plugin (e.g. kcoder-language)
      await injectScript(entry.script);
    }
  })();
  return bootPromise;
}

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.async = false;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("script load failed: " + src));
    document.body.append(el);
  });
}

export function PluginHostBoot() {
  const pathname = usePathname();

  // Keep the DSH ISessions soft-parity current: plugins (git-panel etc.)
  // probe sessions.list.getSnapshot() for the active thread.
  useEffect(() => {
    const m = /\/workspace\/(?:chats|agents\/[^/]+\/chats)\/([^/]+)/.exec(
      pathname ?? "",
    );
    setCurrentThread(m?.[1] === "new" ? null : (m?.[1] ?? null));
  }, [pathname]);

  useEffect(() => {
    startBoot().catch((err) => {
      // One broken manifest/plugin never takes down the shell (DSH parity).
      bootPromise = null; // allow a later mount to retry
      console.error("[plugin-host] boot error:", err);
    });
  }, []);

  // DSH host DOM anchor shim: T1 plugins (git-panel, kcoder-terminal...)
  // mount their entry buttons onto #__dsh_desktop_titlebar. DSH’s desktop
  // titlebar is a full-width chrome row where plugins self-position with
  // absolute right-offsets (right:44/108px + translateY(-50%)) — inside a
  // content-sized strip those offsets scatter the buttons and push them
  // half out of the viewport. So: host the anchor as a row aligned to
  // QiLin’s own h-12 header, and normalize DIRECT children back into the
  // flex flow. position:relative (not static) keeps each button the
  // containing block for its inner absolutely-positioned badges.
  return (
    <>
      <style>{CSS_NORMALIZE_CHILDREN}</style>
      <div
        id="__dsh_desktop_titlebar"
        data-plugin-anchor="dsh-titlebar"
        style={{
          position: "fixed",
          top: 0,
          height: 48,
          right: 56,
          zIndex: 2147483000,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      />
      <PluginPanelDock />
    </>
  );
}
