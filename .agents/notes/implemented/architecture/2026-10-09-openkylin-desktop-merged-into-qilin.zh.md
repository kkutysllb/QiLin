# Agent Note：OpenKylin 桌面壳并入麒麟仓

Status: implemented

[English](2026-10-09-openkylin-desktop-merged-into-qilin.md) | 中文

## Problem

桌面壳在独立的 OpenKyLin 仓库，把本仓当锁定上游消费：`upstream/qilin.lock.json` 钉住某个 QiLin commit，桌面管线克隆该 commit 到 staging 检出、打 Web 品牌补丁、再从它构建引擎闭包。任何 QiLin 修复——包括真机可见的桌面修复（如新会话按钮 hover 三处修正）——都要等 pin 前移才能到达已发行的桌面，于是修复躺在麒麟仓里、真机上的缺陷持续存在。分仓还养着平行的发布流、平行的补丁层，以及一个只为对账两份副本而存在的 parity 门。

## Decision

OpenKyLin 仓库以 `desktop/` 并入本仓（git subtree，历史保留）。引擎依赖反转：壳从本仓自己的 HEAD 构建引擎——`desktop/scripts/build-runtime-bundle.sh` 检出 HEAD 的 `git worktree`，安装、跑 `build:qilin`、收生产闭包；`desktop/scripts/dev.mjs` 直接对活工作区跑壳。上游锁定机制——`fetch-upstream`、`verify-upstream`、锁文件、品牌补丁层、web/desktop parity 门——全部退役；原补丁成为 `packages/client` 与 `apps/web` 下的普通源码。

发布流在源代码与网页版上统一到本仓的 tag 线：一个 `v*` tag 驱动引擎发布链与它的 GitHub Release；`desktop-release.yml` 只在手动 dispatch（带上已推送的 tag）时构建、签名、过产物门（V1–V7），把桌面产物挂到同一个 Release，create-or-upload 收敛两个工作流的先后竞态。桌面版本即 workspace 版本；`desktop/package/package.json` 在打包期从根同步。

`desktop` profile 名继续保留：公开 CLI 仍拒绝 `--profile desktop`，壳启动的是 `qilin` profile，保留名在本仓没有可发行的消费者。

本决策推翻[桌面与账号边界笔记](2026-09-25-desktop-and-account-alignment-boundaries.zh.md)的桌面壳半边；该笔记的账号栈半边原样继续有效。

## Alternatives considered

**保留独立仓、加快移 pin 频率。** 拒绝：pin 速度只治标——补丁层、parity 门、双发布流都因两份副本而存在，且每个 QiLin 变更仍晚一个发行版才到桌面。

**壳作为 vendor 副本携带、不反转依赖。** 拒绝：vendor 保留的正是产生「桌面滞后」缺陷类的锁加补丁机制；反转依赖（引擎=本仓）才删得掉机制。

## Consequences

`pnpm run build:desktop` 与 `pnpm run test:desktop` 是桌面入口；桌面 CI 跑根上的 `desktop-release.yml`。QiLin 源码变更在落地的同一提交内即桌面可见，桌面侧适配（印章品牌、标题栏让位、侧栏分区、hover 修复）以普通源码存在而非补丁。`desktop/README.md` 里独立仓时代的声明已替换为本仓流程。
