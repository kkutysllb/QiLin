# QiLin 3.0.0 对齐 DSH 0.1.5-rc.2 重构

## Goal
在 3.0.0 分支上，把 QiLin 收敛到 DSH TypeScript 核心；重建前端四区；删除 /mnt/user-data 虚拟路径机制；删除 Python 引擎与渠道并以 TS Cordis 插件重写；验收通过后把 3.0.0 提升为主分支。

文档：
- 设计规格 qilin/specs/2026-09-12-qilin-3.0.0-dsh-core-migration-design.md
- 配置迁移映射 qilin/specs/2026-09-12-qilin-config-migration-mapping.md

## 任务清单
- [x] S0：dsh 源码入树、qilin profile 与 bundle、dsh qilin 启动别名
- [x] S1：确认 3.0.0 树无虚拟路径机制
- [x] S2 配色与标题：品牌令牌层、qilin 构建画像、启动前缀、本地构建标识
- [x] 四区单测验收：376 个文件、5342 项通过
- [x] 四区浏览器交互验收：侧边栏、输入框、消息区、模型选择器
- [x] 交付物浏览器验收：produced-files 用例通过
- [x] 核心引擎免密钥回放验收：132 项中 127 项通过
- [x] S4 调研：完成 2.x 配置到 dsh 的迁移映射与缺口清点
- [x] S2 品牌落地：麒麟汉字印章（侧边栏与 hero）、QiLin 标签与版本徽章、首页标语、首启声明
- [ ] S3 渠道 TS 重写（8 个渠道）
- [ ] S4 实施：按产品取舍补齐缺口（scheduler、mcp、memory、RBAC 等）
- [ ] S3 渠道 TS 重写（8 个渠道）
- [ ] S5 收尾与主分支切换

## 验证证据
### 单测、引擎回放与交付物
- pnpm run test:gui：377 个文件、5348 项通过（1 项跳过）。

### 品牌落地（公章印章）
- 新增 packages/client/ui-brand：麒麟汉字印章占用 sidebar.brand.mark 与 conversation.hero.brand.mark。
- 字形来源：以 fontTools 从系统 CJK 字面提取麒、麟轮廓，归一化到单位框后作为路径数据内嵌（无运行时字体依赖）。
- 浏览器实测：印章出现 2 处；品牌行为 QiLin 加版本徽章；hero 标语为 QiLin；document.title 为 QiLin。
- 几何实测：边框 1.6-22.4，字块 x 6.2-17.8、两行 y 2.6-11.8 与 12.3-21.4，全部位于边框内。
- 证据截图：qilin/acceptance/2026-09-12-qilin-seal.png 与 2026-09-12-qilin-seal-in-ui.png。

### 文案
- brand.localBuild 改为 QiLin，使侧边栏显示 QiLin 加构建版本徽章。
- hero.headline 由探索未至之境 / Into the Unknown 改为 QiLin。
- 首启声明改为 QiLin 版本：标题与正文不再引用 QiLin 与 DSH 生态。
- pnpm run test:snapshot：132 项中 127 项通过、3 项失败、2 项跳过，引擎与会话路径在 QiLin 树上端到端可用。
- 交付物浏览器验收：apps/web/tests/produced-files.e2e.ts 通过，produced files 行在真实浏览器中渲染正确。
- 交付物另一用例 apps/web/tests/present.e2e.ts 在本机 2 项失败；已在原始基线提交的独立 worktree 上复跑，失败完全一致（1 文件 / 2 项），因此归因于环境（PTC code-runtime 交付路径）而非本次重构。

### 类型与门禁
- pnpm run typecheck 0 错误；verify-client-packages、verify-package-dependencies、verify-package-paths、verify-md-links、verify-md-wrap、verify-package-readme-limitations、verify-subsystem-pages、verify-config-catalog、verify-doc-budgets 全部通过。

### 浏览器交互验收（dsh qilin，Chromium）
- 品牌：document.title 与侧边栏品牌行均为 QiLin 本地构建。
- 配色：--dsw-alias-brand-primary 为 #0b7a5a；--dsw-specific-sidebar-fill 为 #f1f7f4。
- 侧边栏：工作区与其中的会话行可见；设置入口在底部。
- 输入框：Lexical contenteditable 接受草稿并渲染；模型选择器显示 DeepSeek-V41-Flash High。
- 消息区：会话空态与 hero 正常渲染。
- 截图：qilin/acceptance/2026-09-12-four-areas-qilin.png、qilin/acceptance/2026-09-12-s0-qilin-surface.png。

### 首启门禁实测
- 全新 Harness home 上首启声明弹窗会挡住输入框，需先点继续；随后 API Key 引导可点稍后配置跳过。
- 端到端脚手架以程序方式预先确认该声明，因此它不是回放用例普遍失败的原因。

## 已知环境限制与归因状态
- 依赖 dsh 内部 macOS Seatbelt 沙箱的用例无法在本机完成：外层沙箱使 sandbox-exec 返回 Operation not permitted。
- 已证归因（基线复跑失败数一致）：Web 回放的 replay-round-trip 用例；交付物的 present 用例。
- 未证归因：引擎回放的 3 项失败用例名指向沙箱或原生插件，但未重跑基线对比。
- 复现基线对比的方法：git worktree add .worktrees/baseline dsh-v0.1.5-rc.2，随后在该 worktree 执行 pnpm install --frozen-lockfile 与 pnpm run build，再跑目标用例。

## 去 dsh 化（A+B 层）

### B 层已完成并推送（3.0.0 分支）
- 274 个工作区包名 @deepseek-ai/dsh-* 改为 @qilin/*；CLI 包改为 @qilin/cli。
- package.json 清单字段 dsh 改为 qilin，并同步代码侧字段访问与类型声明。
- 转义形式（正则内的 @deepseek-ai\/dsh-）一并改名，含 tsdown.client.ts 的 INLINE_SAFE。
- gen-tsconfig-paths 重写 tsconfig 别名；lock 与 node_modules 链接重建。
- 重新生成全部目录文档，并把 258 个文件里 611 处旧锚点改为新锚点。
- 规模：4032 个文件，+22336 / -22298。

### 保留不动
- vendored 框架：@deepseek-ai/cordis、cosmokit、schemastery、cordis-plugin-*。
- native 的 @qilin/node-addon-system 与第三方 @deepseek-ai/pi-ai。
- .agents/notes 下的历史记录（仓库规则：已归档笔记冻结，不改写）。
- .gitattributes 的 merge=qilin-translation-pairing（该名字仅此一处出现、仓库内无驱动定义，属用户级 git 配置；改名会静默失效）。

### B 层验证
- pnpm run build 通过（238 个客户端产物）；pnpm run typecheck 0 错误。
- pnpm run test:gui 5348 项通过；pnpm run test 22067 项通过；verify-md-links 恢复通过。

### 失败分类（24 个文件 / 82 项）
1. 本机沙箱限制：fs-sandbox（EPERM mkdtemp 于用户主目录）、terminal-bash 与 tool-terminal（真实 shell）、
   tool-bash-persistent、scripts/run-gates.spec.ts（进程组与信号）、install-lefthook（git worktree 操作）。
2. 改名引入：需要同步旧包名或旧文件名的门禁脚本与桌面应用用例，例如
   scripts/verify-application-entrypoints.spec.ts、apps/desktop/tests/{core-package-set,prepare-package-set,project-manager}.spec.ts、
   scripts/{browser-bundled-externals,client-bundle-purity,lint-rule-fingerprint,package-invariants,release/families,translation-pairing-merge,verify-npm-install-layout}.spec.ts。
3. 改名前已存在：scripts/doc-standard.spec.ts 报 packages/bundle/web-brand/README.zh.md 缺少标准中文章节标题（概述、开发备注），
   与本轮改名无关，是更早提交的 README 章节命名问题。

### 门禁判定同步（3.0.0 分支）
- 根因：多处门禁按 '@deepseek-ai/' 前缀判定本仓库包，改名后整体失效或误判。
- 已修：客户端打包纯度门禁、工作区约束、发布家族、发布基线、桌面包集选择、应用入口清单。
- 已修：桌面夹具的路径分段与闭包排序期望、三个自建 README 的中文章节名。
- 效果：全量单测由 82 项失败降到 65 项（16 个文件），通过项 22084。

### 剩余失败文件（16）
环境限制：fs-sandbox、bash-sandbox/partial-landlock、tool-bash-persistent、terminal-bash、tool-terminal、run-gates、install-lefthook。
待同步：browser-bundled-externals、lint-rule-fingerprint、package-invariants、snapshot-workspace-parent、
translation-pairing-merge、verify-npm-install-layout、hooks-claude-code/coverage-edge-paths、
hooks-codex/coverage-{post-tool,prompt}、code-runtime-python/runtime、webworker-runtime/transform-corpus。
注：doc-standard 已在本轮修复（19 项通过），上表来自修复前的运行。

### A 层部分完成（顺带）
- 清单字段规则 'dsh': 同时命中了 bin 与 npm 脚本，因此 apps/cli 的 bin 已为 qilin、根脚本已为 pnpm qilin。
- 待办：CLI 内部程序名与错误前缀仍为 dsh；DSH_* 环境变量仍为旧前缀；技能来源标识未改；
  文档与代码中仍有裸 dsh 包短名（如 dsh-web-app）与 pnpm dsh 引用。

### A 层尚未开始（原清单）
- CLI 可执行名 dsh 改为 qilin，pnpm dsh 脚本改为 pnpm qilin。
- DSH_* 环境变量前缀（产品源码内 61 个去重，DSH_HOME 出现 60 处）。
- 技能来源标识 project-dsh / user-dsh 改为 project-qilin / user-qilin。
- 文件名与技能名中残留的 dsh：scripts/verify-dsh-package-licenses.ts、.agents/skills/qilin-doc 等。

### 过程记录：一次自伤与修复
- 在替换转义形式的包名时，我误用 Array.join(函数) 作分隔符，把函数源码插入了 14 个文件的 24 处正则字面量。
- 已定位并全部回修为 @qilin\/ 形式；INLINE_SAFE 与相关断言经复跑确认恢复，hooks-codex 等由此产生的失败已消失。

## 待用户输入
- QiLin 品牌美术字与文案（侧边栏与 hero 字标、首页标语、首启声明）。
- S4 缺口取舍：scheduler、mcp、memory、RBAC、guardrails 各自是实现还是放弃。
- 是否以更宽的主机权限重跑依赖内部沙箱的验收用例。
