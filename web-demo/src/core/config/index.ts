import { env } from "@/env";

// Side-effect import: registers the global `Window.kworksDesktop` augmentation
// so this module can read the bridge in a type-safe way.
import "@/core/desktop/types";

/**
 * The preload bridge exposed on `window.kworksDesktop` by Electron.
 *
 * Detection is intentionally a single existence check so the rest of the
 * frontend can branch on `isDesktop()` without importing any Electron
 * surface directly. When this property is absent we are in the web build.
 */
const DESKTOP_BRIDGE_KEY = "kworksDesktop";
// Historical Electron dev port; kept only as a final fallback for shells that
// never set `frontendPort` on the bridge (e.g. older desktop-electron builds).
const LEGACY_ELECTRON_DEV_PORT = "18569";

let _desktopPort: number =
  typeof window !== "undefined" && window.kworksDesktop?.gatewayPort != null
    ? window.kworksDesktop.gatewayPort
    : 19987;

export async function initGatewayPort(): Promise<void> {
  if (!isDesktop()) return;
  try {
    const cfg = await window.kworksDesktop?.getGatewayConfig();
    if (cfg?.port) _desktopPort = cfg.port;
  } catch {
    // fallback to default port
  }
}

export function isDesktop(): boolean {
  return (
    typeof window !== "undefined" && DESKTOP_BRIDGE_KEY in window
  );
}

/**
 * Resolve the dev-server port the current shell is loading the renderer from.
 *
 * Priority:
 * 1. `window.kworksDesktop.frontendPort` — Electron shells can report the
 *    actual dev-server port so this stays port-independent.
 * 2. `18569` — default Electron dev port.
 *
 * Returns `null` for packaged shells that serve the renderer from a custom
 * scheme (e.g. `app://-`) and therefore have no TCP port at all.
 */
function getDesktopDevPort(): string | null {
  if (typeof window === "undefined") return null;
  const fromBridge = window.kworksDesktop?.frontendPort;
  if (fromBridge != null && Number.isFinite(fromBridge)) {
    return String(fromBridge);
  }
  return LEGACY_ELECTRON_DEV_PORT;
}

/**
 * Electron renderer loaded from the Next.js dev server.
 *
 * In this mode the gateway is owned by the Electron dev launcher, while
 * renderer API calls use Next rewrites for cookie-based auth. The renderer
 * recognises this mode by comparing `window.location.port` against the port
 * reported via the Electron preload bridge.
 */
export function isDesktopDevMode(): boolean {
  if (!isDesktop() || typeof window === "undefined") return false;
  const devPort = getDesktopDevPort();
  if (devPort === null) return false;
  return window.location.port === devPort;
}

/**
 * Desktop mode where Electron's BackendManager owns the gateway lifecycle.
 *
 * Packaged desktop uses this path; desktop dev does not, because the dev
 * launcher starts and respawns the gateway process.
 */
export function isDesktopBackendManagedMode(): boolean {
  return isDesktop() && !isDesktopDevMode();
}

function getBaseOrigin() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://localhost:9191";
}

export function getBackendBaseURL(): string {
  if (isDesktop()) {
    // Dev mode: connect DIRECTLY to the gateway at `localhost:<port>` — NOT
    // via the Next.js rewrite proxy. Same rationale as getLangGraphBaseURL:
    //
    // 1. The Next.js rewrite proxy's fallback port (9193) is a legacy Docker
    //    deployment port that is dead in dev mode. Relying on the
    //    KWORKS_INTERNAL_GATEWAY_BASE_URL env var to override it is fragile.
    // 2. SameSite cookies: the renderer loads from `localhost:<devPort>`.
    //    Using `localhost` keeps the request same-site so cookie auth + CSRF
    //    double-submit work.
    //
    // The fetcher injects `credentials: "include"` and the Bearer token for
    // desktop requests, so auth works on the cross-port direct connection.
    if (isDesktopDevMode()) {
      return `http://localhost:${_desktopPort}`;
    }
    // Packaged (managed) mode: talk to the embedded gateway directly.
    return `http://127.0.0.1:${_desktopPort}`;
  }

  if (env.NEXT_PUBLIC_BACKEND_BASE_URL) {
    return new URL(env.NEXT_PUBLIC_BACKEND_BASE_URL, getBaseOrigin())
      .toString()
      .replace(/\/+$/, "");
  } else {
    return "";
  }
}

export function getLangGraphBaseURL(isMock?: boolean): string {
  if (isDesktop()) {
    if (isDesktopDevMode()) {
      // Dev mode: connect DIRECTLY to the gateway at `localhost:<port>` — NOT
      // via the Next.js rewrite proxy, and NOT via 127.0.0.1. Two reasons:
      //
      // 1. SSE streaming: the Next.js rewrite proxy buffers SSE responses, so
      //    model replies would appear all at once instead of streaming
      //    token-by-token.
      // 2. SameSite cookies: the renderer loads from `localhost:<devPort>`.
      //    Browsers treat `localhost` and `127.0.0.1` as DIFFERENT sites, so
      //    `127.0.0.1` would block the access_token (SameSite=Lax) and
      //    csrf_token (SameSite=Strict) cookies — causing 403 CSRF errors.
      //    Using `localhost` keeps the request same-site so cookie auth +
      //    CSRF double-submit work exactly like KStock's dev setup.
      //
      // The SDK fetch is configured with `credentials: "include"` in
      // prepareLangGraphRequest so cookies are carried despite the
      // cross-origin port.
      return `http://localhost:${_desktopPort}/api`;
    }
    // Packaged (managed) mode: renderer is `app://`, cross-scheme to the HTTP
    // gateway, so SameSite cookies are unavailable. Auth uses the Bearer
    // token injected by injectDesktopAuthorization; gateway deps.py +
    // auth_middleware.py fall back to the Authorization header, and the CSRF
    // middleware exempts Bearer requests (token is not CSRF-vulnerable).
    return `http://127.0.0.1:${_desktopPort}/api`;
  }

  if (env.NEXT_PUBLIC_LANGGRAPH_BASE_URL) {
    return new URL(
      env.NEXT_PUBLIC_LANGGRAPH_BASE_URL,
      getBaseOrigin(),
    ).toString();
  } else if (isMock) {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/mock/api`;
    }
    return "http://localhost:9192/mock/api";
  } else {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/api/langgraph`;
    }
    return "http://localhost:9191/api/langgraph";
  }
}
