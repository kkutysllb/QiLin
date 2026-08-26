"use client";

import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect } from "react";

import { isDesktop } from "@/core/config";

// Pre-paint colours the main process creates the overlay with (see
// desktop/src/main.ts) — last-resort fallbacks when sampling fails.
const OVERLAY_FALLBACK = {
  dark: { color: "#0a0a0a", symbolColor: "#d4d4d4" },
  light: { color: "#ffffff", symbolColor: "#3f3f46" },
} as const;

let sharedColorContext: CanvasRenderingContext2D | null | undefined;

/**
 * Lazily create (once) the shared 1×1 canvas context used to rasterize a CSS
 * colour into sRGB. Lazy because `document` is unavailable during SSR, and
 * cached so both normalization calls reuse the same bitmap instead of
 * allocating a canvas per colour. Returns null when a 2D context can't be
 * created (e.g. headless / non-browser environment).
 */
function getColorContext(): CanvasRenderingContext2D | null {
  if (sharedColorContext !== undefined) return sharedColorContext;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    sharedColorContext = canvas.getContext("2d");
  } catch {
    sharedColorContext = null;
  }
  return sharedColorContext;
}

/**
 * Normalizes a CSS colour into the sRGB hex / rgba() strings Electron can
 * parse.
 *
 * Tailwind v4 theme tokens are oklch() colours and getComputedStyle() keeps
 * that color space — but BrowserWindow.setTitleBarOverlay() (Electron 33)
 * rejects modern CSS colour functions with "Could not parse color as CSS
 * color", leaving the overlay stuck on its initial dark tint (black buttons
 * on the light theme, an obvious mismatch on the dark theme). Rasterizing the
 * colour into a 1px canvas bitmap and reading the pixel back forces a
 * conversion to sRGB — the only serialization Electron accepts.
 */
function normalizeCssColor(color: string, fallback: string): string {
  const ctx = getColorContext();
  if (!ctx) return fallback;
  try {
    // Canvas silently keeps the previous value when an assignment fails to
    // parse, so probe with two sentinels: a colour that survives both was
    // unparseable.
    ctx.fillStyle = "#010203";
    ctx.fillStyle = color;
    if (ctx.fillStyle === "#010203") {
      ctx.fillStyle = "#040506";
      ctx.fillStyle = color;
      if (ctx.fillStyle === "#040506") return fallback;
    }
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0, a = 0] = ctx.getImageData(0, 0, 1, 1).data;
    if (a === 0) return "rgba(0, 0, 0, 0)";
    if (a === 255) {
      return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    }
    return `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 1000) / 1000})`;
  } catch {
    return fallback;
  }
}

function isFullyTransparent(color: string): boolean {
  return /^rgba\([^)]*,\s*0\)$/.test(color);
}

/**
 * Width (in px) the native window-control overlay reserves at the top-right.
 * Read from the renderer's `--kworks-titlebar-inset` token; falls back to the
 * Windows default when the token holds a `calc()` we can't parse simply.
 */
function getTitlebarOverlayWidth(): number {
  try {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue("--kworks-titlebar-inset")
      .trim();
    const px = Number.parseFloat(raw);
    if (Number.isFinite(px) && px > 0) return px;
  } catch {
    // ignore — return the default below
  }
  return 148;
}

/**
 * Samples the fully-opaque background actually painted behind the title-bar
 * strip, just left of the window-control overlay. It walks up from the
 * topmost element at that point, skipping transparent / translucent top bars
 * and blurred layers, until it hits an opaque colour. This is what the
 * overlay must blend into on the *current* page — the fixed dark landing
 * hero (`bg-[#0a0a0a]`, theme-independent) versus the theme-driven workspace
 * backdrop (`--background`) — rather than blindly following <body>.
 */
function sampleTitlebarBackground(): string {
  try {
    const y = 24; // title-bar strip is h-12 (48px); sample its middle
    const x = Math.max(8, window.innerWidth - getTitlebarOverlayWidth() - 8);
    let el = document.elementFromPoint(x, y);
    while (el) {
      const bg = normalizeCssColor(getComputedStyle(el).backgroundColor, "");
      // normalizeCssColor returns "#rrggbb" only for fully-opaque colours;
      // transparent → "rgba(0,0,0,0)" and translucent → "rgba(r,g,b,a)".
      if (bg.startsWith("#")) return bg;
      el = el.parentElement;
    }
  } catch {
    // fall through to <body> sampling
  }
  return "";
}

function isDarkColor(hex: string): boolean {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return false;
  const n = Number.parseInt(match[1] ?? "", 16);
  if (Number.isNaN(n)) return false;
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  // Rec. 709 perceived luminance — below 128 counts as a "dark" backdrop.
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

/**
 * Keeps the native Windows window-control overlay (minimize / maximize /
 * close) visually in sync with the renderer theme on the frameless shell.
 *
 * The overlay is created with the dark pre-paint colour (#0a0a0a) by the
 * main process; once the renderer mounts — and whenever the theme or route
 * changes — we sample the title-bar backdrop and re-tint the overlay so the
 * three buttons stay seamless ("无痕").
 *
 * No-op on the web and on macOS / Linux desktop shells.
 */
export function WindowsTitlebarOverlaySync() {
  const { resolvedTheme } = useTheme();
  const pathname = usePathname();

  useEffect(() => {
    if (!isDesktop()) return;
    const bridge = window.kworksDesktop;
    if (!bridge) return;
    if (bridge.platform !== "win32") return;
    // Bind so the call keeps `bridge` as `this` (satisfies no-unbound-method).
    const setTitleBarOverlay = bridge.setTitleBarOverlay?.bind(bridge);
    if (!setTitleBarOverlay) return;

    const fallback =
      resolvedTheme === "light" ? OVERLAY_FALLBACK.light : OVERLAY_FALLBACK.dark;

    // Wait a frame so theme classes / CSS variables settle before sampling.
    const raf = requestAnimationFrame(() => {
      // Prefer the actual title-bar backdrop (correct for the fixed dark
      // landing hero and the theme-driven workspace alike), then fall back
      // to the page backdrop, then to the pre-paint theme fallback.
      let background = sampleTitlebarBackground();
      if (!background) {
        for (const el of [document.body, document.documentElement]) {
          const sampled = normalizeCssColor(
            getComputedStyle(el).backgroundColor,
            "",
          );
          if (sampled && !isFullyTransparent(sampled)) {
            background = sampled;
            break;
          }
        }
      }

      const color = background || fallback.color;
      // Choose the symbol colour by the backdrop's luminance so the buttons
      // stay legible on the fixed dark landing page even in the light theme.
      const symbolColor = isDarkColor(color)
        ? OVERLAY_FALLBACK.dark.symbolColor
        : OVERLAY_FALLBACK.light.symbolColor;

      void setTitleBarOverlay({ color, symbolColor });
    });
    return () => cancelAnimationFrame(raf);
  }, [resolvedTheme, pathname]);

  return null;
}
