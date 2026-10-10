# Agent Note: QiLin 只发 web 引擎，CI 改为按需运行

Status: implemented

[English](2026-10-07-fork-ci-runs-on-demand.md) | 中文

## Problem

QiLin 是该 harness 的 web 引擎分支：只发源码，不发布任何制品——没有 npm 包、没有安装器、没有发布二进制、没有托管服务。继承下来的工作流集合却仍在每次推送到 `main` 时启动：`CI main`（构建 + 全量单测）、`CI master`（Linux 上跑 Wine）、`Sandbox`（四条 OS/runner 腿，其中 macOS seatbelt 腿要构建整棵树再跑全量单测）、`Release (qilin)` 与 `Release (vendor)` 的打包排练、`E2E`，以及带路径过滤的 native 车道。因此一次 main 推送会占用托管 runner 约半小时；而发布规则要求推送前先备好 tag 与 GitHub Release，哪怕改动只有一行。

这些工作流及其触发契约是有意继承的：`.github/workflows/ci-master.yml` 保留上游的文件名、显示名与事件守卫，让周期性上游合并保持可 diff；`scripts/ci-workflow.spec.ts` 钉住了这些契约（`ci-master.yml` 与 `ci.yml` 的 `on` 集合、合并后作业清单、standby 守卫）。在文件里裁触发条件会与上游分叉，并在每轮对齐时重写这些断言。

## Decision

CI、构建与发布工作流改在 GitHub 层禁用（`gh workflow disable`），因此 `.github/workflows/` 里没有任何记录这次选择的改动，文件与上游逐字节一致。被禁用的工作流：`CI`、`CI main`、`CI master`、`E2E (real DeepSeek API)`、`E2E (pi-ai Azure OpenAI and Anthropic)`、`Sandbox`、`Expected filenames`、`Release (qilin)`、`Release (vendor)`、`Release publish (qilin)`、`Release publish (vendor)`、`Release (Python)`、`Node Addon System`、`Node Addon System Release`、`Build single-exe`、`Build PR preview`。

- 任何 `push`、`pull_request` 或 `schedule` 事件都不会再启动它们；仓库的 Actions 页把它们标为 `disabled_manually`。
- 它们仍可按需运行：`gh workflow enable "<name>"` 之后再 `gh workflow run "<name>"`。启用粒度是单个工作流，因此需要平台证据的改动只启用提供该证据的那条车道。
- 非 CI 的仓库自动化保持启用：issue lifecycle、issue policy、weighted approval，以及手动派发的文档部署。
- 验证证据转为本机：客户端与宿主包用 `pnpm run test:gui`，组装后的浏览器输出用 `QILIN_SNAPSHOT=replay pnpm run test:web`，另有 `pnpm run typecheck`、`pnpm run lint`、`pnpm run duplication`、`pnpm run test:docs`，以及 [qilin-pre-push-checks skill](../../../skills/qilin-pre-push-checks/SKILL.md) 针对出站 diff 给出的窄集选择。
- 发布规则由 `pre-push` 钩子（[verify-release-tag.ts](../../../../scripts/verify-release-tag.ts)）按推送自己声明的发布在本机强制：被推送到 `main` 的提交带附注 `v*` tag 时，该 tag 必须有 GitHub Release 且带成文说明，manifests 的版本必须与 tag 一致；没有这类 tag 的推送不发版，直接通过。

## Alternatives considered

**在文件里裁触发条件。** 推送时的效果完全相同且在仓库里可见，但每个被裁的文件都会与上游分叉，并迫使 `scripts/ci-workflow.spec.ts`（它断言 `ci-master` 的 `on` 集合、合并后作业清单与 standby 守卫）和 `scripts/ci-compatible-selfhosted.spec.ts` 在同一次改动里重写，且在每次上游合并时重新处理。

**保留 CI 但让它更便宜——分片、路径过滤、夜间车道。** 给单测作业分片、把 seatbelt 车道挪到夜间能压低墙钟时间，但剩余车道仍会在每次推送启动；而这个分支独有的覆盖（macOS seatbelt 平台一致性、Wine、打包后再安装的排练）验证的是与上游的对齐，不是 QiLin 的 web 面。

**删除工作流文件。** 一劳永逸地去掉触发，但也去掉了按需运行的能力，以及本分支为上游合并保留的可 diff 性；此后每次上游导入都会在"文件被删"上冲突。

**继续让 CI 跑完、事后再看结果。** 保留完整矩阵作为推送后的安全网，代价是等待时间，以及本分支发布规则加在每次改动上的"每次推送必有 tag"仪式。

## Consequences

换来的是：一次 main 推送数秒内结束；上游导入保持原有 diff 面；任何需要平台或打包证据的改动都能用一条命令启用对应车道；发布规则中唯一被机器强制的部分（tag 及其成文 release notes）照旧。

代价是：不再有任何自动运行，因此除非本机门禁捕获，回归会直达 `main`；托管车道覆盖的"禁止方向"用例——macOS seatbelt 隔离、Linux 上的 Wine、打包后再安装的排练、夜间 e2e 扫查、pull request 判决——在有人启用该工作流前保持黑暗。"Actions 全绿"不再是本仓可用的证据，因此改动说明必须引用本机跑过的命令。恢复是逐工作流进行，而不是一个仓库级开关。

## Related

- [Quality gates](2026-06-11-quality-gates.zh.md)：该记录把门禁矩阵的所有权交给 CI；本分支改为本机执行同一批门禁，工作流仅按需运行。
- [Serial cross-platform CI reference](2026-07-21-serial-cross-platform-ci-reference.zh.md)：它描述的串行参考车道（含 seatbelt 全量）现处于按需状态。
- [CI failover runbook](2026-07-26-ci-failover-runbook.zh.md)：failover 变量只在对应工作流被启用时才起作用。
