# QiLin 3.0.0 对齐 DSH 0.1.5-rc.2 重构

## Goal
在 3.0.0 分支上，把 QiLin 收敛到 DSH TypeScript 核心；重建前端四区；删除 /mnt/user-data 虚拟路径机制；删除 Python 引擎与渠道并以 TS Cordis 插件重写；验收通过后把 3.0.0 提升为主分支。

设计规格：qilin/specs/2026-09-12-qilin-3.0.0-dsh-core-migration-design.md

## 已确认决策
- 基线：dsh-v0.1.5-rc.2（提交 fb2c4b9e698e）。
- 仓库形态：dsh 源码整体并入 QiLin 仓库作为核心。
- 前端四区：沿用 dsh client 插件架构，按 dsh 实现重建 QiLin 品牌 UI。
- Python：全部删除，渠道 TS 重写。
- 主分支切换：S5 验收通过后再切换。

## 任务清单
- [x] S0：dsh 源码入树、qilin profile 与 bundle、dsh qilin 启动别名
- [x] S1：确认 3.0.0 树无虚拟路径机制
- [x] S2 配色与标题：品牌令牌层、qilin 客户端构建画像、启动前缀可配置、本地构建标识改为 QiLin
- [x] 四区单测验收：376 个文件、5342 项通过
- [x] 四区浏览器交互验收：侧边栏、输入框草稿、消息区空态、模型选择器
- [ ] S2 其余：品牌美术字、首页标语、首启声明（需要品牌输入）
- [ ] S3 渠道 TS 重写（8 个渠道）
- [ ] S4 产品能力迁移
- [ ] S5 收尾与主分支切换

## 进展记录
### 已完成的阶段
- main 推送至 8d55202；3.0.0 创建并推送；dsh 源码入树 3083f37c3f。
- packages/bundle/qilin-web 重述 system-prompt 与 web-runtime 行；apps/cli 新增 qilin 子命令。
- packages/client/ui-theme-qilin 叠加品牌令牌层；scripts/client-build-environment.ts 新增 qilin 客户端构建画像与 build:qilin。
- dsh-web-app 的启动前缀改为可配置 label（默认 dsh web），QiLin 画像取 qilin。
- 通用本地化字典的 brand.localBuild 与 apps/web 默认标题改为 QiLin 产品名。

## 验证证据
### 单测与门禁
- pnpm run test:gui 通过 376 个文件、5342 项（1 项跳过），覆盖侧边栏、输入框、消息渲染与交付物。
- pnpm run typecheck 0 错误；verify-client-packages、verify-package-dependencies、verify-package-paths、verify-md-links、verify-md-wrap、verify-package-readme-limitations、verify-subsystem-pages、verify-config-catalog、verify-doc-budgets 全部通过。

### 浏览器交互验收（dsh qilin，Chromium）
- 品牌：document.title 为 QiLin 本地构建；侧边栏品牌行为 QiLin 本地构建 与构建版本号。
- 配色：--dsw-alias-brand-primary 为 #0b7a5a；--dsw-specific-sidebar-fill 为 #f1f7f4。
- 侧边栏：工作区 QiLin Acceptance 与其中的新会话行可见，设置入口在底部。
- 输入框：Lexical contenteditable 接受草稿文本，草稿渲染为 四区验收：输入框草稿；模型选择器显示 DeepSeek-V41-Flash High。
- 消息区：会话空态与 hero 渲染，无历史消息时显示标语。
- 交付物：本机无 API Key，无法完成一次真实 turn，因此未产生 produced files，交付物行的正向验证待补充。
- 启动行：qilin: <url>。
- 截图：qilin/acceptance/2026-09-12-four-areas-qilin.png 与 qilin/acceptance/2026-09-12-s0-qilin-surface.png。

### 首启门禁的实测说明
- 全新 Harness home 上，首启声明弹窗会挡住输入框，需先点继续；随后出现的 API Key 引导可点稍后配置跳过。
- 端到端测试脚手架以程序方式预先确认该声明，因此它不是回放用例普遍失败的原因。

## 已知环境限制：浏览器回放验收无法在本机完成
- 现象：DSH_SNAPSHOT=replay pnpm run test:web:built 得到 12 个文件、31 项失败；这些用例经 dsh 的 bash 工具驱动，工具卡片始终不出现。
- 根因：本机外层沙箱阻止 dsh 内部的 macOS Seatbelt 沙箱。用例内的真实报错为
  `sandbox mode "workspace-write" is requested but no sandbox backend is usable on this host; refusing to run the command unconfined. Runner failure: sandbox-exec: sandbox_apply: Operation not permitted`。
- 归因证据：在原始基线提交 3083f37c3f 的独立 worktree 上复跑同一用例，失败数完全一致（3 失败 / 5 通过），与重构无关。
- 复现基线对比的方法：git worktree add .worktrees/baseline 3083f37c3f，随后在该 worktree 执行 pnpm install --frozen-lockfile 与 pnpm run build。

## 待用户输入
- QiLin 品牌美术字（侧边栏与 hero 品牌槽位需要 SVG 字标；槽位 props 不含本地化席位）。
- QiLin 首页标语与首启声明文案（现为探索未至之境与内测声明）。
- 是否以更宽的主机权限重跑浏览器回放验收，以覆盖 dsh 内部沙箱依赖的用例。
