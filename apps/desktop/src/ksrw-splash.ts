/** KSRW product splash: a native frameless window shown while the Host boots.
 *
 * The product owns the first-paint interval; this window closes when the workspace
 * or the welcome surface is shown.
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
  html,body{width:100%;height:100%;margin:0;background:transparent;overflow:hidden;font-family:Inter,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
  body{opacity:1;transition:opacity .22s ease}
  body.is-leaving{opacity:0}
  .card{position:relative;width:100%;height:100%;border-radius:20px;overflow:hidden;background:radial-gradient(80% 90% at 20% 0%,#1b2028 0%,#0b0d10 62%);border:1px solid #262c35;box-shadow:0 28px 80px rgba(0,0,0,.45);padding:26px 28px 20px;display:flex;flex-direction:column;align-items:flex-start}
  .mark{animation:markIn .7s cubic-bezier(.2,.7,.2,1) both}
  .mark svg{width:46px;height:46px;display:block}
  .word{display:flex;align-items:baseline;gap:10px;margin-top:12px;animation:rise .7s .06s cubic-bezier(.2,.7,.2,1) both}
  .word b{font:600 22px/1 "Source Serif 4","Noto Serif SC",Georgia,serif;letter-spacing:.02em;color:#e8e6e1}
  .word span{color:#9a968e;font-size:10.5px;letter-spacing:.16em}
  .tagline{margin:10px 0 0;color:#9a968e;font-size:11.5px;animation:rise .7s .12s cubic-bezier(.2,.7,.2,1) both}
  .bar{width:100%;height:2px;margin-top:auto;border-radius:99px;background:#20252d;overflow:hidden;position:relative}
  .bar i{display:block;width:38%;height:100%;border-radius:99px;background:linear-gradient(90deg,transparent,#c2622f,transparent);animation:load 1.35s ease-in-out infinite}
  .status{margin:9px 0 0;color:#5e5a53;font-size:10px;letter-spacing:.03em}
  @keyframes markIn{from{opacity:0;transform:scale(.86)}to{opacity:1;transform:none}}
  @keyframes rise{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
  @keyframes load{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}
  @media (prefers-reduced-motion:reduce){.mark,.word,.tagline{animation:none}.bar i{animation-duration:3s}}
</style>
</head>
<body>
  <div class="card">
    <div class="mark">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <rect x="3" y="3" width="58" height="58" rx="15" fill="#0b0d10" stroke="#c2622f" stroke-width="2"/>
        <path d="M25 16h14" stroke="#f7f4ee" stroke-width="3" stroke-linecap="round"/>
        <path d="M27 16v13L17 45a6 6 0 0 0 5 9h20a6 6 0 0 0 5-9l-10-16V16" fill="none" stroke="#f7f4ee" stroke-width="3" stroke-linejoin="round"/>
        <circle cx="28" cy="42" r="2.4" fill="#c2622f"/><circle cx="36" cy="46" r="3" fill="#c2622f"/><circle cx="33" cy="37" r="1.6" fill="#c2622f"/>
      </svg>
    </div>
    <div class="word"><b>KSRW</b><span>麒麟科研工作台</span></div>
    <p class="tagline">从一个 idea，到一份成果。</p>
    <div class="bar"><i></i></div>
    <p class="status">正在启动本地引擎…</p>
  </div>
</body>
</html>`

/** Show the KSRW splash immediately after the application is ready. */
export function openKSRWSplash(): void {
  if (splash !== undefined) return
  openedAt = Date.now()
  try {
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
  } catch (error) {
    // A cosmetic window must never block startup (headless tests, unusual shells).
    console.warn('KSRW splash unavailable:', error)
    splash = undefined
  }
}

/** Destroy the splash immediately, including on a fatal startup failure. */
export function dismissKSRWSplash(): void {
  if (closeTimer !== undefined) { clearTimeout(closeTimer); closeTimer = undefined }
  const window = splash
  splash = undefined
  if (window !== undefined && typeof window.isDestroyed === 'function' && !window.isDestroyed()
    && typeof window.destroy === 'function') window.destroy()
}

/** Fade the splash out and destroy it once the first product window is visible. */
export function closeKSRWSplash(): void {
  const window = splash
  if (window === undefined || window.isDestroyed()) return
  if (closeTimer !== undefined) clearTimeout(closeTimer)
  const wait = Math.max(0, 1200 - (Date.now() - openedAt))
  closeTimer = setTimeout(() => {
    if (window.isDestroyed()) return
    void window.webContents.executeJavaScript("document.body.classList.add('is-leaving')").catch(() => undefined)
    setTimeout(() => { if (!window.isDestroyed()) window.close() }, 240)
  }, wait)
}
