# Agent Note: Message headings ride the Heiti family by default

Status: implemented

English | [中文](2026-11-12-heiti-heading-face.zh.md)

## Problem

The content typography ladder put every Markdown heading (h1–h4) and the conversation hero title on `--qilin-font-family-heading`, whose default was a system serif (Songti SC and friends). Message headings therefore rendered in a face distinct from the Heiti body text. The Owner asked for message rendering to default to Heiti, so the conversation area reads as one sans-serif surface.

## Decision

`--qilin-font-family-heading` in `packages/client/ui-theme/src/styles/base.css` defaults to the system Heiti stack: `PingFang SC`, `Hiragino Sans GB`, `Noto Sans SC`, `Source Han Sans SC`, `Source Han Sans CN`, `Microsoft YaHei`, then the Latin sans fallbacks. The Markdown ladder in `gradient-shadow-text.css` and `HeroShell.module.css` keep consuming that one variable, so the size and weight tiers are untouched.

Body text (`--qilin-font-family-text-default`), code, and the sidebar terminal keep their stacks, and the configurable font roles stay `text`, `code`, and `terminal`. The variable remains the single override point: a deployment that wants a display face sets `--qilin-font-family-heading` without touching the ladder.

The brand landing and auth pages keep their own serif variables (`--font-serif`, `--ql-font-serif`); they are marketing surfaces outside message rendering. `docs/web-styling.md` and its Chinese counterpart state the Heiti default and keep the heading face with the theme owner.

## Alternatives considered

**Keep the serif and add a settings row for a heading face.** A user-selectable heading face is a fourth font role with its own schema field, persistence, localized copy, and test surface, for a preference the Owner has already fixed; the CSS variable already gives a deployment its override.

**Fold headings into the body family and delete the variable.** This would hard-code the body stack in `gradient-shadow-text.css` and `HeroShell.module.css` and leave no single place for a deployment to give headings a display face.

**Make the body serif instead.** This is backwards: the request is Heiti for message rendering, and the body stack also drives UI chrome and every tool row.

## Consequences

Message headings now share CJK shapes and stroke weight with body text, so hierarchy rests on size and weight rather than a face change. The paper palette, collapsed radius scale, and reading surface are unchanged. Restoring a serif default means editing one variable; a deployment that wants one today sets it in its own stylesheet.

No stored preference, Session field, or rendered-output snapshot asserted the heading family, so existing sessions and settings keep working unchanged.
