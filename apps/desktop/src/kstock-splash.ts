/**
 * KStock product splash: a native frameless window shown while the Host boots (K50).
 *
 * The engine splash paints the QiLin mark and is opened before any product layer
 * runs. A boot-secret product owns its account gate, so it owns the first paint
 * too: this window carries the KStock identity, stays until the workspace window
 * has content, and fades out on a short minimum lifetime.
 */

import { BrowserWindow } from 'electron'

/** Product display name whose builds use this splash. */
export const KSTOCK_PRODUCT_NAME = 'KStock'

/** Minimum time the splash stays visible so a fast boot does not flash it. */
const MIN_VISIBLE_MS = 1_100
/** Native fade before the window closes; zero-opacity is set in one step. */
const FADE_MS = 220

const WIDTH = 440
const HEIGHT = 320

let active: BrowserWindow | undefined
let openedAt = 0
let fadeTimer: NodeJS.Timeout | undefined
let closeTimer: NodeJS.Timeout | undefined

/** The medallion, wordmark, ticker, and progress line; no script and no network. */
const SPLASH_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<title></title>
<style>
  *{box-sizing:border-box}
  html,body{width:100%;height:100%;margin:0;background:transparent;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}
  body{display:flex;padding:12px;opacity:1}
  .card{position:relative;flex:1;overflow:hidden;border-radius:20px;
    background:
      radial-gradient(120% 100% at 50% -20%,rgba(217,164,65,.16),transparent 62%),
      linear-gradient(180deg,#0c1422 0%,#080d16 58%,#060910 100%);
    border:1px solid rgba(217,164,65,.20);
    box-shadow:0 30px 90px rgba(0,0,0,.60),inset 0 1px 0 rgba(255,255,255,.04)}
  .grid{position:absolute;inset:0;background-image:
      linear-gradient(rgba(151,173,204,.055) 1px,transparent 1px),
      linear-gradient(90deg,rgba(151,173,204,.055) 1px,transparent 1px);
    background-size:32px 32px;
    -webkit-mask-image:radial-gradient(80% 70% at 50% 38%,#000 42%,transparent 100%);
    mask-image:radial-gradient(80% 70% at 50% 38%,#000 42%,transparent 100%)}
  .glow{position:absolute;left:50%;top:34%;width:280px;height:200px;transform:translate(-50%,-50%);
    border-radius:50%;background:rgba(217,164,65,.10);filter:blur(46px)}
  .content{position:relative;z-index:1;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px}
  .seal{width:56px;height:56px;filter:drop-shadow(0 10px 26px rgba(196,64,47,.35));animation:rise .8s cubic-bezier(.2,.9,.25,1) both}
  .word{font-size:27px;line-height:1;font-weight:650;letter-spacing:.01em;color:#f4f6fa;animation:rise .8s .07s cubic-bezier(.2,.9,.25,1) both}
  .tag{font-size:9.5px;letter-spacing:.30em;color:rgba(217,164,65,.78);text-transform:uppercase;animation:rise .8s .14s cubic-bezier(.2,.9,.25,1) both}
  .tape{width:208px;height:42px;margin-top:6px;animation:rise .8s .20s cubic-bezier(.2,.9,.25,1) both}
  .tape polyline{fill:none;stroke:#e5484d;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;
    stroke-dasharray:320;stroke-dashoffset:320;animation:draw 1.9s cubic-bezier(.4,0,.2,1) .25s forwards;
    filter:drop-shadow(0 0 6px rgba(229,72,77,.30))}
  .tape .dot{fill:#e5484d;animation:pulse 1.6s ease-in-out infinite}
  .status{font-size:9.5px;letter-spacing:.24em;color:rgba(244,246,250,.42);text-transform:uppercase}
  .bar{position:relative;width:168px;height:2px;border-radius:2px;background:rgba(255,255,255,.06);overflow:hidden}
  .bar:after{content:"";position:absolute;top:0;bottom:0;width:38%;border-radius:2px;
    background:linear-gradient(90deg,transparent,rgba(217,164,65,.9),transparent);animation:load 1.25s ease-in-out infinite}
  @keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  @keyframes draw{to{stroke-dashoffset:0}}
  @keyframes pulse{0%,100%{opacity:.45}50%{opacity:1}}
  @keyframes load{0%{left:-40%}100%{left:110%}}
  @media (prefers-reduced-motion:reduce){
    .seal,.word,.tag,.tape{animation:none}
    .tape polyline{animation:none;stroke-dashoffset:0}
    .tape .dot,.bar:after{animation:none}
    .bar:after{left:31%}
  }
</style>
</head>
<body>
  <div class="card">
    <div class="grid"></div>
    <div class="glow"></div>
    <div class="content">
      <svg class="seal" viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id="seal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#d4503d"/>
            <stop offset="55%" stop-color="#c3402f"/>
            <stop offset="100%" stop-color="#a23526"/>
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="14" fill="url(#seal)"/>
        <rect x="3.5" y="3.5" width="57" height="57" rx="11" fill="none" stroke="#f3dc9e" stroke-opacity=".55" stroke-width="1"/>
        <path d="M24 18v28M24 32l16-14M24 32l16 14" stroke="#fff6e8" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div class="word">KStock</div>
      <div class="tag">A-Share Quant Research</div>
      <svg class="tape" viewBox="0 0 208 42" aria-hidden="true">
        <polyline points="2,34 24,30 44,32 66,24 88,27 110,17 132,21 154,12 176,16 204,7"/>
        <circle class="dot" cx="204" cy="7" r="2.6"/>
      </svg>
      <div class="status">Initializing Workbench</div>
      <div class="bar"></div>
    </div>
  </div>
</body>
</html>`

/** Window options shared by every platform; the card draws its own rounded surface. */
function splashWindowOptions() {
  return {
    width: WIDTH,
    height: HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  }
}

/** Whether a resolved product is the KStock build that owns this splash. */
export function usesKStockSplash(productName: string | undefined): boolean {
  return productName === KSTOCK_PRODUCT_NAME
}

/** Clear pending fade and close timers. */
function clearTimers(): void {
  if (fadeTimer !== undefined) { clearTimeout(fadeTimer); fadeTimer = undefined }
  if (closeTimer !== undefined) { clearTimeout(closeTimer); closeTimer = undefined }
}

/** Show the splash once; a repeated call focuses the existing window. */
export function openKStockSplash(): void {
  if (active !== undefined && !active.isDestroyed()) {
    active.focus()
    return
  }
  const window = new BrowserWindow(splashWindowOptions())
  active = window
  openedAt = Date.now()
  window.once('ready-to-show', () => {
    if (active !== window || window.isDestroyed()) return
    window.center()
    window.show()
  })
  window.on('closed', () => {
    if (active === window) active = undefined
    clearTimers()
  })
  void window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(SPLASH_HTML)).catch((error: unknown) => {
    if (active === window) active = undefined
    if (!window.isDestroyed()) window.destroy()
    console.warn('kstock splash: unavailable', error)
  })
}

/** Destroy the splash immediately, including on a fatal startup failure or quit. */
export function dismissKStockSplash(): void {
  clearTimers()
  const window = active
  active = undefined
  if (window !== undefined && !window.isDestroyed()) window.destroy()
}

/**
 * Fade the splash out and close it once the workspace is ready. A minimum visible
 * lifetime keeps the product animation from flashing on a fast boot.
 */
export function closeKStockSplash(): void {
  const window = active
  if (window === undefined || window.isDestroyed() || fadeTimer !== undefined) return
  const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - openedAt))
  fadeTimer = setTimeout(() => {
    fadeTimer = undefined
    if (window.isDestroyed()) return
    // Window opacity is a no-op on Linux; the window still closes on schedule there.
    try { window.setOpacity(0) } catch { /* Linux has no per-window opacity. */ }
    closeTimer = setTimeout(() => {
      closeTimer = undefined
      if (!window.isDestroyed()) window.close()
    }, FADE_MS)
  }, wait)
}
