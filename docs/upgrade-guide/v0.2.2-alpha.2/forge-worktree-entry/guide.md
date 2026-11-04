---
kind: upgrade-guide
description: "The Plugins page enables change requests and worktrees through one switch, and profiles that keep both forges insert duplicate rows."
---

# One plugin entry for change requests and worktrees

English | [中文](guide.zh.md)

## Change

Web and Desktop use **Change requests & worktrees** to enable the review panel, the new-Session worktree option, and the model's `create_worktree` tool together. Profiles that already enabled the Forge bundle also gain the model tool.

Existing profiles are not migrated automatically. A selected `@qilin-agent/experimental-tool-worktree` bundle stays active and keeps its own card on the Plugins page under **More**, so turning off Change requests & worktrees does not disable that standalone tool. Selecting both it and `@qilin-agent/experimental-forge-bundle` inserts duplicate `worktree` and `tool-worktree` ids, which makes those component controls read-only. Remove the standalone selection before using the unified switch.

## Migration

1. Stop Web or quit Desktop. Back up `$QILIN_HOME/profiles/<name>/package.json` and its sibling `cordis.patch.yml`. Use `~/.qilin` when `QILIN_HOME` is unset; the standard profile name is `web`. For a custom profile, use its name.
2. Edit `qilin.profile.bundles` in that `package.json`. Remove every `@qilin-agent/experimental-tool-worktree` entry. To keep worktree support through the unified switch, add `@qilin-agent/experimental-forge-bundle` once; if it is already selected, keep that entry. To disable both features, remove both bundle names. Preserve all other entries and fields.
3. Keep existing `cordis.patch.yml` overrides: the `worktree`, `tool-worktree`, and `optional-forge-panel` ids are unchanged. To use the Forge panel without exposing the model tool, add or update this entry in the existing patch list:

   ```yaml
   - id: tool-worktree
     disabled: true
   ```

4. Restart the application. In Plugins, confirm that **Change requests & worktrees** reflects your selection. With no disabling row override, enabling it provides the panel and `create_worktree`; turning it off removes both. Confirm that the profile lists no standalone worktree bundle. Existing worktrees, branches, and Session records are retained.

Headless profiles and custom compositions that need only the standalone tool can keep it; do not also select the Forge bundle. In Web or Desktop, that standalone selection stays on the More list and can also be managed there.
