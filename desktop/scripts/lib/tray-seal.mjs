// scripts/lib/tray-seal.mjs — 麒麟印章托盘图标：单一几何定义 → 双朱砂变体。
//
// 设计定案（逐轮决策落地，勿在别处另画第二份几何）：
//   B   朱砂固定色（不是 macOS 单色 template 图——托盘是品牌位）
//   B2  明暗双变体：浅色菜单栏 #B7352C、深色菜单栏提亮 #D9544A（暗底 4.5:1）
//   甲  白文满底：实心朱砂印面，纹样以负形镂空（透出菜单栏底色）
//   甲3 微圆角（印面边长 88 的 10% ≈ 8.8）+ 印泥斑驳（固定坐标，不随机）
//   C   饕餮兽面（对称）：16pt 下双目负形是唯一还立得住的识别锚点
//
// 满底白文 + 负形镂空，意味着图标不依赖 Template 自动着色：朱砂由本模块
// 直接决定，深浅两档由 gen-icons 导出 tray.png / tray-dark.png，运行期按
// nativeTheme.themeChanges 切换（见 desktop/main/index.mjs installTray）。
//
// 坐标系 0..100，印面 x/y = 6、边长 88、圆角 8.8（内容占比 88%）。
// 斑驳是写死的椭圆（同源同值），16pt 实尺下不可见、32px@2x 起有味道。

/** 托盘双朱砂：与 brand-manifest 的 cinnabar 同源（浅）；深档专为暗栏提亮。 */
export const SEAL_PALETTE = { light: '#B7352C', dark: '#D9544A' }

/** 变体名 → gen-icons 产物文件名（无 -Template 后缀：彩色章绝不能被系统单色化）。 */
export const SEAL_FILES = {
  light: { base: 'tray.png', retina: 'tray@2x.png' },
  dark: { base: 'tray-dark.png', retina: 'tray-dark@2x.png' },
}

/**
 * 生成一枚麒麟印章托盘图标 SVG。
 * @param {string} cinnabar - 印面朱砂（#RRGGBB）。
 * @param {{ mottle?: boolean }} [options] - mottle=false 关闭印泥斑驳（导出用）。
 * @returns {string} SVG 源（零外部依赖，可被 Chromium offscreen 直接栅格化）。
 */
export function traySealSvg(cinnabar, { mottle = true } = {}) {
  if (!/^#[0-9a-fA-f]{6}$/.test(cinnabar)) throw new Error(`tray-seal: bad cinnabar ${cinnabar}`)
  const field = '<rect x="6" y="6" width="88" height="88" rx="8.8"/>'
  const speckles = mottle
    ? `
      <g clip-path="url(#qs-field)">
        <ellipse cx="26" cy="24" rx="14" ry="9" fill="#ffffff" opacity="0.10"/>
        <ellipse cx="70" cy="72" rx="16" ry="10" fill="#ffffff" opacity="0.10"/>
        <ellipse cx="58" cy="36" rx="10" ry="7" fill="#ffffff" opacity="0.07"/>
        <ellipse cx="38" cy="80" rx="18" ry="8" fill="#000000" opacity="0.08"/>
        <ellipse cx="80" cy="32" rx="10" ry="13" fill="#000000" opacity="0.07"/>
        <ellipse cx="18" cy="56" rx="8" ry="11" fill="#000000" opacity="0.06"/>
      </g>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <!-- QiLin 托盘标识：麒麟印章 · 白文满底 · 饕餮兽面（scripts/lib/tray-seal.mjs 单一几何源）。
       负形镂空 = 镂空透底，双目/鼻梁/口槽在 16pt 下仍读得出「一张兽脸」。 -->
  <defs>
    <mask id="qs-knockout" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
      <!-- 基底白：印面整体可见；其下黑 = 负形镂空，其后白 = 负形里的孤岛 -->
      <g fill="#ffffff">${field}</g>
      <g fill="none" stroke="#000000" stroke-linecap="round">
        <!-- 双角 -->
        <path d="M47 32C41 24 32 18 20 16" stroke-width="7"/>
        <path d="M53 32C59 24 68 18 80 16" stroke-width="7"/>
        <!-- 眉脊 -->
        <path d="M23 41C30 35 39 34 46 38" stroke-width="5.5"/>
        <path d="M77 41C70 35 61 34 54 38" stroke-width="5.5"/>
      </g>
      <g fill="#000000">
        <!-- 双目 -->
        <ellipse cx="31" cy="50" rx="9.5" ry="6.5"/>
        <ellipse cx="69" cy="50" rx="9.5" ry="6.5"/>
        <!-- 鼻梁 -->
        <rect x="46.5" y="58" width="7" height="14" rx="3.5"/>
        <!-- 口槽 -->
        <rect x="24" y="76" width="52" height="10" rx="4"/>
        <!-- 颊部耳涡 -->
        <circle cx="17" cy="66" r="4"/>
        <circle cx="83" cy="66" r="4"/>
      </g>
      <g fill="#ffffff">
        <!-- 目珠 / 獠牙：负形里的印面孤岛，32px@2x 起显形 -->
        <circle cx="31" cy="50" r="3.8"/>
        <circle cx="69" cy="50" r="3.8"/>
        <rect x="34.5" y="76" width="5" height="5.5"/>
        <rect x="60.5" y="76" width="5" height="5.5"/>
      </g>
    </mask>
    <clipPath id="qs-field">${field}</clipPath>
  </defs>
  <g mask="url(#qs-knockout)">
    <g fill="${cinnabar}">${field}</g>${speckles}
  </g>
</svg>
`
}
