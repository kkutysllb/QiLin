/** KSRW 桌面 welcome renderer（S1 放入引擎 desktop/renderer/）。
 *
 * 功能全部沿用引擎桌面 welcome：window.dshWelcome 暴露 logIn/register/skip，
 * 主进程通过 local-auth 调 accounts-local；本文件只负责 KSRW 的 UI 与错误文案。
 */
const api = window.dshWelcome
const $ = (id) => document.getElementById(id)
const form = $('form')
const user = $('user')
const email = $('email')
const password = $('password')
const confirm = $('confirm')
const errorBox = $('error')
const submit = $('submit')
const tabs = $('tabs')
const switchRow = $('switch')

const ERROR_MESSAGES = {
  'invalid-body': '请求格式不正确，请重试',
  'invalid-username': '用户名需 3–32 位，字母或数字开头，可含点、横线、下划线',
  'invalid-email': '邮箱格式不正确',
  'password-too-short': '密码至少 8 位',
  'username-taken': '该用户名已被注册',
  'email-taken': '该邮箱已被注册',
  'registration-closed': '当前版本未开放注册',
  'already-initialized': '已存在管理员账户，请直接登录',
  'invalid-credentials': '用户名、邮箱或密码不正确',
  'too-many-attempts': '尝试次数过多，请稍后再试',
  'invalid-authority': '请求来源异常，请重试',
}

let mode = 'login'
function showError(message) {
  errorBox.textContent = message
  errorBox.hidden = message === ''
}
function setBusy(busy) {
  submit.disabled = busy
  submit.textContent = busy ? '请稍候…' : labelOf()
}
function labelOf() {
  return mode === 'register' ? '注册并进入' : '登录'
}
function describe(reason) {
  return ERROR_MESSAGES[reason] ?? '操作失败，请检查输入后重试'
}
function applyMode(next) {
  mode = next
  const register = mode === 'register'
  $('eyebrow').textContent = register ? 'CREATE ACCOUNT' : 'WELCOME BACK'
  $('title').textContent = register ? '注册本地账户' : '登录 KSRW'
  $('subtitle').textContent = register ? '第一个账户是管理员；账户只保存在本机。' : '本地账户由内置麒麟引擎管理。'
  $('user-label').textContent = register ? '用户名' : '用户名或邮箱'
  email.parentElement.hidden = !register
  confirm.parentElement.hidden = !register
  password.autocomplete = register ? 'new-password' : 'current-password'
  for (const tab of tabs.querySelectorAll('.tab')) tab.classList.toggle('is-on', tab.dataset.mode === mode)
  switchRow.innerHTML = register
    ? '已有账户？<button type="button" class="link" id="to-login">去登录</button>'
    : '首次使用？<button type="button" class="link" id="to-register">创建管理员</button>'
  const link = $('to-login') || $('to-register')
  if (link) link.onclick = () => applyMode(register ? 'login' : 'register')
  showError('')
  submit.textContent = labelOf()
}
tabs.addEventListener('click', (event) => {
  const tab = event.target.closest('.tab')
  if (tab) applyMode(tab.dataset.mode === 'register' ? 'register' : 'login')
})
form.addEventListener('submit', async (event) => {
  event.preventDefault()
  showError('')
  const name = user.value.trim()
  const pass = password.value
  if (name === '') { showError('请输入用户名'); user.focus(); return }
  if (pass.length < 8) { showError('密码至少 8 位'); password.focus(); return }
  if (mode === 'register' && pass !== confirm.value) { showError('两次输入的密码不一致'); confirm.focus(); return }
  if (api === undefined) { showError('桌面认证通道不可用'); return }
  setBusy(true)
  try {
    const result = mode === 'register'
      ? await api.register(name, email.value.trim(), pass)
      : await api.logIn(name, pass)
    if (result && result.ok) {
      submit.textContent = '正在进入工作台…'
      await api.skip()
      return
    }
    const reason = result && result.reason
    if (reason === 'already-initialized') applyMode('login')
    showError(describe(reason))
  } catch {
    showError('认证失败，请稍后重试')
  } finally {
    setBusy(false)
  }
})
for (const input of [user, email, password, confirm]) input.addEventListener('input', () => showError(''))
applyMode('login')
