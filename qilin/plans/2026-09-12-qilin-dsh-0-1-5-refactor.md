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
- [x] S0 骨架：dsh 源码入树（3083f37c3f）
- [x] S0 骨架：qilin profile 与 qilin-web bundle，Web 表面启动验证通过
- [ ] S0 收尾：QiLin 启动别名、品牌插件骨架、门禁对齐
- [ ] S1 物理路径：确认无虚拟路径层并清理遗留描述
- [ ] S2 前端四区：QiLin 品牌与配色重建
- [ ] S3 渠道 TS 重写（8 个渠道）
- [ ] S4 产品能力迁移（config.yaml 语义、社区 provider、鉴权、token 预算、调度、skills、memory）
- [ ] S5 收尾与主分支切换

## 进展记录
### 调研与决策
- 三个只读调研代理分别完成核心引擎、前端四区、物理路径的对照，结论已汇总进设计规格。
- 关键事实：dsh 无 /mnt/user-data 虚拟路径层，该机制为 QiLin 独有；dsh 渠道能力仅通用 webhook 与 GitHub 适配器。
- 规模：QiLin Python 约 14 万行 / 587 文件；web-demo 约 4.95 万行 / 334 文件；dsh 2793 个 TS 文件、962 个 spec。

### 分支与基线
- main 推送至 8d55202（含此前未提交的流式渲染与任务中断修复；验证：typecheck 通过、72 文件 406 用例通过）。
- 3.0.0 创建并推送，跟踪 origin/3.0.0。
- dsh 源码入树提交 3083f37c3f：1288 项删除、10168 项新增；2.x 代码在 main 与 2.0.0 保留。

### S0 骨架
- pnpm install 通过；pnpm run build 通过（记录 234 个客户端产物）。
- 新增 packages/bundle/qilin-web（@deepseek-ai/dsh-qilin-web）：补丁重述 system-prompt 的 QiLin 产品身份。
- packages/boot/app-boot/src/profile.ts 新增 qilin 模板：dsh-base + dsh-web-app + dsh-qilin-web，patchReload 为 live。
- 接线：apps/cli 依赖、tsconfig.host.json 引用、tsconfig.base.json 路径映射。
- 验证：qilin-web 规格 1 项通过；profile.spec.ts 40 项与 profile-initialization.spec.ts 18 项全通过，共 59 项。
- 验证：dsh --profile qilin --dump-config 的 personaPrefix 为 You are QiLin；dsh --profile qilin --no-open --port 3081 在 127.0.0.1:3081 监听（401 为进程令牌保护）。

## 未决
- QiLin 字标需要真实设计稿：品牌槽位 owner props 不含本地化席位，官方做法为 SVG 美术字。
- 产品启动入口：dsh web 硬绑定 web profile，QiLin 需要自己的启动别名。
- 包命名：QiLin 产品包暂时沿用 @deepseek-ai/dsh-* 以满足门禁；如需 QiLin scope 可用 scripts/change-scope.ts 全仓改域。
- 本地验证需把 DSH_HOME 指向工作区内，默认 ~/.dsh 或 ~/.kcoder 在工作区外会被文件沙箱拒绝。
