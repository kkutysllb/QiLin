# Agent Note: qilin 正式发布以 registry 可解析为发布条件

Status: implemented

[English](2026-10-25-npm-release-vendor-resolution-gate.md) | 中文

## Problem

3.1.7 发布了 qilin 族却没有发布 vendor 族，registry 解析安装当场失败：`subagent-codex@3.1.7` 声明 `@qilin-agent/schemastery: ~3.18.5`，harness 各包把 `@qilin-agent/kylin: ~4.0.5` 声明为 peer，而 registry 还停在 10-08 批次的 3.18.3 和 4.0.3。vendor 版本早在 10-17 就已前进，发布链路对此毫无感知。三个假设叠加成这个洞。`release-publish.yml` 的打包任务把 vendor 族打进 `dist/npm-vendor` 仅仅用于安装验证，注释明说 "Only dist/npm is published"——vendor 族是带独立 tag 的独立发布序列，其上一次 registry 批次早于这次版本推进。发布顺序只编排族内安装依赖，跨族引用不在编排范围内。家族模型还把 peer 当作建议项，理由是 npm 从不代装 peer——这对 npm 6 成立，npm 7 起不再成立：npm 会安装 peer，并在 peer 无法解析时直接安装失败。

## Decision

发布任务以 registry 后置条件收尾：`pnpm run release:verify-published --family qilin --from dist/npm`。门禁经发布顺序与 tarball 身份读取打包集合，然后按陈旧 packument 规则带 `--prefer-online` 检查 registry 的两个事实：每个成员自身的已发布版本必须存在，因为被打断的发布留下的是空洞；已发布清单声明的每一条 `@qilin-agent` dependency、optional-dependency 与 peer 范围必须存在满足版本。可选 peer 跳过，npm 对其保持建议语义；可选依赖必须解析，因为本仓库用它承载包所声明的引擎，npm 零退出地静默跳过引擎同样是残缺发布。vendor 族保持独立序列：当 qilin 发布引用 vendor 版本时，操作者先发布该族（`release:pack --family vendor`，再 `release:publish --family vendor`），在 registry 可解析之前，门禁扣住 qilin 的发布。AGENTS.md 在 releases-on-demand 条目旁载明这条规则。

## Alternatives considered

- **由 qilin 工作流顺带发布 vendor 族。** 否决：发布家族是带各自版本基线与 tag 的独立序列，发布其一从不重发另一（[sequences](2026-08-10-npm-release-sequences.zh.md)）。耦合会让每次发布重发未变更的 vendor 包，并模糊哪个 tag 拥有哪些字节。
- **把跨族 peer 范围放宽为插入符。** 否决：这些范围来自 `workspace:~` 改写语义，放宽范围用安装期静默的框架层漂移换掉硬性安装失败。
- **发布前从工作树检查范围。** 否决其作为唯一门禁：发布前的 registry 状态不是发布创造的状态，重要的不变量是后置条件。verify 步骤已打印发布顺序，缺的正是 registry 检查。

## Consequences

- 每次发布约为每成员两次 registry 读取，3.1.7 规模的家族增加数分钟——这是发布一棵可安装依赖树的代价。
- 被打断的发布现在会在第一个缺失成员处失败，与 digest guard 互补：后者捕获同版本内容漂移，前者捕获缺失。
- 3.1.7 的补救是手工完成：cosmokit 1.8.6、schemastery 3.18.5、kylin 4.0.5 于 2026-10-25 发布。门禁的存在让下一次漂移在流水线失败，而不是在消费者处失败。

## Related

- [2026-08-10 npm release sequences](2026-08-10-npm-release-sequences.zh.md)：本门禁所接入的家族拆分。
- [2026-10-12 publish resume after interruption](2026-10-12-publish-resume-after-interruption.zh.md)：digest guard 与本门禁沿用的陈旧 packument 地面真值规则。
- [2026-10-10 releases are on demand](2026-10-10-releases-on-demand.zh.md)：本发布流程所服务的 tag 与 Release 规则。
