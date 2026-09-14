# Agent Note: Web e2e realignment after the Kylin rename

Status: implemented

English | [中文](2026-09-14-web-e2e-realignment.zh.md)

## Problem

The first full `pnpm run test:web` run after the Kylin rename failed three suites with one root cause each. `cordis-tool-round` stalled mid-scenario: the test still waited for pre-rename copy (`The Cordis Plugin is running.`) while the replay fixture, aria golden, and locale dictionaries all say Kylin, so the stop prompt was never sent and the fixture-consumption and session-match assertions failed as a cascade. `seeded-history` and `smoke-real` failed for behavior that predates the rename: file links now open the `ui-sidebar-files` viewer (`priority: 'builtin'`) rather than the `ui-sidebar-documentpreview` fallback, and the trajectory case no longer switches back to Chat, so the bash case inherited an open details column.

## Decision

Test expectations follow current product behavior. The Cordis lifecycle case asserts the Kylin card copy. The seeded file-link case asserts the files viewer path row, ready state, and editor host content, and its golden is refreshed to the viewer aria. The bash case collapses the right column before asserting the default three-column frame. Web snapshots are refreshed on a healthy-sandbox host: committed fixtures carried `sandbox-exec` failure text recorded under a nested sandbox, and plugin inventory rows renamed to `@qilin/kylin*`. `tsconfig.base.json` drops ten hand-block path keys shadowed by the generated block; the kept generated values resolve to the same files.

## Verification

`cordis-tool-round` and `seeded-history` pass isolated replay runs; `seeded-history` also passes after a `QILIN_SNAPSHOT=refresh` pass that rewrote its file-preview, command-row, and feedback-row goldens, reviewed as the viewer aria plus the post-collapse frame. `pnpm run typecheck` passes after the tsconfig dedupe, and a duplicate-key scan reports none. `smoke-real` needs `DEEPSEEK_API_KEY` and awaits a keyed re-run.

## Alternatives considered

Restoring the old copy or routing was rejected: the Kylin rename and the files workbench are shipped decisions, and tests describe current behavior. Hand-editing the stale goldens was rejected in favor of a refresh so the persisted expectations come from a real render.

## Consequences

Web e2e fixtures now expect a host with a working sandbox backend, matching CI; a nested-sandbox host would record failure text again. `snapshots/web/cordis-tool-round` keeps its recorded model prose swept to Kylin, so the fixture, golden, and test copy must move together if the wording is ever revisited.
