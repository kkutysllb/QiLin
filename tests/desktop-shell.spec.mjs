// tests/desktop-shell.spec.mjs
/**
 * 桌面壳（原生桌面产品：Electron 壳 + 引擎宿主子进程）产品层测试：
 * 契约纯函数（宿主参数、IPC 消息守卫、导航白名单、协议承载的静态/反代
 * 纯逻辑）、启动页资产存在性、dev 脚本的 checkout 复用 stamp 逻辑。
 * 不依赖 Electron 与上游 checkout。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { access, mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import {
  APP_ENTRY_URL,
  HOST_PORT_FILE,
  HOST_PROTOCOL_VERSION,
  MAX_AUTO_RESTARTS,
  READY_TIMEOUT_MS,
  TERM_GRACE_MS,
  appDocumentFile,
  forwardHeaders,
  hostArgs,
  injectBootGate,
  isAllowedNavigation,
  isHostEvent,
  persistHostPort,
  qilinHome,
  readPersistedHostPort,
  resolveDistFile,
  urlOrigin,
} from '../desktop/main/qilin-contract.mjs'
import { profileManifestPath, restoreShippedBundles, SHIPPED_PROFILE_BUNDLES } from '../desktop/main/recovery.mjs'
import { brandingFingerprint } from '../scripts/lib/dev-stamp.mjs'
import {
  sessionTitleOf,
  pickSession,
} from '../desktop/main/workspace.mjs'

/* ---------- 宿主子进程契约 ---------- */

test('宿主参数：Electron-as-Node + --expose-internals + 宿主入口 + 运行树 + 稳定端口', () => {
  assert.deepEqual(hostArgs('/repo/desktop/host/main.mjs', '/run/tree'), [
    '--expose-internals',
    '/repo/desktop/host/main.mjs',
    '/run/tree',
    '--port',
    '0',
  ], '缺省 0 = 随机端口')
  assert.deepEqual(hostArgs('/entry', '/run', 45678), [
    '--expose-internals',
    '/entry',
    '/run',
    '--port',
    '45678',
  ], '记忆端口透传宿主（cookie authority 绑定 host:port）')
})

test('宿主端口记忆：0600 落盘 + 范围校验 + 损坏容错', async () => {
  const home = await mkdtemp(join(tmpdir(), 'ok-port-'))
  try {
    assert.equal(readPersistedHostPort(home), null, '无记忆 → null')
    persistHostPort(45678, home)
    assert.equal(readPersistedHostPort(home), 45678, '读写回环')
    await writeFile(join(home, HOST_PORT_FILE), '{"port":"45678"}')
    assert.equal(readPersistedHostPort(home), null, '非整数拒绝')
    await writeFile(join(home, HOST_PORT_FILE), '{"port":80}')
    assert.equal(readPersistedHostPort(home), null, '1024 以下特权端口拒绝')
    await writeFile(join(home, HOST_PORT_FILE), '{"port":70000}')
    assert.equal(readPersistedHostPort(home), null, '65535 以上拒绝')
    await writeFile(join(home, HOST_PORT_FILE), 'not-json')
    assert.equal(readPersistedHostPort(home), null, '损坏文件容错')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('宿主消息守卫：ready 校验回环 URL 与注入表，fatal 校验消息体', () => {
  assert.deepEqual(
    isHostEvent({ type: 'ready', url: 'http://127.0.0.1:4567/workspace?token=t', injections: [] }),
    { type: 'ready', url: 'http://127.0.0.1:4567/workspace?token=t', injections: [] },
  )
  assert.equal(isHostEvent({ type: 'ready', url: 'http://localhost:1/', injections: [] }), null, '只认 127.0.0.1 字面量')
  assert.equal(isHostEvent({ type: 'ready', url: 'http://127.0.0.1:1/' }), null, '缺注入表拒绝')
  assert.equal(isHostEvent({ type: 'ready', url: 'https://127.0.0.1:1/', injections: [] }), null, '协议收紧')
  assert.deepEqual(
    isHostEvent({ type: 'fatal', message: 'boom', diagnostic: 'stack…' }),
    { type: 'fatal', message: 'boom', diagnostic: 'stack…' },
  )
  assert.equal(isHostEvent({ type: 'fatal' }), null, '无消息体的 fatal 拒绝')
  assert.deepEqual(isHostEvent({ type: 'booting' }), { type: 'booting' })
  assert.deepEqual(isHostEvent({ type: 'shutdown-complete' }), { type: 'shutdown-complete' })
  assert.equal(isHostEvent({ nonsense: true }), null)
  assert.equal(isHostEvent('string'), null)
  assert.equal(isHostEvent(null), null)
})

test('宿主请求-应答守卫：requestId 关联且布尔域缺省为 false', () => {
  assert.deepEqual(
    isHostEvent({ type: 'quit-inspection', requestId: 3, activeTasks: true, scheduledTasks: false }),
    { type: 'quit-inspection', requestId: 3, activeTasks: true, scheduledTasks: false },
  )
  assert.deepEqual(
    isHostEvent({ type: 'update-tasks', requestId: 4 }),
    { type: 'update-tasks', requestId: 4, active: false },
    '缺省布尔域如实归 false',
  )
  assert.equal(isHostEvent({ type: 'update-tasks', requestId: 0 }), null, 'requestId 必须为正整数')
})

test('进程纪律常量', () => {
  assert.equal(MAX_AUTO_RESTARTS, 3)
  assert.equal(TERM_GRACE_MS, 5_000)
  assert.ok(READY_TIMEOUT_MS >= 60_000, '就绪上限需覆盖上游 profile 初始化冷启动')
  assert.ok(Number.isInteger(HOST_PROTOCOL_VERSION) && HOST_PROTOCOL_VERSION >= 1)
})

test('qilin home 与 CLI/浏览器端共享（QILIN_HOME 覆盖优先）', () => {
  assert.equal(qilinHome({ QILIN_HOME: '/data/qilin' }), '/data/qilin')
  assert.equal(qilinHome({ QILIN_HOME: '   ' }), qilinHome({}), '空白覆盖视同未设置')
})

/* ---------- 致命错误恢复（M3.3：出厂插件面） ---------- */

test('恢复出厂插件面：第三方 bundle 摘除、dependencies 保留、备份可回滚、幂等', async () => {
  const home = await mkdtemp(join(tmpdir(), 'ok-recovery-'))
  try {
    assert.equal(profileManifestPath(home), join(home, 'profiles', 'qilin', 'package.json'), 'manifest 路径 = resolveProfileDir 语义')
    assert.deepEqual(
      restoreShippedBundles(home),
      { changed: false, removed: [], backupPath: null, error: null },
      '无 manifest（首次启动即 fatal）= 无需恢复且不报错',
    )
    const manifestPath = profileManifestPath(home)
    await mkdir(dirname(manifestPath), { recursive: true })
    await writeFile(manifestPath, JSON.stringify({
      name: 'qilin',
      dependencies: { 'my-plugin': '^1.0.0' },
      qilin: {
        profile: {
          bundles: [...SHIPPED_PROFILE_BUNDLES, 'my-plugin', 'bad-plugin'],
        },
      },
    }))
    const result = restoreShippedBundles(home)
    assert.equal(result.changed, true)
    assert.deepEqual(result.removed, ['my-plugin', 'bad-plugin'], '第三方层全部摘除')
    const restored = JSON.parse(await readFile(manifestPath, 'utf8'))
    assert.deepEqual(restored.qilin.profile.bundles, [...SHIPPED_PROFILE_BUNDLES], '启用面 = 出厂模板层')
    assert.equal(restored.dependencies['my-plugin'], '^1.0.0', '安装记录保留（只是不再装配）')
    const backup = JSON.parse(await readFile(/** @type {string} */ (result.backupPath), 'utf8'))
    assert.deepEqual(
      backup.qilin.profile.bundles,
      [...SHIPPED_PROFILE_BUNDLES, 'my-plugin', 'bad-plugin'],
      '整份 manifest 先备份（误操作可手工还原）',
    )
    assert.deepEqual(
      restoreShippedBundles(home),
      { changed: false, removed: [], backupPath: null, error: null },
      '已是出厂面 → 幂等不动',
    )
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('恢复出厂插件面：dsh 旧 face 兜底（上游 profileDeclarationOf 次序）', async () => {
  const home = await mkdtemp(join(tmpdir(), 'ok-recovery-dsh-'))
  try {
    const manifestPath = profileManifestPath(home)
    await mkdir(dirname(manifestPath), { recursive: true })
    await writeFile(manifestPath, JSON.stringify({
      dsh: { profile: { bundles: ['@qilin-agent/base', 'legacy-plugin'] } },
    }))
    const result = restoreShippedBundles(home)
    assert.equal(result.changed, true)
    assert.deepEqual(result.removed, ['legacy-plugin'])
    const restored = JSON.parse(await readFile(manifestPath, 'utf8'))
    assert.deepEqual(restored.dsh.profile.bundles, [...SHIPPED_PROFILE_BUNDLES], '旧 face 同样恢复出厂')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('恢复出厂插件面：损坏 manifest 如实报错，不静默改写', async () => {
  const home = await mkdtemp(join(tmpdir(), 'ok-recovery-bad-'))
  try {
    const manifestPath = profileManifestPath(home)
    await mkdir(dirname(manifestPath), { recursive: true })
    await writeFile(manifestPath, 'not-json')
    const result = restoreShippedBundles(home)
    assert.equal(result.changed, false)
    assert.match(/** @type {string} */ (result.error), /读取 profile manifest 失败/)
    assert.equal(await readFile(manifestPath, 'utf8'), 'not-json', '原样保留（不覆盖损坏文件）')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

/* ---------- qilin-app:// 承载契约 ---------- */

test('app 入口地址固定为 qilin-app://app/workspace（上游 WEB_ENTRY_PATH）', () => {
  assert.equal(APP_ENTRY_URL, 'qilin-app://app/workspace')
})

test('导航白名单只放行壳自有协议，外链全部拒绝（调用方转系统浏览器）', () => {
  assert.equal(isAllowedNavigation('qilin-app://app/workspace'), true, 'SPA 入口')
  assert.equal(isAllowedNavigation('qilin-app://app/session/abc'), true, 'SPA 会话路由')
  assert.equal(isAllowedNavigation('https://example.com'), false, '外链拒绝')
  assert.equal(isAllowedNavigation('http://127.0.0.1:4567/'), false, '宿主地址不出现在导航面')
  assert.equal(isAllowedNavigation('file:///etc/passwd'), false)
  assert.equal(isAllowedNavigation('not a url'), false)
})

test('文档路由：入口应用文档与公开文档按宿主语义映射 dist 文件', () => {
  assert.equal(appDocumentFile('/'), 'landing.html', '宿主语义：/ = landing')
  assert.equal(appDocumentFile('/login'), 'auth.html', '宿主语义：/login = 登录文档')
  assert.equal(appDocumentFile('/setup'), 'auth.html')
  assert.equal(appDocumentFile('/workspace'), 'index.html', '入口应用文档（壳注入 boot 闸）')
  assert.equal(appDocumentFile('/index.html'), 'index.html')
  assert.equal(appDocumentFile('/api/session/list'), null, 'API 走反代')
  assert.equal(appDocumentFile('/assets/app.js'), null, '静态资源走文件路径')
})

test('dist 路径解析：防穿越、防空字节、拒绝根路径', () => {
  const root = '/run/dist'
  assert.equal(resolveDistFile(root, '/assets/app.js'), join(root, 'assets/app.js'))
  assert.equal(resolveDistFile(root, '/index.html'), join(root, 'index.html'))
  assert.equal(resolveDistFile(root, '/'), null)
  assert.equal(resolveDistFile(root, '/../etc/passwd'), null, '穿越拒绝')
  assert.equal(resolveDistFile(root, '/%2e%2e/etc/passwd'), null, '编码穿越拒绝')
  assert.equal(resolveDistFile(root, '/assets/a%20b.js'), join(root, 'assets/a b.js'), '解码空格')
  assert.equal(resolveDistFile(root, '/assets/\0.js'), null, '空字节拒绝')
})

test('boot 闸注入：紧跟 <head> 之后；无 head 时前置', () => {
  const injected = injectBootGate('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>')
  assert.match(injected, /<head><script>globalThis\.__QILIN_BOOT_READY__ = Promise\.withResolvers\(\)<\/script>/)
  const noHead = injectBootGate('<!doctype html><html><body></body></html>')
  assert.match(noHead, /^<script>globalThis\.__QILIN_BOOT_READY__/)
})

test('反代请求头：剥离壳侧 origin/cookie/逐跳头，附宿主会话 cookie', () => {
  const headers = new Headers({
    'content-type': 'application/json',
    'origin': 'qilin-app://app',
    'cookie': 'stale=1',
    'sec-fetch-site': 'same-origin',
    'x-request-id': 'abc',
  })
  const forwarded = forwardHeaders(headers, 'qilin-auth-x=signed')
  assert.equal(forwarded['content-type'], 'application/json')
  assert.equal(forwarded['x-request-id'], 'abc')
  assert.equal(forwarded.cookie, 'qilin-auth-x=signed', '壳托管 cookie 覆盖')
  assert.equal(forwarded.origin, undefined)
  assert.equal(forwarded['sec-fetch-site'], undefined)
  const anonymous = forwardHeaders(headers, '')
  assert.equal(anonymous.cookie, undefined, '无 cookie 不附加')
})

test('认证兑换：set-cookie 只取名值对（属性留在主进程）', async () => {
  const { extractAuthCookie } = await import('../desktop/main/qilin-contract.mjs')
  const response = {
    headers: {
      getSetCookie: () => [
        'qilin-auth-abc=signed-value; Path=/; HttpOnly; SameSite=Strict',
        'other=2; Path=/',
      ],
    },
  }
  assert.equal(extractAuthCookie(response), 'qilin-auth-abc=signed-value; other=2')
  assert.equal(extractAuthCookie({ headers: { getSetCookie: () => [], get: () => null } }), '', '无会话头返回空串')
})

test('urlOrigin 忽略查询与路径', () => {
  assert.equal(urlOrigin('http://127.0.0.1:4567/?token=x'), 'http://127.0.0.1:4567')
  assert.equal(urlOrigin('::bad::'), null)
})

/* ---------- 启动页资产与壳文件 ---------- */

test('启动页资产齐备（splash.html + preload + 主进程六件套 + 宿主入口 + 恢复模块）', async () => {
  for (const rel of [
    'desktop/renderer/splash.html',
    'desktop/preload/splash.mjs',
    'desktop/main/index.mjs',
    'desktop/main/windows.mjs',
    'desktop/main/protocol.mjs',
    'desktop/main/host-process.mjs',
    'desktop/main/qilin-contract.mjs',
    'desktop/main/recovery.mjs',
    'desktop/host/main.mjs',
  ]) {
    await assert.doesNotReject(access(new URL(`../${rel}`, import.meta.url)), undefined, rel)
  }
  const splash = await readFile(new URL('../desktop/renderer/splash.html', import.meta.url), 'utf8')
  assert.match(splash, /云门正在开启/, '启动页主文案（与共享壳层 locale 一致）')
  assert.match(splash, /基于 QiLin 构建/, '品牌副标题')
  assert.match(splash, /重试启动/, '失败恢复入口')
  assert.match(splash, /禁用插件并重启/, '出厂插件面恢复入口（M3.3）')
  assert.match(splash, /Content-Security-Policy/, '本地页面也有 CSP')
  const splashPreload = await readFile(new URL('../desktop/preload/splash.mjs', import.meta.url), 'utf8')
  assert.match(splashPreload, /splash:recover-disable-plugins/, '恢复入口经 IPC 白名单')
})

test('branding 指纹随品牌输入变化（stamp 复用的守门依据）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ok-stamp-'))
  try {
    await mkdir(join(dir, 'patches'), { recursive: true })
    await mkdir(join(dir, 'branding/theme'), { recursive: true })
    await writeFile(join(dir, 'patches/registry.json'), JSON.stringify({
      schemaVersion: 1,
      patches: [{ patch: 'patches/shared-web-branding.patch' }],
      overwrites: [{ mode: 'add', source: 'branding/theme/tokens.css', target: 'apps/renderer/ok-theme.css' }],
    }))
    await writeFile(join(dir, 'patches/shared-web-branding.patch'), 'a\n')
    await writeFile(join(dir, 'branding/theme/tokens.css'), 'b\n')
    const before = brandingFingerprint(dir)
    assert.equal(brandingFingerprint(dir), before, '输入不变 → 指纹稳定')
    await writeFile(join(dir, 'patches/shared-web-branding.patch'), 'a2\n')
    assert.notEqual(brandingFingerprint(dir), before, 'patch 内容变化 → 指纹变化')
    await writeFile(join(dir, 'patches/shared-web-branding.patch'), 'a\n')
    await writeFile(join(dir, 'branding/theme/tokens.css'), 'b2\n')
    assert.notEqual(brandingFingerprint(dir), before, '覆盖源变化 → 指纹变化')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

/* ---------- 标题栏工作区解析（workspace.mjs 纯函数） ---------- */

test('窗口标题截掉上游 DocumentTitle 尾巴，取纯会话标题', () => {
  assert.equal(sessionTitleOf('项目核心引擎递归自进化能力 — QiLin'), '项目核心引擎递归自进化能力')
  assert.equal(sessionTitleOf('QiLin Desktop'), 'QiLin Desktop', '无尾巴原样返回')
  assert.equal(sessionTitleOf(undefined), '', '空值容错')
})

test('会话投影 → 当前工作区：标题精确优先，crumb 提示次之，mtime 兜底', () => {
  // 数据源 = QILIN_HOME 的 session_projcache（identity.cwd + rows.title.val）
  const entries = [
    { id: 'session-aaa', cwd: '/Users/libing/kk_Projects/OpenKylin', title: '旧会话', mtime: 100 },
    { id: 'session-bbb', cwd: '/Users/libing/kk_Projects/DSH-Desktop', title: '你好问候', mtime: 300 },
    { id: 'session-ccc', cwd: '/tmp/third', title: '无题', mtime: 200 },
  ]
  assert.deepEqual(
    pickSession(entries, { title: '你好问候' }),
    { name: 'DSH-Desktop', path: '/Users/libing/kk_Projects/DSH-Desktop' },
    '窗口标题 === 缓存标题 → 精确命中',
  )
  assert.deepEqual(
    pickSession(entries, { sessionId: 'session-aaa' }),
    { name: 'OpenKylin', path: '/Users/libing/kk_Projects/OpenKylin' },
    'crumb 提示命中文件名 → 该会话工作区',
  )
  assert.deepEqual(
    pickSession(entries),
    { name: 'DSH-Desktop', path: '/Users/libing/kk_Projects/DSH-Desktop' },
    '无提示 → mtime 最新（最近活动会话）',
  )
  assert.deepEqual(
    pickSession([{ id: 's', cwd: '/tmp/x', title: '', mtime: 1 }], { title: '别的' }),
    { name: 'x', path: '/tmp/x' },
    '标题不齐的条目仍可作兜底候选',
  )
  assert.equal(pickSession([], {}), null, '空清单 → null')
  assert.equal(pickSession('not-an-array'), null, '非法输入容错')
})

/* ---------- 标题栏 / 无边框窗口（呈现层契约，源文件标记） ---------- */

test('自绘标题栏：KCoder SHELL_TITLEBAR_JS 移植 + 窗口级按钮', async () => {
  const source = await readFile(new URL('../desktop/main/titlebar.mjs', import.meta.url), 'utf8')
  // KCoder 实测常量：48px 栏、darwin leftPad 78、侧栏右缘跟随
  assert.match(source, /TITLEBAR_HEIGHT = 48/, '高度照抄 KCoder（红绿灯 y 自动=18）')
  assert.match(source, /LEFT_PAD = 78/, 'darwin 左基线照抄 KCoder')
  assert.match(source, /sidebarCol/, '侧栏右缘探针（KCoder 同款，标题对齐主内容列）')
  assert.match(source, /--ok-sidebar-w/, '侧栏宽度变量驱动标题起排')
  // 工作区段：文件夹图标 + 弱化色 + " / " 分隔（KCoder 同款）
  assert.match(source, /ok-ws-btn/, '工作区实体按钮（点击打开目录）')
  assert.match(source, /ok-actions\{position:absolute;right:10px/, '右侧按钮走动作簇流式排布（top 垂直居中、右缘固定）')
  assert.match(
    source,
    /actions\.append\(btnApp, termHost, btnPanel\)/,
    '挂载点（KCoder 契约 id）夹在应用按钮与右栏开关之间——插件增减只重排簇内流，不留固定槽位空隙',
  )
  assert.doesNotMatch(source, /\.ok-btn-(?:panel|app)\{right:/, '按钮不再用固定 right 偏移定位（终端退役后曾留 32px 坑）')
  assert.match(source, /align-items:baseline/, '面包屑基线对齐（latin 与 CJK 同基线，混排不沉底）')
  assert.match(source, /align-self:baseline/, '工作区按钮对齐到面包屑基线（合成基线取文字而非图标盒底）')
  assert.doesNotMatch(source, /translateY\(\.5px\)/, '基线制下无需半像素图标补偿')
  assert.match(source, /_titleRow.*_label/s, '预设徽章收纳上游 AgentPresetLabel')
  // 编辑器选择：自持菜单直启上游接口，零模拟点击
  assert.match(source, /open-in-app\/apps/, '应用清单走上游 HTTP 接口')
  assert.match(source, /open-in-app\/open/, '启动走上游 HTTP 接口')
  assert.match(source, /qilin\.open-in-app\.choice/, '记忆选择与上游同键互通')
  assert.match(source, /data-sidebar-right-toggle/, '右侧边栏开关镜像上游稳定 data 钩子')
  assert.match(source, /data-sidebar-right-expand/, '面板收起态的展开按钮同样镜像')
  assert.match(
    source,
    /q\('\[data-sidebar-right-expand\]'\) \?\? q\('\[data-sidebar-right-toggle\]'\)/,
    '转发先展开钮后折叠钮——折叠钮在收起态是 setExpanded(false) no-op（编码模式实测），展开钮只在收起态挂载',
  )
  assert.match(source, /header\[class\*="_header"\]:has\(\[class\*="_titleRow"\]\)/, '会话头重复行整行收掉，空间归还主工作区')
  assert.match(source, /okShell\?\.revealWorkspace/, '工作区名点击 → 主进程 Finder 打开')
  assert.match(source, /bridge\?\.workspace/, '工作区名经桥解析（页面只传只读提示）')
  assert.match(source, /--ok-tb-h/, '高度变量供上游 inset 消费（设置页覆盖层让位）')
  assert.match(source, /-webkit-app-region: ?no-drag/, '可点元素不落拖拽区')
  // 实心栏下侧栏顶部收紧：类名为哈希前缀子串探针（如 _34ohLq_logoRow），
  // 且必须限定 sidebarCol 列内——否则匹配不上运行时 DOM 或误伤其它包
  assert.match(source, /ok-tb-solid \[class\*="sidebarCol"\] \[class\*="_logoRow"\]/, 'logoRow 顶部收紧（60px figma 行高压到 44px）')
  assert.match(source, /ok-tb-solid \[class\*="sidebarCol"\] \[class\*="_collapsed"\] \[class\*="_logoRow"\]/, '折叠 rail 几何显式还原')
  assert.match(source, /ok-tb-solid \[class\*="sidebarCol"\] > \[class\*="_root"\]/, '侧栏根 padding-top 归零')
})

test('窗口层：整窗无边框 + 红绿灯召回 + 沙箱 preload 双桥 + app 入口', async () => {
  const windows = await readFile(new URL('../desktop/main/windows.mjs', import.meta.url), 'utf8')
  assert.match(windows, /frame: false/, 'shell 窗口无边框')
  assert.match(windows, /setWindowButtonVisibility\(true\)/, 'macOS frameless 红绿灯显式召回')
  assert.match(windows, /titleBarStyle: 'hidden'/, "darwin 走 titleBarStyle:'hidden'——frame:false 下 trafficLightPosition 根本不生效（AX 实测配置 26/36 按钮纹丝不动）")
  assert.match(windows, /trafficLightPosition: \{ x: 13, y: 19 \}/, '红绿灯 y≈16px 按钮 top-left（hidden 下实测 y:26→中心 33，+7）：配 19 使中心落在 26px 光学线，与 strip 开关/收起态控件同线')
  assert.match(windows, /preload: SHELL_PRELOAD/, 'shell 窗口挂 preload 桥')
  assert.match(windows, /APP_ENTRY_PATH/, 'shell 加载壳自有协议入口')
  assert.match(windows, /loadURL\(`\$\{APP_ORIGIN\}\$\{entryPath\}`\)/, '入口地址 = 协议 origin + 登录态选定的路径')
  await assert.doesNotReject(access(new URL('../desktop/preload/shell.cjs', import.meta.url)))
  const preload = await readFile(new URL('../desktop/preload/shell.cjs', import.meta.url), 'utf8')
  assert.match(preload, /contextBridge/, '桥面走 contextBridge')
  assert.match(preload, /qilinDesktopBoot/, '上游桌面启动门契约桥（apps/web/src/main.ts 契约名）')
  assert.match(preload, /ok:desktop-boot/, 'IPC 白名单：boot 数据')
  assert.match(preload, /ok:workspace/, 'IPC 白名单：工作区解析')
  assert.match(preload, /qilin-app:/, 'boot 桥按 origin 门控')
  assert.match(preload, /require\('electron'\)/, '沙箱 preload 仅 CJS')
  const splash = await readFile(new URL('../desktop/renderer/splash.html', import.meta.url), 'utf8')
  assert.match(splash, /-webkit-app-region: drag/, '无边框启动页整页可拖')
})

test('协议承载：特权 scheme 三路由 + WS 改写 + 认证反代接线', async () => {
  const source = await readFile(new URL('../desktop/main/protocol.mjs', import.meta.url), 'utf8')
  assert.match(source, /registerSchemesAsPrivileged/, '特权 scheme（ready 前注册）')
  assert.match(source, /standard: true/, 'standard scheme（相对路径解析）')
  assert.match(source, /protocol\.handle\('qilin-app'/, 'app 路由挂载')
  assert.match(source, /appDocumentFile/, '文档路由镜像宿主语义（landing/auth/index）')
  assert.match(source, /resolveDistFile/, '静态文件防穿越解析')
  assert.match(source, /injectBootGate/, 'index 注入 __QILIN_BOOT_READY__ 闸')
  assert.match(source, /forwardRequest/, '动态请求反代宿主')
  assert.match(source, /forbidden origin/, 'Origin 白名单强制 qilin-app://app')
  assert.match(source, /set-cookie/, '响应剥离 set-cookie（cookie 不进 renderer）')
  assert.match(source, /onBeforeSendHeaders/, 'ws://127.0.0.1/* 头改写（流式 mux 载体）')
  assert.match(source, /authenticateWebHost/, '壳侧 token→cookie 兑换')
  const hostEntry = await readFile(new URL('../desktop/host/main.mjs', import.meta.url), 'utf8')
  assert.match(hostEntry, /runProfile/, '宿主程序化 boot（不经 CLI 子进程）')
  assert.match(hostEntry, /profile: 'qilin'/, '产品面 profile')
  assert.match(hostEntry, /'--no-open', '--port', String\(hostPort\)/, '壳传入的稳定端口透传 profile（0 = 随机）')
  assert.match(hostEntry, /collectIndexInjections/, '就绪回传插件注入表')
  assert.match(hostEntry, /whenListened/, 'socket 绑定后才取 port（settle 竞态守卫）')
  assert.match(hostEntry, /inspectTasks/, '任务检查读真实引擎面（M3.2）')
  assert.match(hostEntry, /agents.*list|list\(\).*agents/s, 'Agent 回合状态（ctx.agents）')
  assert.match(hostEntry, /jobs/, '后台任务状态（ctx.jobs）')
  assert.match(hostEntry, /schedule/, '定时提醒状态（ctx.schedule.catalog）')
  const index = await readFile(new URL('../desktop/main/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /registerAppScheme\(\)/, 'app ready 前注册 scheme')
  assert.match(index, /authenticateWebHost/, '就绪后壳侧兑换 cookie')
  assert.match(index, /attachAppProtocol/, '窗口加载前挂协议')
  assert.match(index, /pickHostPort/, '稳定端口决策（记忆优先、被占才换，M3.1）')
  assert.match(index, /loadJar/, 'cookie 罐按端口回灌（跨启动会话，M3.1）')
  assert.match(index, /scheduleJarSave/, '罐去抖落盘 userData（0600）')
  assert.match(index, /splash:recover-disable-plugins/, '恢复入口接线（禁用第三方插件后重启）')
  assert.match(index, /writeCrashReport/, '失败态先落崩溃报告再报给启动页（M3.3）')
})

test('品牌面：Dock 图标 / 中文菜单 / 系统托盘接线', async () => {
  for (const rel of [
    'branding/logo/qilin.svg',
    'branding/logo/qilin-tray.svg',
    'branding/icons/qilin.icns',
    'branding/icons/qilin-512.png',
    'branding/icons/tray-Template.png',
    'branding/icons/tray-Template@2x.png',
    'scripts/gen-icons.mjs',
  ]) {
    await assert.doesNotReject(access(new URL(`../${rel}`, import.meta.url)), undefined, rel)
  }
  const index = await readFile(new URL('../desktop/main/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /app\.dock\?\.setIcon/, 'dev 期 Dock 图标（打包后由 .icns 提供）')
  assert.match(index, /installAppMenu/, '中文应用菜单挂载')
  assert.match(index, /tray-Template\.png/, '系统托盘挂载（QL template 图）')
  const menu = await readFile(new URL('../desktop/main/menu.mjs', import.meta.url), 'utf8')
  assert.match(menu, /setApplicationMenu/, 'Electron 默认英文菜单被接管')
  assert.match(menu, /关于 QiLin Desktop/, '关于项中文化（动作走壳自绘面板）')
  assert.match(menu, /退出 QiLin Desktop/, '退出项中文化')
  assert.match(menu, /role: 'toggleDevTools'/, '开发者工具仅 dev 菜单提供（打包后 boot 闸不被破坏）')
  assert.match(menu, /isPackaged === false/, 'dev 专属项按发布形态收紧')
  const gen = await readFile(new URL('../scripts/gen-icons.mjs', import.meta.url), 'utf8')
  assert.match(gen, /iconutil/, 'icns 由 macOS 自带 iconutil 合成')
  assert.match(gen, /offscreen: true/, '渲染走 offscreen 截图（矢量按目标像素栅格化）')
})

test('托盘「检查更新」常驻 + 壳自绘关于面板（麒麟印章）', async () => {
  const index = await readFile(new URL('../desktop/main/index.mjs', import.meta.url), 'utf8')
  assert.match(index, /\{ label: '检查更新…', click: \(\) => \{ void checkForUpdates\(checkNow\) \} \}/, '托盘出「检查更新」项')
  assert.doesNotMatch(index, /items\.push\(\{ type: 'separator' \}, \{ label: '检查更新…'/, '检查更新项不再条件插入（dev 真机反馈：菜单里没有这一项）')
  assert.match(index, /async function checkForUpdates\(checkNow\)/, 'dev（checkNow 为 null）也有可点的处理')
  assert.match(index, /当前形态不提供自动更新/, 'dev 态弹框说明，而不是点了没反应')
  assert.match(index, /installAppMenu\(\{ showAbout: showAboutWindow \}\)/, '应用菜单关于项走壳自绘面板')
  assert.match(
    index,
    /installTray\(\{ checkNow: updater\?\.checkNow \?\? null, showAbout: showAboutWindow \}\)/,
    '托盘关于项同样走壳自绘面板',
  )

  const menu = await readFile(new URL('../desktop/main/menu.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(menu, /role: 'about'/, '不再用原生 About 面板（图标取自 .app bundle，运行时换不成印章）')
  assert.doesNotMatch(menu, /setAboutPanelOptions/, '原生面板配置随面板一起退役')
  assert.match(menu, /export function installAppMenu\(\{ showAbout \}\)/, '关于动作由壳注入')
  assert.match(menu, /\{ label: '关于 QiLin Desktop', click: \(\) => \{ showAbout\(\) \} \}/, '关于项文案与动作')

  const windows = await readFile(new URL('../desktop/main/windows.mjs', import.meta.url), 'utf8')
  assert.match(windows, /export function showAboutWindow\(\)/, '关于面板归窗口层')
  assert.match(windows, /\.\.\/renderer\/about\.html/, '面板内容为壳自绘页面')
  assert.match(windows, /branding\/icons\/qilin-512\.png/, '印章取品牌图标（dev 与打包态同路径）')
  assert.match(windows, /okAboutPaint/, '印章 data URL 经页面注入点落位')
  assert.match(windows, /win\.on\('blur'/, '焦点离开即收起（原生面板同款手感）')

  const about = await readFile(new URL('../desktop/renderer/about.html', import.meta.url), 'utf8')
  assert.match(about, /id="seal"/, '印章位')
  assert.match(about, /window\.okAboutPaint/, '注入点')
  assert.match(about, /Content-Security-Policy/, '本地资源页带 CSP')
})

test('设置页让位补丁（覆盖层 inset + 返回键让开红绿灯）已注册且命中上游锚点', async () => {
  const registry = JSON.parse(await readFile(new URL('../patches/registry.json', import.meta.url), 'utf8'))
  assert.ok(
    registry.patches.some((entry) => entry.patch === 'patches/desktop-titlebar-inset.patch'),
    'registry 必须列出 inset 补丁（否则 checkout 不带此修复）',
  )
  const patch = await readFile(new URL('../patches/desktop-titlebar-inset.patch', import.meta.url), 'utf8')
  assert.match(patch, /SettingsRoot\.module\.css/, '命中设置页壳样式')
  assert.match(patch, /landing\.css/, '命中 landing 页 site-header（logo/标签/主题切换）')
  assert.doesNotMatch(patch, /auth\.css/, '注册登录页保持纯 web 观感（无痕覆盖不压内容、不让位）')
  assert.match(patch, /top: var\(--ok-tb-h, 0px\)/, 'fixed 覆盖层让出标题栏；纯 web 回落 0')
  assert.match(
    patch,
    /:global\(html\[data-platform='darwin'\]\) \.navBack \{\n\+  margin-top: 10px;/,
    'darwin 下返回工作区再下移 10px（红绿灯灯带与轨道顶齐平时贴得过紧）；:global 让纯 web 不受影响',
  )
})

test('侧栏补丁：darwin 宽栏「新会话」hover 不再压暗（registry 已登记）', async () => {
  const registry = JSON.parse(await readFile(new URL('../patches/registry.json', import.meta.url), 'utf8'))
  assert.ok(
    registry.patches.some((entry) => entry.patch === 'patches/desktop-sidebar-sections.patch'),
    'registry 必须列出侧栏补丁（否则 checkout 不带侧栏分区/固定兜底条/本次 hover 修复）',
  )
  const patch = await readFile(new URL('../patches/desktop-sidebar-sections.patch', import.meta.url), 'utf8')
  assert.match(
    patch,
    /:global\(\[data-platform='darwin'\]\) \.newSession:hover \{\n-  background: color-mix\(in srgb, var\(--qilin-alias-button-floating-hover\) 75%, transparent\);\n\+  background: color-mix\(in srgb, var\(--qilin-alias-button-elevated-fill\) 75%, transparent\);/,
    'darwin hover 底色从 floating-hover 换成与默认同值的 elevated-fill（宽栏 hover 不再比默认暗一档）',
  )
  assert.match(
    patch,
    /:global\(html\[data-platform='darwin'\]\) \.newSession:hover \.newSessionLabel \{\n\+  mask-image: none;/,
    'darwin hover 不再给标签打 mask（上游 mask 会把居中标签的末字右缘吃掉——真机反馈的「话」字发灰）',
  )
  assert.match(
    patch,
    /:global\(html\[data-platform='darwin'\]\) \.root:not\(\.collapsed\) \.newSessionLabel \{\n\+  max-width: min\(200px, calc\(100% - 88px\)\);/,
    'darwin 用宽度上限替代 mask：长标签最远停在右侧快捷键左 8px，不再压 ⌘N',
  )
})

test('上游锁锚定 QiLin 3.1.3（@qilin-agent 改名后的首个版本线）', async () => {
  const lock = JSON.parse(await readFile(new URL('../upstream/qilin.lock.json', import.meta.url), 'utf8'))
  assert.equal(lock.qilinVersion, '3.1.3')
  assert.equal(lock.qilinCommit, 'd61554c8a23415b91065d23df1a4552adfb32f20', 'v3.1.3 tag 的本体 commit（锁不钉 tag 对象）')
  assert.equal(lock.qilinRepository, 'https://github.com/kkutysllb/QiLin.git', '独立线后上游即 QiLin 仓本身')
  assert.match(lock.qilinCommit, /^[0-9a-f]{40}$/)
})

/* ---------- dev 脚本（自备 Electron） ---------- */

test('dev 脚本自备 Electron（上游 apps/desktop 已移除）', async () => {
  const dev = await readFile(new URL('../scripts/dev.mjs', import.meta.url), 'utf8')
  assert.match(dev, /electron-tool/, 'Electron 自备（上游 apps/desktop 已移除）')
  assert.match(dev, /profile-boot\.js/, '构建物完整性检查锚定宿主 boot 模块')
  assert.doesNotMatch(dev, /ensureBuiltinTerminal/, '内置终端插件已退役，不再物化')
})
