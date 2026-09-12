---
description: "Skills page in Web Settings: the skill catalog one Session's composition resolves, grouped by discovery source."
kind: "package-reference"
---

# @qilin/client-ui-settings-skills

English | [中文](README.zh.md)

## Summary

The skills page is one Settings section. It lists every skill the current Session can use — names, routing descriptions, invocation policy, discovery source, and owning provider — grouped by where each skill was discovered. The page reads the Session-addressed `skills/list` Remote the composer's `/` menu already uses and owns no mutation: a skill becomes available by existing in a discovered root, and the page refreshes rather than offering an edit that could not take effect.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Open **Settings → Skills**. The page addresses the Session the window currently shows and lists its catalog; opening another Session re-reads it.

### Groups

| Group | Discovery sources |
|---|---|
| Provided by plugins | `runtime`, `bundled` |
| Workspace | `project-qilin`, `project-agents` |
| User directories | `user-qilin`, `user-agents` |
| Custom roots | `custom`, plus any source a deployment adds |

A source this page does not know falls into **Custom roots** rather than disappearing: the page reports what the composition resolved, not a whitelist of root names it recognizes.

### Rows

Each row carries the skill name, its description, its optional `whenToUse` guidance, whether the model can invoke it as well as the user, the discovery source, and the provider that owns the body. Ranks that lost a name collision are not listed — the table shows the winning skill per name, which is what an invocation resolves to.

### Before a Session exists

The catalog is the Session's own composition, so the page asks the Host for nothing while no Session is open and says so, instead of showing an empty catalog that would read as "no skills installed". A Session whose preset resolves no skill reports that separately.

## Understand the implementation

`SkillsStore` owns the page snapshot — status, error, addressed Session, rows — and the cancellation rule behind it: a read a newer read superseded never publishes, and closing the Session supersedes an in-flight read with the empty state. `SkillsSection` renders that snapshot through the injected `useSnapshot` hook, groups rows with the fixed table above, and re-reads when the current Session changes. The Session id comes from the shared `useSessions` seat, read as "no Session" until the Session list reports itself ready.

## Further Exploration

- [Skill provider registry](../../skill/skill/README.md) — the Service Definition whose merged catalog this page renders.
- [Local filesystem provider](../../skill/skill-filesystem/README.md) — the roots, ranks, and source names behind the groups.

## Model Experience

None, as this page reads the Session-addressed skills Remote and contributes no prompt text, tool, or session event of its own.

#### KV Cache effect

None of its own. The skills it lists are advertised by the Session's own composition; the page adds nothing to a request and reads no cached prefix.
## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits describe what this page cannot do and when it needs attention. They are current constraints, not a comparison with other skill managers or a task backlog.

- **No body preview** — the catalog carries summaries, not bodies, so the page shows the discovery source and the owning provider instead of the instruction text; reading a body needs a name-addressed read that only serves what the last enumeration returned, which is deferred until a consumer needs it.
- **No enable or edit action** — a skill is enabled by being present in a discovered root or by a plugin registering it, and neither is a settings document; the page refreshes instead of offering a write it could not honor.
- **Only the addressed Session's catalog** — presets compose their own skill layers, so the page shows what the open Session resolves rather than the union across every preset.
- **No browser-level end-to-end assertion covers this page** — the shipped specs drive the store and the section with stubbed props, and the assembled-surface check is manual.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open design questions and directions that are not decided. It is explicitly non-authoritative — shipped behavior, limits, and accepted rationale live in the sections above, the package code, and the linked Agent Notes.

- Whether the page should offer copying a non-registered skill into `~/.qilin/skills` is open; it needs a source pool of unregistered skills, which no QiLin deployment ships today.
- A per-skill body read would also power a diff between the winning skill and the one a higher rank shadowed; no consumer has asked for it.

</details>

**Runtime invariant:** No companion is published. The page's only relationships are its own snapshot and the injected slot face, and no independent observation of them can diverge.
