/**
 * KToon product splash: a native frameless window shown while the Host boots.
 *
 * The engine welcome surface is never used by the product's boot-secret profile;
 * this window owns the entire first-paint interval and closes when the workspace
 * window is shown.
 */

import { BrowserWindow } from 'electron'

let splash: BrowserWindow | undefined
let openedAt = 0
let closeTimer: NodeJS.Timeout | undefined

const SPLASH_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box}
  html,body{width:100%;height:100%;margin:0;background:transparent;overflow:hidden;font-family:Inter,"Segoe UI","Microsoft YaHei",sans-serif}
  body{display:flex;align-items:center;justify-content:center;opacity:1;transition:opacity .22s ease}
  body.is-leaving{opacity:0}
  .card{position:relative;width:100%;height:100%;border-radius:22px;overflow:hidden;background:#0c0c0e;border:1px solid rgba(255,255,255,.09);box-shadow:0 28px 80px rgba(0,0,0,.55)}
  .card:before{content:"";position:absolute;inset:0;background:
    radial-gradient(340px 180px at 50% -20%,rgba(228,87,46,.20),transparent 68%),
    radial-gradient(circle at 16% 24%,rgba(255,255,255,.10) 1px,transparent 1.6px),
    radial-gradient(circle at 82% 30%,rgba(255,255,255,.08) 1px,transparent 1.5px),
    radial-gradient(circle at 68% 82%,rgba(255,255,255,.07) 1px,transparent 1.5px);
    background-size:auto,150px 150px,220px 220px,260px 260px;pointer-events:none}
  .glow{position:absolute;left:50%;top:42%;width:240px;height:240px;transform:translate(-50%,-50%);border-radius:50%;background:rgba(228,87,46,.12);filter:blur(34px);animation:pulse 2.8s ease-in-out infinite}
  .content{position:relative;z-index:1;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px}
  .mark{width:58px;height:58px;filter:drop-shadow(0 10px 24px rgba(228,87,46,.35));animation:markIn .8s cubic-bezier(.2,.9,.25,1) both}
  .word{font-size:30px;line-height:1;font-weight:720;letter-spacing:-.7px;color:#f9fafb;animation:rise .8s .08s cubic-bezier(.2,.9,.25,1) both}
  .sub{font-size:8.5px;letter-spacing:.32em;color:rgba(249,250,251,.42);text-transform:uppercase;animation:rise .8s .16s cubic-bezier(.2,.9,.25,1) both}
  .bar{position:absolute;left:74px;right:74px;bottom:32px;height:2px;border-radius:2px;background:rgba(255,255,255,.08);overflow:hidden}
  .bar:after{content:"";position:absolute;top:0;bottom:0;width:38%;border-radius:2px;background:linear-gradient(90deg,transparent,#e4572e,transparent);animation:load 1.25s ease-in-out infinite}
  .hint{position:absolute;left:0;right:0;bottom:47px;text-align:center;font-size:9px;letter-spacing:.14em;color:rgba(249,250,251,.28)}
  @keyframes markIn{from{opacity:0;transform:translateY(8px) scale(.86)}to{opacity:1;transform:none}}
  @keyframes rise{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}
  @keyframes pulse{0%,100%{opacity:.55;transform:translate(-50%,-50%) scale(.96)}50%{opacity:1;transform:translate(-50%,-50%) scale(1.05)}}
  @keyframes load{0%{left:-40%}100%{left:110%}}
  @media (prefers-reduced-motion:reduce){.mark,.word,.sub,.glow,.bar:after{animation:none}.bar:after{left:0;width:100%}}
</style>
</head>
<body>
  <div class="card">
    <div class="glow"></div>
    <div class="content">
      <svg class="mark" viewBox="0 0 64 64" aria-hidden="true">
        <rect x="2" y="2" width="60" height="60" rx="15" fill="#141418" stroke="#e4572e" stroke-width="2.4"/>
        <path d="M26 20.5v23l18-11.5z" fill="#e4572e"/>
      </svg>
      <div class="word">KToon</div>
      <div class="sub">Studio</div>
    </div>
    <div class="hint">正在启动创作工作台</div>
    <div class="bar"></div>
  </div>
  <script>
    window.__ktoonSplashReady = true
  </script>
</body>
</html>`

/** Show the KToon splash immediately after the application is ready. */
export function openKToonSplash(): void {
  if (splash !== undefined) return
  openedAt = Date.now()
  const window = new BrowserWindow({
    width: 420,
    height: 260,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    backgroundColor: '#00000000',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  })
  splash = window
  window.once('ready-to-show', () => {
    if (window.isDestroyed() || splash !== window) return
    window.center()
    window.show()
  })
  window.on('closed', () => { if (splash === window) splash = undefined })
  void window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(SPLASH_HTML)).catch(() => undefined)
}

/** Destroy the splash immediately, including on a fatal startup failure. */
export function dismissKToonSplash(): void {
  if (closeTimer !== undefined) { clearTimeout(closeTimer); closeTimer = undefined }
  const window = splash
  splash = undefined
  if (window !== undefined && !window.isDestroyed()) window.destroy()
}

/**
 * Fade the splash out and destroy it once the main window has content.
 * A short minimum lifetime keeps the product animation from flashing on fast boots.
 */
export function closeKToonSplash(): void {
  const window = splash
  if (window === undefined || window.isDestroyed()) return
  if (closeTimer !== undefined) clearTimeout(closeTimer)
  const wait = Math.max(0, 1600 - (Date.now() - openedAt))
  closeTimer = setTimeout(() => {
    if (window.isDestroyed()) return
    void window.webContents.executeJavaScript("document.body.classList.add('is-leaving')").catch(() => undefined)
    setTimeout(() => { if (!window.isDestroyed()) window.close() }, 240)
  }, wait)
}
