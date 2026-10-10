# Agent Note: 发布按需进行，而非每次推送 main

Status: implemented

[English](2026-10-10-releases-on-demand.md) | 中文

## Problem

QiLin 继承了引擎仓的规则：每次更新 `main` 的推送都要发一个版本——被推送的提交必须带附注 `v*` tag，其 GitHub Release 要有成文说明，否则 `pre-push` 拒绝推送。本仓只发源码、不发布任何产物，因此这条规则对日常改动是纯负担：一处一行的修复也要先跨工作区 manifests 抬版本号、打附注 tag、写说明、建 Release 对象才能离开本机，于是审查看到的是版本号噪声而不是改动本身。这条规则还把「这次改动是否值得一个版本」这个判断塞进了每一次推送，而 `QILIN_RELEASE_SKIP` 多半只是用来绕开它。

## Decision

更新 `main` 的推送本身不发版。发布发生在被推送的提交带附注 `v*` tag 之时，而这个 tag 就是全部的声明。随后 `pre-push` 作业（[verify-release-tag.ts](../../../../scripts/verify-release-tag.ts)）校验它：该 tag 必须有 GitHub Release 且说明不少于 80 字符，根 manifest 的版本必须与 tag 逐字一致（含预发布段）。推送的提交不带发布 tag 时，直接通过。发布方式：在重建后的树上执行 `pnpm run version:set <x.y.z>`、`git tag -a vX.Y.Z -m …`、`gh release create <tag> --notes-file <notes.md>`。`QILIN_RELEASE_SKIP=<reason>` 仍在 GitHub 不可达时放行；只推 tag 时仍要求其 Release 已存在，因为钩子会退回比较 `main` 与 `origin/main`。

## Alternatives considered

- **保留规则，每次推送传 `QILIN_RELEASE_SKIP`。** 否决：每次推送都要关掉的门不是门，而且它会掩盖「发布只做了一半」的那一天。
- **只在路径过滤（`packages/**`、`apps/**`）命中时要求发版。** 否决：过滤器会把「这次是否值得一个版本」这个判断原样搬回来，而文档改动同样可能值得一个版本，包内重构则未必。
- **彻底删掉发布校验。** 否决：有 tag 无 Release、说明是占位、manifest 不写 tag 版本这三种都会静默失败，用户看到的是「一个从未发出的版本」。而校验一次已声明的发布，对没有声明的推送没有任何成本。

## Consequences

- 更新 `main` 的推送不再需要抬版本号、打 tag 或建 Release。发布从「每次推送的税」变成一次明确的动作。
- 门禁在该硬的地方仍然硬：已声明的、发不出去的发布会带着确切补救方式失败（建 Release、补真实说明、或把 manifests 抬到 tag 的版本）。
- `scripts/verify-release-tag.spec.ts` 钉住两个方向：不带 tag 的提交按「不发版」通过；带 tag 而无 Release 的提交失败。

## Related

- [2026-10-07 fork CI 按需运行](2026-10-07-fork-ci-runs-on-demand.zh.md) 负责本次规则变更所伴随的「禁用工作流」决策。
