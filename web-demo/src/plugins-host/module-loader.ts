"use client";

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

function load(spec: { id: string; factory: () => PluginModule }): LoadedPlugin {
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

  const exports = spec.factory() ?? {};
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
function applyPlugin(id: string, exports: PluginModule, inject: string[]): () => void {
  const services = inject.map((name) => getPluginService(name));
  try {
    exports.apply?.(...services);
  } catch (err) {
    // A broken plugin must not take down the host page.
    console.error("[plugin-host] apply() failed for " + id + ":", err);
  }
  return () => {
    try {
      exports.dispose?.();
    } catch {
      /* ignore dispose errors on unload */
    }
  };
}

export function installModuleLoader(): void {
  const w = window as unknown as Record<string, unknown>;
  const shape: ModuleLoaderShape = { load, get plugins() { return registry; } };
  w.__ModuleLoader__ ??= shape;
}

export function listLoadedPlugins(): readonly LoadedPlugin[] {
  return registry;
}
