# QiLin 3.1.12 发布说明（草稿）

日期：2026-11-14
状态：草稿（待发布窗口确认；共覆盖 87 个未推送提交）
版本：`3.1.12`（patch：不改变对外骨架，只落功能、修复与文档）

> 本稿只描述 QiLin 自身的变更。发布前需要：确认版本号 → `pnpm run build` → 打 tag → `gh release create <tag> --notes-file <本文件去草稿头>` → `pnpm run release:verify-published`。

## 一、会话格式：V7 → V8

- 新增 V7 格式代：Team 模式成为持久事实（`team/mode`），`turn/retry` 作为用户重试的控制输入写入日志。
- 新增 V8 格式代：编码模式预置标签由 `ptc` 迁移为 `coding`，`agent-preset/selected` 同步改写；用户自建预置 id 原样保留。
- 新增 `session-format-v7-to-v8` 边界包：codec 沿用 V7 物理分帧、V8 全量校验、迁移把存储标签改写为 `coding`。
- 归档 V7 持久化引用（`v7.md` / `v7.zh.md` / `v7.schema.json`），声明块与 67 个 root 摘要一致；V7 没有独立发布，只存在于引入 V8 的发布中。
- **升级注意**：格式只前进不回落；旧版客户端读取 V8 会话会拒绝，不是降级兼容。

## 二、编码模式改名（ptc → coding）

- 预置 id `ptc` → `coding`，旧 id 保留**只读别名**（已存会话与画像默认值仍可解析）；预置名称「编码模式」。
- 运行层包改名：`@qilin-agent/coding-runtime`、`coding-runtime-node`、`workflow-coding`、`experimental-coding-runtime-python`；目录同名迁移。
- 服务名 `ctx.ptcRuntime` → `ctx.codingRuntime`；工具呈现取值 `mode: 'native' | 'coding'`，`QILIN_TOOLS_MODE` 只接受 `native`/`coding`，headless 默认 `coding`。
- 残留词汇收口：`CodingRuntime`/`CodingRunRequest`/`CodingRunResult` 等类型名、`tools/src/coding.ts`、README 与子系统文档措辞；演示脚本 `demo:ptc` → `demo:coding`。
- **保留**：持久化事件类型 `tool/ptc-dispatch*` 与扩展点 `tools/ptc-dispatch-log`（属格式/扩展词汇，改名需要再进位一次会话格式）；`.agents/notes/**` 历史记录正文与文件名（只更新了指向已移动文件的链接）。

## 三、编码模式主线（工作树、终端、聊天）

- 工作树：新增「移除工作树」动作与二次确认，`removeWorktree` Remote 把会话移回源仓库，`worktree` 服务新增 `remove` 动词。
- 变更视图：新增「本次提交」与「上一轮」范围（Host 推导，投影优先），补无轮次隐藏与空集合文案。
- 未打开会话的行内工作树事实：新增 24 网格图标 `IconBranchQuestion`（分支带问号）标记未知工作树，补「打开后可见」文案与悬停说明。
- LFS 与过滤器：变更标记 LFS 指针与过滤器内容，并补悬停说明。
- 终端：分块加载失败时原位提示并支持重新加载（不再整块空白）。
- 输入框 hold：等待工作树就绪时在输入框上方写明等待原因。
- 聊天：向上滚动接近顶部自动加载更早历史；输出上限截断的轮次提供「继续生成」；轮次运行期间的重试排队，会话落定后自动重跑。

## 四、侧栏与工作区归类

- 侧栏项目按「编码项目 / 普通项目」两个分区归类（Git 仓库 vs 非 Git 目录），分区可折叠且状态持久化。
- 分区标题保持最次级字号（10px/500），项目名与工作区同为 14px，恢复三级层次；用真实文件系统服务固定目录分类的测试。
- 点文件与 `node_modules` 默认隐藏，文件树支持开关。

## 五、UI 刷新

- V0：落间距标尺、强调色与三档密度；修正标尺重复定义导致的布局放大。
- V1：聊天 / 会话 / 设置三面迁入 v1 令牌；新增 24 网格图标集并替换到三面。
- 响应式：修复抽屉模式下中栏被挤进 0 宽轨道导致的整页空白；会话头部 76px 几何复原，活动 tab 下划线回到分割线上沿；窄屏错误行改为代码标签换行。

## 六、子代理与 Agent Teams

- 子代理命名：命名域与目录 v3 事实、命名写入链路、委派工具命名参数与 `list_agents` 名称展示。
- `send_message` 与 `interrupt_agent` 支持按直接子级名称寻址；服务层按名解析直接子代理。
- Agent Teams 包迁入 `team/client` 组并改名；Web 预设默认关闭 `interrupt_agent` 并更新工具夹具。

## 七、通用办公（V6）

- 新增 `@qilin-agent/office-read`：进程内只读解析 DOCX/XLSX/PPTX（段落与标题层级、表格、工作表单元格、幻灯片文本），ZIP 读取带条目数/单条目/总字节/膨胀比上限并拒绝越界条目名；14 条测试含恶意包与上限用例。
- 新增 `@qilin-agent/tool-office-read`：模型工具 `office_read`（`file_path` / `format?` / `limit?`），经 `fs` 后端解析路径、`maxBytes` 限制、紧凑文本渲染；8 条单测 + 1 条 Loader 真实组合测试。
- 接入 `presets/coding` 与 `presets/standard`，`bundle/base` 与 `apps/cli` 补依赖；`office-read` 另提供 `readOfficeMetadata`（格式、段落数、表格数、工作表名与范围、幻灯片数）。
- **已知限制**：不读批注、修订、图表、嵌入对象、条件格式；不渲染页面；预览的转换缓存仍按文件身份，元数据作缓存键需要 Host↔Client 方法（本次未加）。

## 八、修复

- `boot`：迁移改名的 bundle 在 profile 加载时自动改写名字。
- `session-controller`：分叉标题递增跳过已用编号。
- `ui-goal`：中文区分「待继续」与「已暂停」。
- `ui-primitives`：Markdown 选区内公式复制为 TeX 源码；文件类型查表改用 `Map`，原型键不再误命中；Perl 裸匹配规则补丁，列表与表达式上下文不再整段染色。
- `engine`：补齐引擎契约并把消息标题字体默认改为黑体。

## 九、文档与门禁

- 新增计划与账本：UI 刷新与产品补强、V5 编码主线（切片、裁决、两轮审查）、编码模式改名（含运行层与包名映射）、V6 通用办公、本发布说明。
- V7 静态审计清零：`typecheck` 两套 face、`lint` 0/0（5430 文件）、`hygiene` 22/22、`duplication` 余量 0.07%（26 个既有克隆）；修掉改名后仍指向 `ptc` 的五处门禁脚本/清单（rescope 后置条件、`demo:coding` 启动器分类、新包 `files` 约束、`forge-bundle` 清单、`python/sdk-runtime` 依赖）。
- `test:docs` 21/21；`no-unknown-casts` 基线更新为 1499 条既有断言、无新增。

## 十、验证清单（发布前）

```sh
pnpm install
pnpm run build
npx tsc -b tsconfig.host.json && npx tsc -b tsconfig.client.json
pnpm run lint && pnpm run duplication && pnpm run hygiene
pnpm run test:docs
pnpm run test:gui
```

已知环境限制：本机会话沙箱禁止在 `$HOME` 下建临时目录，`coding-runtime`、`workflow-coding`、`tool-fs` 与 `client-ui-forge` 的沙箱用例会以 `EPERM` / `sandbox-exec: sandbox_apply` 失败；这是执行环境限制，不是回归。
