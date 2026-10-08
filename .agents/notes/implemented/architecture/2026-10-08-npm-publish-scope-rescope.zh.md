# Agent Note: npm 发布作用域改名

Status: implemented

[English](2026-10-08-npm-publish-scope-rescope.md) | 中文

## Problem

`@qilin` npm scope 被一个从未发布过公开包的第三方持有，registry 永远无法承载现有全部 manifest 所用的这个作用域，而发布需要一个本账号自有 scope。三个下游产品（LingShu、KStock、OpenKyLin）通过锁定的分支或 commit 消费本仓并内嵌引擎副本；它们的产品自有代码直接引用 `@qilin/*` 名字（合计约 480 处），改名只会经由各产品自己的引擎升级到达它们。

## Decision

本仓把发布作用域从 `@qilin` 机械改名为 `@qilin-agent`（本 npm 账号认领的 org），一次性覆盖全部受踪现行文件：manifest、源码导入、生成的 tsconfig paths、目录产物、docs、README、录制会话快照、workflow 与脚本（5,314 个文件）。发布流水线本身不变；release 家族的 scope 断言随改名同步移动。npm org `qilin-agent` 已认领，发布凭据沿用既有仓库 Secret `NPM_TOKEN`，用户入口为 `npx -y @qilin-agent/cli web`。

五类文本形态各需一遍处理：普通 `@qilin/`；正则转义 `@qilin\/`；拆分的 path-join 字面量（`'@qilin', 'session'`）；裸 scope 行文（"the `@qilin` scope"）；GitHub slug 锚点片段（`#qilintools` → `#qilin-agenttools`），目录产物经 `githubSlug` 再生成即得新 slug。刻意不改：带日期的记录（`.agents/notes/`、`plans/`、`qilin/` 验收与 spec 记录）、`pnpm-lock.yaml`（以重生成代替）、`test@qilin.invalid` 测试邮箱、品牌标识（`#qilin-seal-*`、`#qilin-wordmark-*`、`qilinDropOverlayClip`）、以及只共享前缀的他人 scope `@qilinjs/*`。

下游跟进契约：改名以单个原子提交落在 `main`，改名前最后一个发布版本留在其 tag 上。每个产品在自己的下一次引擎升级内跟进——把 pin 推过改名 commit，对产品自有引用执行同一文本替换（LingShu 约 92 处、KStock 约 378 处、OpenKyLin 约 9 处，含拆分 path-join 形态与锚点 slug），重跑各自闸门。从不重 pin 的产品永远基于改名前的冻结副本构建，不受影响。

## Consequences

`@qilin/*` 名字在本仓已消亡：漏改的引用会在 typecheck 或安装时响亮失败，而非静默解析。发布的包、其 README 与网站只呈现一个名字，没有需要维护的内外部映射。三个下游产品把成本变成各自升级时的一次性 PR，而不是本仓一个永久的映射机制。

## Verification

`pnpm install --lockfile-only` 重生成 lockfile（3,935 条 `@qilin-agent/` 条目，受踪现行文件零 `@qilin/` 残留）。通过的闸门：`rescope-vendor:check`、`constraints`、`verify-tsconfig-paths`、`verify-package-dependencies`、`verify-package-paths`、`verify-kylin-catalog`、`verify-dependency-catalog`、`verify-tool-catalog`、`verify-config-catalog`、`verify-plugin-packages`、`verify-qilin-package-licenses`、`verify-third-party-notices`、`verify-package-readme-model-experience`、`pnpm run typecheck`。`test:docs` 报告 17 项通过、3 项失败与改名前干净树完全相同（repository references、README summaries、translation pairing）；`verify-package-meta` 在干净检出上本就红，同属既有问题。

## Alternatives considered

- **发布时改写名字**——内部保持 `@qilin`，在 `release:pack` 里改写 tarball manifest。否决：由发布脚本永久承担内外双名映射，且发布面元数据（README、依赖名）与仓库分叉，只为规避一个"锁定分支消费模型已使其可按产品排期"的成本。
- **无作用域包名**——候选全部被占（`qilin`、`qilin-cli`、`dsh-qilin` 等）；先到先得的无作用域名始终暴露在抢注风险下，而认领的 org 一次性锁住整个 scope。
