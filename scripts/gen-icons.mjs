#!/usr/bin/env node
// scripts/gen-icons.mjs — 品牌图标生成管线（SVG 源 → PNG 尺寸族 / .icns）。
//
// 渲染用 dev Electron（offscreen BrowserWindow + capturePage，矢量按目标
// 像素直接栅格化，无缩放模糊）；.icns 由 macOS 自带 iconutil 合成。
// 产物（全部生成物，gitignore 不收、随包分发）：
//   branding/icons/qilin.iconset/icon_*.png（10 尺寸）
//   branding/icons/qilin.icns              （app 图标，打包期注入）
//   branding/icons/qilin-512.png           （dev 期 app.dock.setIcon）
//   branding/icons/tray.png / tray@2x.png + tray-dark.png / tray-dark@2x.png
//       （系统托盘麒麟印章，浅/深菜单栏双朱砂——彩色章刻意无 -Template 后缀）
//
// 用法：node scripts/gen-icons.mjs（幂等；SVG 源改动后重跑）。
// 前置：dev Electron 已就位（npm run dev 会自备；本脚本也可独立先跑）。

import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { SEAL_FILES, SEAL_PALETTE, traySealSvg } from './lib/tray-seal.mjs'

const run = promisify(execFile)

// 渲染子进程环境：必须是 Electron 的 GUI 形态——宿主若导出 ELECTRON_RUN_AS_NODE
// （Electron-as-Node 跑插件进程的常态），子进程会退化成纯 Node，require('electron')
// 直接 MODULE_NOT_FOUND。额外开关（如受限环境下的 --no-sandbox）走 dev.mjs 同款
// OPENKYLIN_ELECTRON_ARGS 透传，不写死进管线。
const renderEnv = { ...process.env }
delete renderEnv.ELECTRON_RUN_AS_NODE
const renderArgs = (process.env.OPENKYLIN_ELECTRON_ARGS ?? '').trim().split(/\s+/).filter(Boolean)
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const iconsDir = join(repoRoot, 'branding', 'icons')
const electronBin = join(repoRoot, '.tmp', 'dev', 'electron-tool', 'node_modules', '.bin', 'electron')

const LOGO_SVG = join(repoRoot, 'branding', 'logo', 'qilin.svg')
const TRAY_SVG = join(repoRoot, 'branding', 'logo', 'qilin-tray.svg')
const TRAY_DARK_SVG = join(repoRoot, 'branding', 'logo', 'qilin-tray-dark.svg')
const ICON_SIZES = [16, 32, 128, 256, 512]

if (!existsSync(electronBin)) {
  console.error('gen-icons: dev Electron 未就位——先跑一次 npm run dev，或 npm i electron@44.0.0 到 .tmp/dev/electron-tool')
  process.exit(1)
}
if (!existsSync(LOGO_SVG)) {
  console.error(`gen-icons: 缺源 ${LOGO_SVG}`)
  process.exit(1)
}

// 托盘印章 SVG 从单一几何源现写（scripts/lib/tray-seal.mjs）：两档朱砂同源，
// 改色/改纹只需动一个模块，重跑本脚本即全量同步（含 SVG 源与 PNG 产物）。
writeFileSync(TRAY_SVG, traySealSvg(SEAL_PALETTE.light))
writeFileSync(TRAY_DARK_SVG, traySealSvg(SEAL_PALETTE.dark))

rmSync(join(iconsDir, 'qilin.iconset'), { recursive: true, force: true })
mkdirSync(join(iconsDir, 'qilin.iconset'), { recursive: true })
for (const stale of [
  'qilin.icns', 'qilin-512.png',
  // 旧单色 template 章（麒麟印章改版后退役）
  'tray-Template.png', 'tray-Template@2x.png',
  ...Object.values(SEAL_FILES).flatMap((file) => [file.base, file.retina]),
]) {
  rmSync(join(iconsDir, stale), { force: true })
}

/** 渲染任务表：SVG 源 → { 目标文件: 像素边长 }（@2x 用 2 倍窗口渲染）。 */
const JOBS = []
for (const size of ICON_SIZES) {
  JOBS.push({ svgPath: LOGO_SVG, px: size, out: join(iconsDir, 'qilin.iconset', `icon_${size}x${size}.png`) })
  JOBS.push({ svgPath: LOGO_SVG, px: size * 2, out: join(iconsDir, 'qilin.iconset', `icon_${size}x${size}@2x.png`) })
}
JOBS.push({ svgPath: LOGO_SVG, px: 512, out: join(iconsDir, 'qilin-512.png') })
// 托盘印章：浅/深两档各 1x/@2x（尺寸与旧 template 章一致，menu bar 占位不变）
for (const variant of ['light', 'dark']) {
  const svgPath = variant === 'light' ? TRAY_SVG : TRAY_DARK_SVG
  JOBS.push({ svgPath, px: 16, out: join(iconsDir, SEAL_FILES[variant].base) })
  JOBS.push({ svgPath, px: 32, out: join(iconsDir, SEAL_FILES[variant].retina) })
}

/** 渲染进程内脚本（Electron 主进程）：单任务 offscreen 窗口截图。
 * 每任务一个独立 Electron 进程——offscreen 窗口 destroy 后同进程内新建
 * 窗口再加载 data: URL 会 ERR_FAILED（渲染进程复用缺陷），进程隔离绕开。 */
const renderScript = /* js */ `
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync } = require('node:fs')
// JSON 任务参数按“以 { 开头”的元素认领：本脚本可能带 Chromium 开关
// （OPENKYLIN_ELECTRON_ARGS，如 --no-sandbox），开关会把 argv 下标挤走。
const { job } = JSON.parse(process.argv.find((arg) => arg.startsWith('{')))
const svg = readFileSync(job.svgPath, 'utf8')
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  try {
    const dataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
    const html = '<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent}img{display:block;width:' + job.px + 'px;height:' + job.px + 'px}</style></head><body><img src="' + dataUrl + '"></body></html>'
    const win = new BrowserWindow({
      width: job.px, height: job.px, useContentSize: true, show: false,
      frame: false, transparent: true,
      webPreferences: { offscreen: true, backgroundThrottling: false },
    })
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    await new Promise((resolve) => setTimeout(resolve, 120))
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: job.px, height: job.px })
    writeFileSync(job.out, image.toPNG())
    app.quit()
  } catch (error) {
    console.error('[render]', job.source, job.px, 'failed:', error && error.message)
    process.exitCode = 1
    app.quit()
  }
})
`.trim()

const renderFile = join(iconsDir, '.gen-render.cjs')
writeFileSync(renderFile, renderScript)
try {
  for (const job of JOBS) {
    await run(electronBin, [...renderArgs, renderFile, JSON.stringify({ job })], {
      cwd: repoRoot, timeout: 60_000, env: renderEnv,
    })
  }
} finally {
  rmSync(renderFile, { force: true })
}

// .icns 合成（macOS 自带 iconutil；非 macOS 开发环境跳过——PNG 尺寸族已产出）
if (process.platform === 'darwin') {
  await run('iconutil', ['-c', 'icns', join(iconsDir, 'qilin.iconset'), '-o', join(iconsDir, 'qilin.icns')])
}

// 自检：全部产物非空
let fail = 0
for (const job of JOBS) {
  const ok = existsSync(job.out) && statSync(job.out).size > 100
  console.log(`  ${ok ? '✓' : '✗'} ${job.out.replace(repoRoot + '/', '')}`)
  if (!ok) fail++
}
console.log(fail === 0 ? '[gen-icons] 全部产物就绪' : `[gen-icons] ${fail} 项失败`)
process.exit(fail === 0 ? 0 : 1)
