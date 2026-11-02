# 2026-11-02/03 会话交接（遗留项 ①②③ 收口轮）

- 基线：rc.4（v3.1.8-rc.4）之后的遗留清单 [2026-11-01-rc3-remaining-alignment.md](2026-11-01-rc3-remaining-alignment.md)。
- 本会话完成：第 1 项（插件配置入口）、第 2 项（分组级焦点保持，折叠+焦点两面）、第 3 项（web e2e 权威定性 + 2 例修复）。
- 工作树状态：13 个已修改文件**未提交**；整树 `pnpm run build` 绿（439 client 产物已登记）。

## 改动面与提交建议（按主题拆三笔）

1. **fix(chat): 分组级焦点保持**——`packages/client/ui-chat/` 四个源文件（ChatNodeSeat 焦点捕获、ChatFlow 流级恢复、store 的 focusedNode 记录与消费）+ 三个测试文件（新增 chat-flow-focus.client.spec.tsx、group-seat/chat-view 各加用例）。
2. **test(web): 语音与插件 e2e 跟进现行入口**——voice-setup（默认组合，不再遮蔽安装自带包）、voice-download（导航去 tab + alert 收窄 downloadFailure）。
3. **test(web)+docs: clickable-links 图标断言 + cookbook 入径更新**——clickable-links-gallery（图标 mark 收 first path）、docs/cookbook/adding-a-settings-card{,.zh,.i18n.yaml}（清掉已删除的「管理插件」tab 入口，配对账本已重录）。

计划文件（plans/2026-11-01-rc3-remaining-alignment.md）随任意一笔带上。

## 关键实现事实（给下一位）

- **焦点保持机制**：读者聚焦成员行 → live 期间写入 reader 意图 + focusedNode 记录（ChatNodeSeat.captureFocus，绕过 live 写入守卫是有意的）；完成重组换行子树、焦点掉 body 后，由 **ChatFlow**（会话级、跨重组存活）挂 body 级 MutationObserver 恢复——闭合信号必须读 **timeline 的 turn status**（节点 presentation 在落定后会消失，曾致观察者静默断开）；行控件是 `role="button"` 的 div，查找必须含 `[role="button"]`（纯 `button` 选择器全盲是本轮最大陷阱）；恢复成功或读者移焦即消费记录，无焦点偷取。
- **web e2e 沙箱根因**：宿主受沙箱时 harness 的 bash 工具无法嵌套 sandbox-exec（`SANDBOX_UNAVAILABLE`），凡真实执行工具的 spec（turn-tail/ptc/shipped-composition 等）必红。权威 lane 只能在非沙箱宿主跑。

## 验证证据（全部实跑）

- ui-chat 单测 798/798；test:gui 685 文件 10522 例全绿。
- turn-tail-actions e2e 7/7（+1 record-only 跳过）——聚焦用例折叠+焦点双断言过。
- voice-setup 1/1、voice-download 5/5、clickable-links 1/1、plugin-manager 6/6、plugin-config 11/11、settings-chrome 13/13。
- 全量 web lane（非沙箱、干净 build）：50 失败/395 通过——定性表见计划 §二·补 3。
- `pnpm run build` 绿（此前包级重建绕过 tsc，累积 4 处类型错误已修——**改 client 源码后必须整树 build 或至少 tsc，包级 bundle 不查类型**）。

## 环境备注

- playwright 浏览器：缓存装的是 1243，已 symlink 到 1228 期望路径（本地变通，用户认可）。如需精确版本：`HTTPS_PROXY=http://127.0.0.1:7890 node node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/cli.js install chromium`。
- 外网下载需本地代理 127.0.0.1:7890；机器偶发高负载（load ~78）会让全量套件出现漂移性失败——单文件复跑是真信号。
- `.tmp/` 是上个会话遗留草稿（commit-msg*.txt 等），触发 `verify-repository-references` 红；计划文件内的裸提交哈希已清理，`.tmp/` 处置待用户决定。

## 下一步（按优先级）

1. **C-1 组合面决策（需用户）**：shipped-composition ×5 期望直调工具清单含 run_code、现行 web 组合不含——改期望还是补组合，定了方向即可落地（~5 例）。
2. **B 族重录（需 DEEPSEEK_API_KEY）**：changed-files-turn×3、file-upload-round×2、steering×2、subagent-interrupt-ui×2、details-session-lifecycle×1——根因 composition 漂移（skill-catalog 事件 + run_code 直调），`QILIN_SNAPSHOT=record pnpm run test:web` 重录。
3. **D 超时家族**：seeded-history×4、rail-search-expand×1、models-settings-recovery×1——逐个查遮蔽/时序。
4. **产品嫌疑**：background-job-list ×2（后台 bash 不返 job id）；schedule 域未开（schedule-panel 超时 + schedule-after 8 跳过）。
5. **遗留清单 ④**：pnpm 11.23.0 → 稳定线 12.16.1（同步 packageManager/根 devDep/apps/desktop/native-system 四处 pin + 锁文件重生成 + 全门禁复跑）。
6. **遗留清单 ⑤**：快照 lane 已知红（advanced-toolchain×2 等需人工重写；subagent-multi v0 唯一覆盖二选一；spawn-in-process 顺序竞态）。
