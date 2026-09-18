# Agent Note: Upstream dsh-v0.1.6-alpha.2 alignment

Status: implemented

English | [中文](2026-09-17-upstream-dsh-0.1.6-alpha.2-alignment.zh.md)

## Problem

QiLin is a rebranded engine that tracks the upstream DeepSeek Harness (DSH) line. Upstream released `dsh-v0.1.6-alpha.2` two days after the tag QiLin had aligned to (`dsh-v0.1.6-alpha.1`), with 548 non-merge commits over 2622 files: a reworked profile resolver, a rewritten settings plugin surface, a native plugin manager, Office document conversion, sandboxed sidebar browser tabs, and the `workspace/changes` session event.

QiLin's histories are unrelated to upstream's, so the increment cannot be merged by ancestry. The previous alignment built a rename transform (upstream tree → QiLin namespace) and recorded that it was not byte-exact: brand renames are context-sensitive, and the residual made files conflict whenever upstream also touched them.

## Decision

Branch `3.0.2` takes the upstream alpha.2 tree through the rename transform and merges it against a synthetic common ancestor, then re-lands every QiLin-local surface on upstream's structure.

Upstream structure wins; QiLin behaviour is re-expressed on it:

- **Profile resolution.** Upstream moved patch reloading into the new `packages/boot/hmr` package and deleted `patchReload` from profile templates, manifests, and the loader. `patchReload`, `ProfilePatchReload`, and the per-template `patchReload` values are gone; profile patch reloading is `@qilin/hmr`'s explicit configuration watch, mounted by the base bundle. QiLin keeps its `qilin` profile template, its installation-owned tuple normalization, and the `dsh`-era metadata fallback (`profileDeclarationOf`, `bundlePatchOf`, `dshCompatModuleId`).
- **Plugin management.** QiLin's `host/plugin-manager` and `client/ui-settings-user-plugins` packages are retired. Upstream's `@qilin/plugin-manager` (base bundle row) provides the `pluginManager` Remote behind `@qilin/client-ui-plugin-manager`; the two QiLin packages exposed a different method set under the same service name, so they could not coexist.
- **Current-session selection.** The session controller owns the catalog and leaves view selection to navigation. `@qilin/api-session-controller`'s list state no longer carries `current`, and `ISessions` no longer opens subagents. QiLin's local pages read the selection from the workspace service instead: `UiWorkspace.selection` publishes the persisted main-pane selection, `ui-settings-skills` reads it through its injected face, and `ui-sidebar-tasks` reveals children through `UiWorkspace.openSession`.
- **Sidebar-right tab types.** `SidebarRightTabDefinition.label` is optional; the tab-settings row falls back to `kind`. QiLin's own types still supply it.
- **Client content width.** Upstream extracted the transcript width axis into the `conversation.content` factory's `widthControls` local component. QiLin's settings-backed width (`useContentWidth`/`setContentWidth`, `CONTENT_WIDTH_ADAPTIVE`, `CONTENT_WIDTH_MIN`) is re-landed inside `ConversationWidthControls.tsx`, replacing upstream's `localStorage` preference.

The rename transform now learns its per-file map from the **current aligned state** and reuses QiLin's exact spelling for every line the upstream text did not rewrite. Only genuinely new upstream text goes through the learned token pairs. This halved the conflict count (527 → 267) and removed the whole pairing-record conflict class.

Generated artifacts are regenerated rather than merged: package versions, tsconfig aliases and project references, catalogs, third-party notices, and the bilingual pairing records.

## Transform mechanics

The merge runs against two synthetic commits: the transformed alpha.1 tree as the common ancestor, and the transformed alpha.2 tree as the other side, both recorded as `refs/upstream-synth/*`. `git replace --graft` makes the real branch tip descend from the synthetic ancestor for the duration of the merge; the replacements are deleted before the merge commit is inspected, so the merge commit records the true parents.

`git merge` resolved 267 conflicts: 261 content, 3 theirs-deleted, 3 ours-deleted. Working classes:

- **Brand residual** (22) — both sides changed under ten lines; take upstream, re-apply the local edit.
- **Docs and prose** (29) — additive rewrites; union merge, then review.
- **Generated artifacts** (128 including the pairing records) — regenerate.
- **Semantic conflicts** (56) — profile resolution, the CLI, the extensions packages, client settings, theme, and sidebar-right; each resolved against the merged tree rather than either side alone.

## Alternatives considered

**Merging upstream commits directly.** QiLin's history is an independent initialization; there is no common ancestor to merge against.

**Whole-file brand replacement.** The prior round proved it corrupts context-sensitive names: `cordis.yml` is the loader's root config file while vendored plugins are `@qilin/kylin-*`; `spreadsheet` contains `dsh`; runtime identifiers (`cordis_inspect_list`, `dynamicCordisRunner`, `CordisDynamicPluginId`) keep the `cordis` spelling. This alignment instead reuses QiLin's spelling per unchanged line and fixes the residual tokens afterwards.

**Keeping QiLin's plugin manager beside upstream's.** Both register the `pluginManager` Remote, so a single composition would present two providers with incompatible methods. Coexistence would need a new service name and a second profile-mutating writer.

**Keeping `patchReload`.** Upstream deleted the mechanism; keeping it would have left two competing reload paths against the new `@qilin/hmr` watcher.

**Publishing the selection as a global standard hook.** Making `useMainSelection` a required global prop forced 83 unrelated test fixtures to supply it; passing the selection through the consuming page's own injected face kept the change local.

**Deferring the plugin-manager retirement.** The retired client page cannot typecheck against upstream's Remote methods, so the retirement could not be deferred without leaving the workspace red.

## Consequences

Tree-wide, the alignment gains upstream's profile sanitization and plugin manager, Office conversion, sandboxed browser tabs, the `workspace/changes` event and changed-files card, `boot/hmr`, `util/lazy-require`, and the 548 upstream fixes. `SESSION_FORMAT_VERSION` stays 3, no `!` commit landed, engines are unchanged, and `vendor/` moved three files, so a QiLin build still reads logs written before the alignment; a build that predates it refuses a log carrying `workspace/changes`.

The cost is a large one-shot review surface. Re-landing QiLin's behaviour restored the plugin-manager surfaces upstream does not carry: `@qilin/plugin-manager`'s update check and GitHub package catalog, which the client page mounts on the existing install path instead of a second writer.

Upstream's `settings.trigger` slot stays out. [QiLin's settings entry-point decision](../bug-fix/2026-09-13-qilin-brand-surfaces-and-settings-entry-point.md) removed that slot, its content, and its catalog entry so the account menu is the only Settings entry point, and this alignment keeps that removal rather than restoring the sidebar-foot row. The `@pluginId` input-trigger source, the creator toolset, and the `cordis_mount` trust paragraph are gone with upstream's creator-mode rewrite; `plugin_manager` replaces them.

Bilingual pairing was re-recorded for all 1037 records after the merge; the pairs whose structures diverged were aligned rather than whitewashed, and merge-created duplicate paragraphs were resolved by keeping the current version on both sides. The persistence archive was re-fingerprinted in the same round: the schema inventory's domain tag is `qilin-persistence-schema-v1` while the released and historical snapshots still carried digests computed under upstream's tag, so every root and type digest and the digests those records pin were recomputed. No generation moved and no format version changed.

Gates the base tree left red now pass: `gen-module-graph`/`gen-doc-graphs` exclude vendored peers, so `@qilin/kylin` (`vendor/cordis`) is no longer a missing in-repo peer; `gen-kylin-inspect-catalog` passes once the workspace is built; the released-persistence, format-reference, type-history, and catalog gates agree again. The Web lane's scaffold no longer pre-acknowledges the deleted welcome notice, and its token exchange asserts the connection's entry path instead of the site root.

Naming follows the base tree: the framework's generated API regions and runtime identifiers keep the `Cordis` spelling, while QiLin's own prose, package names, and documentation directories use `Kylin`.

## Deferred

- QiLin's `host/plugin-manager` and `client/ui-settings-user-plugins` packages are deleted. [The plugin-ecosystem compat note](2026-09-15-dsh-plugin-ecosystem-compat.md) keeps its still-current half (the DSH-era compatibility layer, `qilin plugin list`/`doctor`) and now points its ownership and Settings paragraphs at `@qilin/plugin-manager`.
- `scripts/rescope-vendor.ts` still maps the framework's former names and paths (`vendor/kylin`, `scripts/kylin-walk.ts`, `@kylinjs/*`) against a tree that vendors `cordis`; `rescope-vendor:check` fails on the missing path before it can report, and the mapping needs its own rewrite.
- Tracked Markdown still names upstream packages as `@deepseek-ai/dsh-*` in prose. Only the code blocks a documentation typecheck compiles were updated, because the rest are historical references and the DSH-era compatibility layer's own subject matter.
- The generator splices English API regions into both languages, so a Chinese subsystem page carries English type text inside its `Cordis API` region.
- A full prose rename of the framework name would have to change the generated region heading on every subsystem page and their Chinese pairs; the alignment keeps the base tree's split instead.
