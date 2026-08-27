"use client";
import { createContext, useContext, type ReactNode } from "react";

import type { SidebarScope, SidebarPanelApi } from "./protocol";

const ScopeCtx = createContext<SidebarScope | null>(null);
const ApiCtx = createContext<SidebarPanelApi | null>(null);

export function SidebarScopeProvider({
  scope, api, children,
}: { scope: SidebarScope; api: SidebarPanelApi; children: ReactNode }) {
  return (
    <ScopeCtx.Provider value={scope}>
      <ApiCtx.Provider value={api}>{children}</ApiCtx.Provider>
    </ScopeCtx.Provider>
  );
}

export function useSidebarScope(): SidebarScope {
  const v = useContext(ScopeCtx);
  if (!v) throw new Error("useSidebarScope outside provider");
  return v;
}

export function useSidebarApi(): SidebarPanelApi {
  const v = useContext(ApiCtx);
  if (!v) throw new Error("useSidebarApi outside provider");
  return v;
}
