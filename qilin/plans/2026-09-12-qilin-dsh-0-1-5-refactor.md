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
- [x] 推送已完成提交到 origin/main（8d55202）
- [x] 创建并推送 3.0.0 分支
- [x] 完成调研与设计规格，获用户批准
- [x] S0：dsh 源码入树（3083f37c3f）、qilin profile 与 bundle、dsh qilin 启动别名
- [x] S1：确认 3.0.0 树无虚拟路径机制
- [x] S2 第一步：QiLin 品牌配色插件与客户端构建画像，浏览器验收通过
- [ ] S2 其余：QiLin 品牌美术字与 dsh 文案替换
- [ ] S3 渠道 TS 重写（8 个渠道）
- [ ] S4 产品能力迁移
- [ ] S5 收尾与主分支切换

## 进展记录
### 调研与决策
- 三个只读调研代理完成核心引擎、前端四区、物理路径对照，结论已汇总进设计规格。
- 关键事实：dsh 无 /mnt/user-data 虚拟路径层，该机制为 QiLin 独有；dsh 渠道能力仅通用 webhook 与 GitHub 适配器。

### 分支与基线
- main 推送至 8d55202；3.0.0 创建并推送。
- dsh 源码入树提交 3083f37c3f：1288 项删除、10168 项新增；2.x 代码在 main 与 2.0.0 保留。

### S0 骨架
- packages/bundle/qilin-web（@deepseek-ai/dsh-qilin-web）重述 system-prompt 的 QiLin 产品身份。
- packages/boot/app-boot/src/profile.ts 新增 qilin 模板（dsh-base + dsh-web-app + dsh-qilin-web）。
- apps/cli 新增 qilin 子命令，等效 --profile qilin；dsh web 仍绑定 web profile。

### S1 物理路径
- 3.0.0 树中 /mnt/user-data 只出现在 QiLin 文档与本阶段记录；virtual_path 只出现在设计规格。
- 代码层由 dsh 的物理路径模型承担：session cwd 解析、fs-sandbox 规范化围栏、typed FsTarget 与内容寻址附件。

### S2 品牌配色与构建画像
- 新增 packages/client/ui-theme-qilin（@deepseek-ai/dsh-client-ui-theme-qilin）：以 ctx.theme.overrideTokens 叠加一个品牌令牌层。
- qilin-web bundle 插入 ui-theme-qilin 行，并把该包声明为依赖。
- scripts/client-build-environment.ts 新增 qilin 客户端构建画像（DSH_CLIENT_TITLE 为 QiLin），package.json 新增 build:qilin。

## 验证证据
- typecheck 通过；args.spec 7 项、theme 插件规格 4 项、client-build-environment 规格 8 项、profile 相关 59 项全部通过。
- 门禁：verify-package-paths、verify-md-links、verify-md-wrap、verify-package-readme-limitations、verify-subsystem-pages、verify-package-dependencies、verify-client-packages 全部通过。
- 构建：pnpm run build 记录 234 到 236 个客户端产物；pnpm run build:qilin 记录 4 个公开值（含 QiLin 标题）。
- 浏览器验收（Chromium，http://127.0.0.1:3083）：document.title 为 QiLin；--dsw-alias-brand-primary 为 #0b7a5a；--dsw-specific-sidebar-fill 为 #f1f7f4。
- 截图证据：qilin/acceptance/2026-09-12-s0-qilin-surface.png。

## 未决与下一步
- 品牌美术字：品牌槽位 owner props 不含本地化席位，QiLin 字标需要真实 SVG 设计稿。
- 仍为 dsh 文案的位置：侧边栏品牌行为 DSH 本地构建、首页为探索未至之境、首启内测声明。
- 启动日志仍打印 dsh web: 前缀，需改为 QiLin 产品前缀。
- 主题插件尚未建立组件级真实组合覆盖（已在包 README 的 Known Limitations 中声明）。
- 包命名：QiLin 产品包暂时沿用 @deepseek-ai/dsh-* 以满足门禁。
- 本地验证需把 DSH_HOME 指向工作区内。
