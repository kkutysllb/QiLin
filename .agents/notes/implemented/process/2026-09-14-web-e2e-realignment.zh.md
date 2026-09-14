# Agent Note: Kylin 改名后的 Web e2e 对齐

状态：已实施

[English](2026-09-14-web-e2e-realignment.md) | 中文

## 问题

Kylin 改名后第一次全量 `pnpm run test:web` 有三个套件失败，各有独立根因。`cordis-tool-round` 在场景中途卡住：测试仍在等改名前的文案（`The Cordis Plugin is running.`），而 replay 夹具、aria golden 与语言字典都已改为 Kylin，stop 提示从未发出，fixture 消耗与回放会话匹配断言随之级联失败。`seeded-history` 与 `smoke-real` 的失败则早于改名：文件链接现在打开 `ui-sidebar-files` 视图（`priority: 'builtin'`）而非 `ui-sidebar-documentpreview` 兜底；轨迹用例不再切回 Chat，bash 用例因此继承了展开的详情栏。

## 决策

测试期望跟随当前产品行为。Cordis 生命周期用例改断言 Kylin 卡片文案；种子文件链接用例断言 files 视图的路径行、ready 状态与编辑器宿主内容，其 golden 刷新为视图 aria；bash 用例先收起右栏再断言默认三栏框架。Web 快照在沙箱健康的宿主上刷新：已提交夹具携带嵌套沙箱下录制的 `sandbox-exec` 失败文本，且插件清单行已改名为 `@qilin/kylin*`。`tsconfig.base.json` 删除被生成块遮蔽的十个手写块路径键；保留的生成值解析到相同文件。

## 验证

`cordis-tool-round` 与 `seeded-history` 隔离 replay 全过；`seeded-history` 另经一次 `QILIN_SNAPSHOT=refresh` 刷新 file-preview、command-row、feedback-row 三个 golden 后复验通过，diff 评审为视图 aria 加收栏后的框架。tsconfig 去重后 `pnpm run typecheck` 通过，重复键扫描为零。`smoke-real` 需要 `DEEPSEEK_API_KEY`，待有 key 的 shell 重跑。

## 曾考虑的替代方案

恢复旧文案或旧路由被否决：Kylin 改名与 files 工作台是已交付的决策，测试描述当前行为。手工改写陈旧 golden 也被否决，改用 refresh 让持久期望来自真实渲染。

## 后果

Web e2e 夹具从此期望宿主具备可用沙箱后端，与 CI 一致；嵌套沙箱宿主会再次录出失败文本。`snapshots/web/cordis-tool-round` 的录制模型散文保持 Kylin 拼写，日后若再调整措辞，夹具、golden 与测试文案必须同步移动。
