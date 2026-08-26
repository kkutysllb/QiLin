# QiLin Web Demo 验收清单

> 分支 `feat/web-demo-kworks-aligned` · 生成日期 2026-08-26 · 依据实测证据（Playwright 浏览器验证 + smoke 脚本 + curl）
>
> 设计文档：`docs/superpowers/specs/2026-08-26-web-demo-kworks-aligned-design.md`
> 实施计划：`plans/2026-08-26-web-demo-kworks-aligned.md`

## 1. 基础设施

| # | 项目 | 结果 | 证据 |
|---|---|---|---|
| 1.1 | gateway 直连健康检查 `:28081/health` | ✅ | `{"status":"healthy","service":"qilin-gateway"}` |
| 1.2 | 同源代理 `:28080/health` | ✅ | 200，经 server.js → gateway |
| 1.3 | SSE 代理不缓冲 | ✅ | smoke 实测首字节 19-135ms（阈值 500ms） |
| 1.4 | 端口隔离（不碰 KWorks 19987/18569） | ✅ | 全部脚本只检测不杀进程；端口 28080/28081 |
| 1.5 | 数据隔离（`.qilin/` vs `~/.kworks/`） | ✅ | QILIN_HOME 默认仓库内 `.qilin/` |
| 1.6 | `pnpm smoke` 全绿 | ✅ | PASS（登录分支复跑通过） |

## 2. 认证与初始化

| # | 项目 | 结果 | 证据 |
|---|---|---|---|
| 2.1 | 未登录访问 /workspace 重定向 /login | ✅ | 401 → `/login?next=%2Fworkspace` |
| 2.2 | 邮箱密码登录（form-encoded） | ✅ | 登录成功跳转 `/workspace/chats/new` |
| 2.3 | 首次初始化向导（initialize） | ✅ | smoke 走 initialize 分支建号成功 |
| 2.4 | 登出 / 用户菜单 | ✅ | 菜单含 设置 / 退出登录 |

## 3. 聊天核心闭环

| # | 项目 | 结果 | 证据 |
|---|---|---|---|
| 3.1 | 流式逐字回复 | ✅ | 真实模型回复渲染（MiniMax-M3） |
| 3.2 | 思考过程折叠（已思考） | ✅ | 折叠卡片可展开 |
| 3.3 | 工具调用卡片（中文标签、折叠） | ✅ | "2 个工具调用 写入文件、执行命令" |
| 3.4 | 文件写入工具闭环 | ✅ | demo.html 生成，路径 `/mnt/user-data/outputs/demo.html` |
| 3.5 | 交付物预览（HTML iframe） | ✅ | 面板含文件名/全屏预览/收起 + iframe 实时渲染 |
| 3.6 | 代码块 Download/Copy | ✅ | 按钮存在可用 |
| 3.7 | 消息操作（复制/编辑/重新生成） | ✅ | 用户与 assistant 消息均带操作按钮 |
| 3.8 | Token 统计（输入/输出/缓存命中） | ✅ | 输入 18.9K · 输出 1,080 · 命中 34% |
| 3.9 | 会话标题自动生成 | ✅ | "用一句话介绍你自己" 自动命名 |
| 3.10 | 历史侧边栏分组（近三天/本周/本月/更早） | ✅ | 4 条会话按时间分组+计数 |

## 4. 全量页面

| # | 项目 | 结果 | 证据 |
|---|---|---|---|
| 4.1 | 落地页 `/` | ✅ | hero + 4 特性卡 + footer（品牌 QiLin） |
| 4.2 | 新会话页 `/workspace/chats/new` | ✅ | 欢迎语 + 输入框 + 推理深度/模型选择 |
| 4.3 | 自动化 `/workspace/crons` | ✅ | 空态 + 添加任务 |
| 4.4 | MCP 管理 `/workspace/mcp` | ✅ | 空态 + 添加 + 常用服务器推荐 |
| 4.5 | token-usage 路由 | ✅ | 上游即 redirect 占位 → /workspace |
| 4.6 | agents 列表页 | ✅ | 上游无此路由（仅 [agent_name]/chats 动态路由），404 与上游一致 |
| 4.7 | 设置·常规（账户/外观/系统） | ✅ | 修改密码/主题/语言/日志级别/调度器开关 |
| 4.8 | 设置·模型 | ✅ | M3 卡片（思考/视觉标记）+ 供应商模板 |
| 4.9 | 设置·Token 统计与预算 | ✅ | 真实数据（57.4K/2.3K/61.3% 命中）+ 图表 |
| 4.10 | 设置·全部 12 菜单 | ✅ | 个人/智能体/工具与数据/引擎 四组全渲染 |
| 4.11 | i18n 中英切换 | ✅ | 设置语言切 English 全 UI 生效，可切回 |
| 4.12 | console 错误 | ✅ | 0 errors（4 条 recharts 隐藏容器尺寸 warning，无功能影响） |

## 5. 品牌（M4）

| # | 项目 | 结果 | 证据 |
|---|---|---|---|
| 5.1 | 展示文案 KWorks→QiLin | ✅ | 89 文件替换，src 残留 0 |
| 5.2 | favicon 绿色渐变+「麒」 | ✅ | public/favicon.svg 全量替换 |
| 5.3 | 主色 QiLin 绿（亮/暗） | ✅ | --primary/--ring oklch 值 |
| 5.4 | 页面标题 | ✅ | `<title>QiLin</title>` |
| 5.5 | 分享链接用当前 origin | ✅ | 移除 kworks.com 硬编码（086a40b） |
| 5.6 | 内部标识符保留 | ✅ | kworksDesktop bridge / storage key / sandbox provider id（刻意保留，见 README 差异表） |

## 6. 工程质量

| # | 项目 | 结果 | 证据 |
|---|---|---|---|
| 6.1 | typecheck | ✅ | 0 error |
| 6.2 | vitest 回归 | ✅ | 257 过 / 1 败 = 基线（thread-stream-cache worker OOM，移植前即存在） |
| 6.3 | shell 语法 | ✅ | bash -n 通过 |
| 6.4 | server.js 健壮性 | ✅ | 端口校验/升级 socket 销毁/语义状态码（504/502） |
| 6.5 | Next 缓存损坏恢复 | ✅ | 清 .next 冷重启即恢复（已记录 README 排障） |

## 7. 未验收 / 已知限制（与上游一致或环境约束）

- 交付物预览抽查了 HTML；XLSX/DOCX/PPTX/PDF 预览路径未逐一实测（上游组件未改动）
- browser_* 工具组未启用（QiLin 主仓未装 playwright extra，README 已记录启用方法）
- 澄清卡 / 危险工具审批门 UI 未触发实测（需要特定工具调用场景）
- KWorks 桌面应用并行运行验证：端口/数据隔离为设计保证 + 脚本约束，未做双开实测
