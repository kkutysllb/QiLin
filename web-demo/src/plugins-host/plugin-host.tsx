"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { installModuleLoader } from "./module-loader";
import { setCurrentThread } from "./services";

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
  // mount their entry buttons onto #__dsh_desktop_titlebar. Provide a
  // fixed top-right strip so those buttons appear over any QiLin page.
  return (
    <div
      id="__dsh_desktop_titlebar"
      data-plugin-anchor="dsh-titlebar"
      style={{
        position: "fixed",
        top: 8,
        right: 48,
        zIndex: 2147483000,
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    />
  );
}
