"use client";

import * as React from "react";
import * as ReactJsxRuntime from "react/jsx-runtime";

import { getPluginService } from "./services";

/**
 * DSH client plugin protocol shim — `window.__ModuleLoader__`.
 *
 * DSH third-party plugins (the T1 "self-contained" family: kcoder-terminal,
 * kcoder-git-panel, kcoder-stats-panel…) are delivered as plain scripts.
 * They register with the host via:
 *
 *   window.__ModuleLoader__.load({ id, factory })
 *
 * where factory() returns the cordis plugin convention object
 * `{ inject: string[], apply(...services) }`. The host resolves each
 * inject name against the plugin service bridge and calls apply with the
 * instances (empty inject → apply()).
 *
 * This is the QiLin-side implementation of that protocol (baseline:
 * dsh 0.1.2-alpha.2). Idempotency guards are the plugin's own convention
 * (DSH plugins ship window.__xWired flags against SPA/hot-reload double
 * runs) — the loader tolerates re-load() of the same id by replacing the
 * previous registration.
 */

export interface PluginModule {
  inject?: string[];
  apply?: (...services: unknown[]) => void;
  dispose?: () => void;
}

export interface LoadedPlugin {
  id: string;
  exports: PluginModule;
  unload: () => void;
}

type ModuleLoaderShape = {
  load(spec: { id: string; factory: () => PluginModule }): LoadedPlugin;
  readonly plugins: readonly LoadedPlugin[];
};

const registry: LoadedPlugin[] = [];

function load(spec: {
  id: string;
  /** DSH convention: client bundles receive the host require —
   * factory(require) (T3 bundles pull react/jsx-runtime through it).
   * T1 factories take no arguments; apply() receives (ctx, ...services). */
  factory: (require?: (name: string) => unknown) => PluginModule;
}): LoadedPlugin {
  // Replace-on-reload: a later load() with the same id supersedes the
  // earlier registration (hot reload / re-injection semantics).
  const prevIndex = registry.findIndex((p) => p.id === spec.id);
  if (prevIndex !== -1) {
    const prev = registry[prevIndex];
    if (prev) {
      try {
        prev.exports.dispose?.();
      } catch {
        /* plugin dispose errors must not break re-registration */
      }
      prev.unload();
    }
    registry.splice(prevIndex, 1);
  }

  const exports = spec.factory(makeRequire()) ?? {};
  const inject = Array.isArray(exports.inject) ? exports.inject : [];
  const applied = applyPlugin(spec.id, exports, inject);

  let unloaded = false;
  const loaded: LoadedPlugin = {
    id: spec.id,
    exports,
    unload: () => {
      if (unloaded) return;
      unloaded = true;
      applied();
      const i = registry.indexOf(loaded);
      if (i !== -1) registry.splice(i, 1);
    },
  };
  registry.push(loaded);
  return loaded;
}

/** Resolve inject names against the service bridge and invoke apply. */
function applyPlugin(
  id: string,
  exports: PluginModule,
  inject: string[],
): () => void {
  const services = inject.map((name) => getPluginService(name));
  const effectDisposers: (() => void)[] = [];
  try {
    // DSH convention: apply ALWAYS receives the ctx first (plugins soft-probe
    // services via ctx.get with optional chaining); inject names resolve to
    // additional positional services after it.
    exports.apply?.(makePluginCtx(effectDisposers), ...services);
  } catch (err) {
    // A broken plugin must not take down the host page.
    console.error("[plugin-host] apply() failed for " + id + ":", err);
  }
  return () => {
    // Unload order: the plugin's ctx.effect registrations first (reverse
    // registration order, cordis convention), then the module dispose.
    while (effectDisposers.length > 0) {
      const off = effectDisposers.pop();
      try {
        off?.();
      } catch {
        /* effect dispose errors stay contained */
      }
    }
    try {
      exports.dispose?.();
    } catch {
      /* ignore dispose errors on unload */
    }
  };
}

/**
 * Cordis-like context handed to plugin factories. Two access styles exist
 * in the wild (H4-d): T1 plugins soft-probe via `ctx.get(name)`, while T3
 * plugins read services as CONTEXT PROPERTIES (`ctx.slots`, `ctx.sessions`,
 * `ctx.betterSidebar`, `ctx.remote`, `ctx.locale` — cordis ctx is a
 * service-accessor object). A Proxy unifies both: unknown property reads
 * fall back to the service bridge.
 */
interface PluginCtx {
  get(name: string): unknown;
  /**
   * DSH ctx.effect: run setup now, collect its disposer for plugin unload
   * (reverse order). Returns an unsubscribe for early teardown. A throwing
   * setup degrades to a console error, never breaks apply().
   */
  effect(setup: () => void | (() => void), label?: string): () => void;
}

function makePluginCtx(effectDisposers: (() => void)[]): PluginCtx {
  const target: PluginCtx = {
    get: (name: string) => getPluginService(name),
    effect(setup, label) {
      let dispose: (() => void) | undefined;
      let off = false;
      const run = () => {
        if (off) return;
        off = true;
        dispose = undefined;
        const i = effectDisposers.indexOf(run);
        if (i !== -1) effectDisposers.splice(i, 1);
      };
      try {
        dispose = setup() ?? undefined;
      } catch (err) {
        console.error(
          "[plugin-host] effect failed" +
            (label ? " (" + label + ")" : "") +
            ":",
          err,
        );
      }
      if (dispose !== undefined) effectDisposers.push(run);
      return () => {
        try {
          dispose?.();
        } catch {
          /* contained */
        }
        run();
      };
    },
  };
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (typeof prop !== "string") return undefined;
      if (prop in t) return Reflect.get(t, prop, receiver);
      return getPluginService(prop);
    },
  });
}

/**
 * T3 client bundles declare `factory: (require) => {...}` and pull host
 * runtime modules through it (at minimum "react" and "react/jsx-runtime").
 * Unknown modules resolve to undefined — the bundle's own guards handle
 * degraded operation, and the missing dependency is visible in console.
 */
function makeRequire(): (name: string) => unknown {
  const modules: Record<string, unknown> = {
    react: React,
    "react/jsx-runtime": ReactJsxRuntime,
  };
  return (name: string) => {
    if (name in modules) return modules[name];
    console.warn("[plugin-host] require not available:", name);
    return undefined;
  };
}

export function installModuleLoader(): void {
  const w = window as unknown as Record<string, unknown>;
  const shape: ModuleLoaderShape = {
    load,
    get plugins() {
      return registry;
    },
  };
  w.__ModuleLoader__ ??= shape;
}

export function listLoadedPlugins(): readonly LoadedPlugin[] {
  return registry;
}
