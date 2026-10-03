# CI 链存量红清理轮（2026-10-03）

上一轮把主 CI 的 lint（0/0）与 duplication（18 → 0）两条清干净后，同一批 `check:ci:*` 车道上还压着一批与历次改动都无关的存量红。本轮逐个复现并收口，然后发 3.0.10。

注意：`ci.yml` 在本仓最后一次运行是 2026-09-12（成功），此后 3 周没有跑过，所以这批红是「下次一跑就整条红」的确定状态，不是漂移风险。

## 一、复现口径

`ci.yml` 的静态面在 2026-09-12 之后没有变过，但门禁清单变过。按当前 `scripts/run-gates.ts`，`ci.yml` 实际覆盖的车道是：

- `ci-static` = 共享静态门禁 + `docs:build:mpa` 等文档门禁 + `verify-module-graph`。
- `ci-consumers` = build + publint + `check:ci:lint:contracts-ready` + 快照 + expected-output + web 快照 + doc-typecheck。
- `ci-coverage` = `build:native-system` + `vitest run --coverage`（逐文件 100%）。
- 另有 pre-push 的 `hygiene` 车道（lefthook 只跑 typecheck + release tag，但本仓把它当成推送前的本地门禁）。

复现命令一律用 `npx tsx scripts/run-gates.ts <lane>` 或直接跑单个门禁脚本，绕开本机 pnpm 的依赖自检（见第四节）。

## 二、本轮清掉的红

全部在随 `v3.0.10` 发布的四个提交里（`docs(catalogs)` 重跑发布批次漏掉的生成物、`fix(new-packages)` 补新包发布视图与中文 README 骨架、`fix(sidebar-opens)` 去掉用例的 unknown 断言、`chore(gates)` 收掉 vendor rescope 与仓库引用两处存量红）：

- `verify-module-graph`：产物缺 `sidebar-opens` 与 `client-ui-agent-opens` 两个包（发布批次漏再生成）。
- `verify-kylin-catalog`：`workspace-files` 的 `remove` → `delete` 重命名没有落到 `docs/subsystems/workspace.md` 与 `tool-kylin/src/api-catalog.ts`。
- `verify-config-catalog`：`api-gateway` 的 Config 源码行号漂移。
- `verify-md-links`：`sidebar-opens/README{.md,.zh.md}` 指向 `docs/tool-catalog.md#sidebar_open`，而该锚点不存在。根因是工具目录生成器的启动清单只扫 `packages/*/tool-*`，宿主包 `packages/host/sidebar-opens` 没有入口——**`sidebar_open` 是模型可见工具，却从未进过工具目录**。清单补上该包、英文目录重新生成、中文对照与配对记录同步。
- `verify-doc-standard`（doc-sync 内的 spec）：两个新包的中文 README 用「摘要」，包 README 骨架要求「概述」。
- `constraints`：`client-ui-agent-opens` 缺 `files` 字段（该包声明了 `./client` 半边）。
- `verify-no-unknown-casts`：`sidebar-opens.spec.ts:55` 的 `as unknown as Agent`。
- `rescope-vendor:check`：`cordis/*` 是 extensions 事件域，`GENERIC_SKIPS` 按文件逐个豁免生产/消费方；sidebar-opens 落地时新增的 `inspect-registry.spec.ts` 与两个 `cordis-inspect-*` 快照夹具漏在名单外，被当成包名重写。
- `verify-repository-references`：两份 plans 记了裸提交号，改写成发布标签。

清完后 `doc-sync` 从 7 红降到 2 红，`hygiene` 从 4 红降到 0（publint 见下），`ci-static` 的其余门禁全绿。

## 三、未清的两条

### 1. `verify-persistence-changes`（`doc-sync` / `ci-static`）

红在 `parseSnapshot` 读历史快照：`SessionHeader: schema digest mismatch`。本轮的取证结论：

- 全部 8 份 `docs/persistence-changes/*.schema.json` 里，只有 `2026-09-16-session-format-v4`（15 个 root）与 `2026-09-20-unknown-child-catalog`（1 个 root）内部不一致；其余 6 份自洽。
- 这两个文件恰好是 `feat: 对齐上游 dsh 0.1.7-rc.1` 那批落地（2026-09-25 08:48，随 `v3.0.5` 发布）最后写入的两个；同目录其他快照由别的提交写入。即：那次生成器运行产出的 digest 与它同时写出的 schema 对不上。
- 这 15 个 digest 既不等于其自身 schema 的 digest，也不等于该 schema 经 `canonicalizeSchema` 之后的 digest；用该提交所处的发布世代 `v3.0.5` 的 `schemaDigest`/`canonicalizeSchema`（`git show v3.0.5:scripts/persistence-schema-model.ts`）复算仍然不相等。**这些 digest 不可复现**。
- 另有 `2026-09-21-user-question-reply.schema.json` **整个文件缺失**（该记录声明了 4 个 root）。即使修好上面 15 个 digest，下一步仍会报 `missing schema snapshot`；而它的声明 digest 与当前树、与可复现的任何规范化形式也都不相等。
- 我还验过另一条路：把这两个快照按当前代码规范化并重新指纹（15 个 root），确实能让解析通过，但随即暴露第三条：当前树的 `event:user/message` 等 4 个 root 与 `2026-09-21` 记录的声明不一致，需要再补一条 acknowledgement。这条链已经不只是「校验和写错」，而是丢失了一代快照 + 两代 digest 不可复现。

按仓库既有铁律（随 `v3.0.6` 发布的 `build(B4)` 提交信息：禁止手改持久化 JSON、只准改生成器后重跑；`persistence-formats` 对历史快照的放宽不等于可修改已发布世代），我**没有**改写已发布世代，也没有为了让门禁变绿而补一条内容不实的 acknowledgement。这一条留 owner 决策：要么恢复那一代运行的生成器输入，要么由 owner 明确同意重录这三份历史产物。

### 2. `docs:build`（本地环境）

`tsx website/build.ts` 之后会拉起一次 `pnpm install`，本机 pnpm 的依赖自检判定 `node_modules` 需要重建，在无 TTY 时以 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 中止。这是本机 `node_modules` 的状态（与未改动的锁文件无关），CI 设了 `CI=true`。用 `CI=true pnpm run docs:build` 复跑通过，与文档内容无关。

### 3. `ci-coverage` 在本机拿不到可信信号

本机全量 `vitest run --coverage` 出现 412 个失败用例（`ptc-runtime-python` 需要 Python ≥ 3.10 而本机是 3.9.6；多处 `EPERM spawn` 是沙箱限制），与「改动过的包 0 失败」的定向口径冲突。coverage 车道的权威只能在 CI 上取；本轮没有据此改任何源码或阈值。

## 四、发布 3.0.10

`version:set 3.0.10` → 重建产物 → `chore(3.0.10)` 提交 → 注释 tag `v3.0.10` → `gh release create` → push `main`（pre-push 会跑 typecheck 与 `verify-release-tag`）。
