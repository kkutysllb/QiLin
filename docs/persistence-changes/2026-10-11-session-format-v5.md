---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-11-session-format-v5

English | [中文](2026-10-11-session-format-v5.zh.md)

## Summary

Advances the declared SessionHeader.version from 4 to 5 for the V5 writer that folds the retired shipped preset vocabulary onto the single shipped roster. The adjacent V4-to-V5 edge rewrites the retired shipped ids in SessionHeader.agentPreset and agent-preset/selected event payloads; every other header field, event envelope, and payload shape stays identical to released V4.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-11-session-format-v5
baseline: false
changes:
  - root: "SessionHeader"
    previous: "2026-09-16-session-format-v4"
    after: "bb80ce8b5ddb821676b3f2dce0f6abd94d4770595cdb35b407b45caecc24eeff"
    decision: version-bump
```

<a id="compatibility"></a>
## Compatibility

Native V5 admission reuses the released V4 row admission and relationship validation at version 5. The header agentPreset remains a free string, so custom preset ids outside the shipped roster stay valid and only the retired shipped ids fold during migration. Delivery watermarks stay generation-scoped: a session-log-deepseek/delivery-accepted marker recorded for format 4 is no longer active under V5. Historical V4 logs prepare the migration in memory on read opens and publish the current successor beside unchanged predecessor files on write opens; V4 readers refuse the newer generation. Unknown ignorable plugin records pass through unchanged.

<a id="verification"></a>
## Verification

The new session-format-v4-to-v5 edge passes 19 unit tests covering retired and custom header folds, selection-event rewrites, seeded and unseeded cut derivation, strict chain restoration from direct V4 input, released V5 codec framing, and unknown-event refusal. The full Session and core Session suites pass 3,128 tests, session-persistence-jsonl passes 749 including historical catalog publication and retired-content admission, and the writer-constant consumers (agent-presets, plugin-manager, tool-skill, sidebar-opens, shell-env, agent-loop, session-query, agent-team, worktree, llm-replay) pass 1,850 tests. Both host and client TypeScript builds compile cleanly, oxlint reports zero findings on the touched packages, and gen-session-format-catalog derives the five-edge chain ending at the writer.

<a id="dev-note"></a>
## Dev Note

None.
