// desktop/main/keyboard-bridge.mjs
/**
 * qilinDesktop 主进程桥（KStock qilin-bridge 同款机制的 mjs 移植）：快捷键
 * 偏好存储（引擎 ShortcutPersistence + 原子文件）与原生键盘输入
 * （before-input-event → 渲染端命令注册表）。
 *
 * 为什么必须由壳实现（而不是只落 data-platform 标记）：引擎在 desktop
 * 运行时要求 window.qilinDesktop 的 keyboard + shortcuts 两个面都存在，
 * 缺任一面 client-shortcuts 直接 throw，整条插件图 pending（v0.1.0
 * 无痕化改造首启实测：33 项 pending，"Desktop keyboard bridge
 * unavailable"）。原生输入消息必须盖当前 accepted revision——渲染端按
 * revision 丢弃过期输入，所以偏好存储（revision 的所有者）与键盘通道
 * 必须在同一进程里协调。
 *
 * 引擎实现复用：ShortcutPersistence/bindingKey/effectiveShortcuts 直接
 * 从运行时闭包的 lib 构建产物动态 import（packages/client/shortcuts/
 * lib/protocol.js，ESM 自包含，bare specifier 沿闭包 node_modules 解析）
 * ——不做任何协议语义的手写复刻。
 *
 * 吞键边界（与引擎契约对齐，KStock qilin-shortcuts.ts 头注同源）：
 * - 生效中的可配置组合键 → preventDefault + 转发（原生通道是唯一派发路径）；
 * - 其余带 control/alt/meta 的手势 → 只转发不吞（双键和弦的序列头部靠它配对）；
 * - 壳自留键（F12 / 重载 / 缩放 / DevTools）→ 不转发不吞，维持壳行为；
 * - recording 期间全部放行（设置页录键需要原始按键）；
 * - 首次 get 完成前 revision 未协商 → 不转发。
 *
 * @module desktop/main/keyboard-bridge
 */

import { ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** IPC 通道名；preload 侧（shell.cjs）与本表一一对应。 */
const CHANNEL = {
  get: 'qilin:shortcuts:get',
  edit: 'qilin:shortcuts:edit',
  recording: 'qilin:shortcuts:recording',
  close: 'qilin:keyboard:close',
  snapshot: 'qilin:shortcuts:snapshot',
  input: 'qilin:keyboard:input',
}

/** 壳自留键：应用菜单 roles（重载/缩放/DevTools）已裁决的手势，桥不参与。 */
function shellOwnedChord(input) {
  const key = input.key.toLowerCase()
  const ctrl = input.control || input.meta
  return key === 'f12' || (ctrl && key === 'r') || (ctrl && input.shift && key === 'i')
    || (ctrl && (key === '+' || key === '=' || key === '-' || key === '0'))
}

/** 修饰键按协议规范序（control, alt, shift, meta）序列化，复用引擎 bindingKey。 */
function gestureKeyOf(protocol, gesture) {
  const modifiers = []
  if (gesture.control) modifiers.push('control')
  if (gesture.alt) modifiers.push('alt')
  if (gesture.shift) modifiers.push('shift')
  if (gesture.meta) modifiers.push('meta')
  return protocol.bindingKey({ code: gesture.code, modifiers })
}

/** 只收「当前文档下可执行」的可配置绑定；fixed/冲突行/带 issue 行留 DOM 默认。 */
function desktopSwallowKeys(protocol, definitions, document_, runtime, platform) {
  const keys = new Set()
  for (const row of protocol.effectiveShortcuts(definitions, document_, runtime, platform)) {
    if (row.binding === null || row.issue !== null || row.conflicts.length > 0) continue
    keys.add(protocol.bindingKey(row.binding))
  }
  return keys
}

/**
 * 给 shell 窗口接上 qilinDesktop 桥（偏好存储 + 原生键盘）。运行树就绪后
 * 调用（桥从闭包动态 import 引擎协议实现）。重复调用安全：先摘旧 handler
 * 再挂新的；窗口关闭时释放全部监听。
 *
 * @param {import('electron').BrowserWindow} window - 承载引擎 UI 的主窗口。
 * @param {string} runtimeRoot - 运行树根（闭包所在目录，内含各包 lib 构建产物）。
 * @returns {Promise<void>} 挂载完成（import 失败时拒绝——调用方记诊断）。
 */
export async function attachQilinDesktopBridge(window, runtimeRoot) {
  const protocol = await import(pathToFileURL(join(runtimeRoot, 'packages/client/shortcuts/lib/protocol.js')).href)
  return attachQilinDesktopBridgeImpl(window, protocol)
}

/** 实现体（与 import 解耦便于诊断定位）。 */
async function attachQilinDesktopBridgeImpl(window, protocol) {
  const { app } = await import('electron')
  const file = join(app.getPath('userData'), 'keybindings.json')
  mkdirSync(app.getPath('userData'), { recursive: true })

  let current = null
  let definitions = null
  let swallow = new Set()
  let recording = false

  const recompute = () => {
    swallow = definitions === null || current === null
      ? new Set()
      : desktopSwallowKeys(protocol, definitions, current.document, 'desktop', 'macos')
  }

  const persistence = new protocol.ShortcutPersistence({
    // 原子文件适配器：读容错（缺文件 = 出厂默认），写走临时文件 + rename。
    read: () => {
      try {
        return readFileSync(file, 'utf8')
      } catch (error) {
        if (error?.code === 'ENOENT') return null
        throw error
      }
    },
    write: (raw) => {
      const temp = `${file}.${randomUUID()}.tmp`
      writeFileSync(temp, raw)
      renameSync(temp, file)
    },
  }, 'desktop', 'macos', true, (snapshot) => {
    current = snapshot
    recompute()
    if (!window.isDestroyed()) window.webContents.send(CHANNEL.snapshot, snapshot)
  })

  ipcMain.removeHandler(CHANNEL.get)
  ipcMain.removeHandler(CHANNEL.edit)
  ipcMain.removeHandler(CHANNEL.recording)
  ipcMain.removeHandler(CHANNEL.close)
  ipcMain.handle(CHANNEL.get, (_event, next) => {
    definitions = next
    persistence.setDefinitions(next)
    return persistence.readCurrent()
  })
  ipcMain.handle(CHANNEL.edit, (_event, edit, revision) => persistence.edit(edit, revision))
  ipcMain.handle(CHANNEL.recording, (_event, active) => {
    recording = active === true
  })
  ipcMain.handle(CHANNEL.close, (_event, revision) => {
    if (revision === current?.revision && !window.isDestroyed()) window.close()
  })

  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || recording || current === null || !input.code) return
    if (shellOwnedChord(input)) return
    const gesture = { code: input.code, control: input.control, alt: input.alt, shift: input.shift, meta: input.meta }
    const matched = swallow.has(gestureKeyOf(protocol, gesture))
    const modified = input.control || input.alt || input.meta
    if (!matched && !modified) return // 纯按键/Shift 组合归 DOM（fixed 动作与正文输入）
    if (matched) event.preventDefault()
    const payload = {
      revision: current.revision,
      kind: 'keyboard',
      frameName: '',
      code: input.code,
      control: input.control,
      alt: input.alt,
      shift: input.shift,
      meta: input.meta,
      repeat: input.isAutoRepeat,
    }
    if (!window.isDestroyed()) window.webContents.send(CHANNEL.input, payload)
  })

  window.once('closed', () => {
    persistence.dispose()
    ipcMain.removeHandler(CHANNEL.get)
    ipcMain.removeHandler(CHANNEL.edit)
    ipcMain.removeHandler(CHANNEL.recording)
    ipcMain.removeHandler(CHANNEL.close)
  })
}
