# QiLin 3.0.0 对齐 DSH 0.1.5-rc.2 重构

## Goal
在 3.0.0 分支上，把 QiLin 收敛到 DSH TypeScript 核心；重建前端四区；删除 /mnt/user-data 虚拟路径机制；删除 Python 引擎与渠道并以 TS Cordis 插件重写；验收通过后把 3.0.0 提升为主分支。

文档：
- 设计规格 qilin/specs/2026-09-12-qilin-3.0.0-dsh-core-migration-design.md
- 配置迁移映射 qilin/specs/2026-09-12-qilin-config-migration-mapping.md

## 已确认决策
- 基线：dsh-v0.1.5-rc.2（提交 fb2c4b9e698e）。
- 仓库形态：dsh 源码整体并入 QiLin 仓库作为核心。
- 前端四区：沿用 dsh client 插件架构，按 dsh 实现重建 QiLin 品牌 UI。
- Python：全部删除，渠道 TS 重写。
- 主分支切换：S5 验收通过后再切换。

## 任务清单
- [x] S0：dsh 源码入树、qilin profile 与 bundle、dsh qilin 启动别名
- [x] S1：确认 3.0.0 树无虚拟路径机制
- [x] S2 配色与标题：品牌令牌层、qilin 构建画像、启动前缀、本地构建标识
- [x] 四区单测验收：376 个文件、5342 项通过
- [x] 四区浏览器交互验收：侧边栏、输入框、消息区、模型选择器 + 截图
- [x] 核心引擎免密钥回放验收：132 项中 127 项通过
- [x] S4 调研：完成 2.x 配置到 dsh 的迁移映射与缺口清点
- [ ] S2 其余：品牌美术字、首页标语、首启声明（需要品牌输入）
- [ ] S4 实施：按产品取舍补齐缺口（scheduler、mcp、memory、RBAC 等）
- [ ] S3 渠道 TS 重写（8 个渠道）
- [ ] S5 收尾与主分支切换

## 验证证据
### 单测与引擎回放
- pnpm run test:gui：376 个文件、5342 项通过（1 项跳过）。
- pnpm run test:snapshot：132 项中 127 项通过、3 项失败、2 项跳过；引擎、会话、工具、压缩等路径在 QiLin 树上端到端可用。
- 3 项失败的用例名分别是 replays bash-tool、replays persistent-tools、replays session-sandbox-root，均落在已知的沙箱/原生插件环境限制上；本轮未再跑基线对比，因此只作强指向而非已证归因。

### 类型与门禁
- pnpm run typecheck 0 错误；verify-client-packages、verify-package-dependencies、verify-package-paths、verify-md-links、verify-md-wrap、verify-package-readme-limitations、verify-subsystem-pages、verify-config-catalog、verify-doc-budgets 全部通过。

### 浏览器交互验收（dsh qilin，Chromium）
- 品牌：document.title 与侧边栏品牌行均为 QiLin 本地构建。
- 配色：--dsw-alias-brand-primary 为 #0b7a5a；--dsw-specific-sidebar-fill 为 #f1f7f4。
- 侧边栏：工作区与其中的会话行可见；设置入口在底部。
- 输入框：Lexical contenteditable 接受草稿并渲染；模型选择器显示 DeepSeek-V41-Flash High。
- 消息区：会话空态与 hero 正常渲染。
- 交付物：本机无 API Key，未完成真实 turn，produced files 与 present 行的正向验证仍待补充。
- 截图：qilin/acceptance/2026-09-12-four-areas-qilin.png、qilin/acceptance/2026-09-12-s0-qilin-surface.png。

### 首启门禁实测
- 全新 Harness home 上首启声明弹窗会挡住输入框，需先点继续；随后 API Key 引导可点稍后配置跳过。
- 端到端脚手架以程序方式预先确认该声明，因此它不是回放用例普遍失败的原因。

## 已知环境限制
- 依赖 dsh 内部 macOS Seatbelt 沙箱的用例无法在本机完成：外层沙箱使 sandbox-exec 返回 Operation not permitted。
- 已证归因（Web 回放）：在原始基线提交的独立 worktree 上复跑同一用例，失败数完全一致（3 失败 / 5 通过）。
- 未证归因（引擎回放）：3 项失败用例名均指向沙箱或原生插件，但本轮未重跑基线对比。
- 复现基线对比的方法：git worktree add .worktrees/baseline 3083f37c3f，随后在该 worktree 执行 pnpm install --frozen-lockfile 与 pnpm run build。

## 待用户输入
- QiLin 品牌美术字与文案（侧边栏与 hero 字标、首页标语、首启声明）。
- S4 缺口取舍：scheduler、mcp、memory、RBAC、guardrails 各自是实现还是放弃。
- 是否以更宽的主机权限重跑依赖内部沙箱的验收用例。
