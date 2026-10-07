#!/usr/bin/env node
// scripts/gen-icons.mjs — 品牌图标生成管线（SVG 源 → PNG 尺寸族 / .icns）。
//
// 渲染用 dev Electron（offscreen BrowserWindow + capturePage，矢量按目标
// 像素直接栅格化，无缩放模糊）；.icns 由 macOS 自带 iconutil 合成。
// 产物（全部生成物，gitignore 不收、随包分发）：
//   branding/icons/qilin.iconset/icon_*.png（10 尺寸）
//   branding/icons/qilin.icns              （app 图标，打包期注入）
//   branding/icons/qilin-512.png           （dev 期 app.dock.setIcon）
//   branding/icons/tray-Template.png / -@2x.png（系统托盘 template 图）
//
// 用法：node scripts/gen-icons.mjs（幂等；SVG 源改动后重跑）。
// 前置：dev Electron 已就位（npm run dev 会自备；本脚本也可独立先跑）。

import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const iconsDir = join(repoRoot, 'branding', 'icons')
const electronBin = join(repoRoot, '.tmp', 'dev', 'electron-tool', 'node_modules', '.bin', 'electron')

const LOGO_SVG = join(repoRoot, 'branding', 'logo', 'qilin.svg')
const TRAY_SVG = join(repoRoot, 'branding', 'logo', 'qilin-tray.svg')
const ICON_SIZES = [16, 32, 128, 256, 512]

if (!existsSync(electronBin)) {
  console.error('gen-icons: dev Electron 未就位——先跑一次 npm run dev，或 npm i electron@44.0.0 到 .tmp/dev/electron-tool')
  process.exit(1)
}
for (const file of [LOGO_SVG, TRAY_SVG]) {
  if (!existsSync(file)) {
    console.error(`gen-icons: 缺源 ${file}`)
    process.exit(1)
  }
}

rmSync(join(iconsDir, 'qilin.iconset'), { recursive: true, force: true })
mkdirSync(join(iconsDir, 'qilin.iconset'), { recursive: true })
for (const stale of ['qilin.icns', 'qilin-512.png', 'tray-Template.png', 'tray-Template@2x.png']) {
  rmSync(join(iconsDir, stale), { force: true })
}

/** 渲染任务表：SVG 源 → { 目标文件: 像素边长 }（@2x 用 2 倍窗口渲染）。 */
const JOBS = []
for (const size of ICON_SIZES) {
  JOBS.push({ source: 'logo', px: size, out: join(iconsDir, 'qilin.iconset', `icon_${size}x${size}.png`) })
  JOBS.push({ source: 'logo', px: size * 2, out: join(iconsDir, 'qilin.iconset', `icon_${size}x${size}@2x.png`) })
}
JOBS.push({ source: 'logo', px: 512, out: join(iconsDir, 'qilin-512.png') })
JOBS.push({ source: 'tray', px: 16, out: join(iconsDir, 'tray-Template.png') })
JOBS.push({ source: 'tray', px: 32, out: join(iconsDir, 'tray-Template@2x.png') })

/** 渲染进程内脚本（Electron 主进程）：单任务 offscreen 窗口截图。
 * 每任务一个独立 Electron 进程——offscreen 窗口 destroy 后同进程内新建
 * 窗口再加载 data: URL 会 ERR_FAILED（渲染进程复用缺陷），进程隔离绕开。 */
const renderScript = /* js */ `
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync } = require('node:fs')
const { job, logoPath, trayPath } = JSON.parse(process.argv[2]) // Electron 主进程 argv[1] = 应用路径，参数从 [2] 起
const svg = readFileSync(job.source === 'logo' ? logoPath : trayPath, 'utf8')
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
    await run(electronBin, [renderFile, JSON.stringify({ job, logoPath: LOGO_SVG, trayPath: TRAY_SVG })], {
      cwd: repoRoot, timeout: 60_000,
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
