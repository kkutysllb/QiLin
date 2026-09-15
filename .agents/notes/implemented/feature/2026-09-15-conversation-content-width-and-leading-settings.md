# Agent Note: Conversation content width and leading settings rows

Status: implemented

English | [中文](2026-09-15-conversation-content-width-and-leading-settings.zh.md)

## Problem

The conversation area exposed two adjustable dimensions with no user-facing control. The transcript content width existed only as an undocumented browser-local value written by the rectangular drag handles on either side of the transcript, so it was invisible in the settings surface and silently lost when browser storage cleared. Message line height was entirely fixed — the Markdown leading ladder scaled with font size but offered no user adjustment, while the font-size row proved the settings table already had room for a typography axis.

The request: a General-section card in the settings page to adjust message-area width and line spacing, consistent with the existing cards.

## Decision

Rows, not a card. The settings page composes already-shipped cards from `settings.general.item` registrants, so the two adjustments ship as rows inside the existing General card: `content-width` (`ui-conversation`, order 14) and `line-spacing` (`ui-theme`, order 13). Both reuse the font-size row's stepper-pill rhythm and shared `settings-row.module.css`.

**Width — one setting, one owner.** `ui-conversation`'s settings namespace gains a `contentWidth: number` field (`640..2400`, step 20, default `0`). `0` is the adaptive sentinel: schemastery has no nullable option, and `null` would short-circuit into fallbacks, so the durable bound is an explicit non-negative integer where `0` means "stay on the column clamp" (`clamp(680px, 64% of column, 920px)`). `ConversationLayoutPolicy` (new) owns the value: it wraps the settings scope, publishes a live `SnapshotStore<number>` into the hooks compartment, and is injected as a bound-actions face to both the general-section row and the conversation root's drag handles. The handle commit path (`resolveContentWidth` — rounded, clamped against `column − 176`) and `setContentWidth` write the round-trippable stored value; the root applies `explicitWidth(stored)` after every publish. The browser-local `qilin.conversation.contentWidth` key is read exactly once on first seed, promoted into the namespace, and removed — a one-time migration; a corrupt value is dropped silently and the adaptive default stands.

**Leading — a delta over every scale tier, not a width.** 「行间距」 is line height, applied to message text. `ui-theme`'s namespace gains `leading: number` (`-2..8`, step 1, default `0`, in px). Every leading term in the Markdown ladder's `gradient-shadow-text.css` becomes `calc(<tier px> + font-size delta + var(--qilin-content-leading))`, so heading hierarchy and the font-row's coupling are preserved and `0` is pixel-identical to today. `--qilin-content-leading: 0px` declares the body default; `ThemeRuntime.setLeading` validates the range and the host persists it, and `theme-presenter.ts` publishes `${leading}px` to the variable with the same snapshot-apply/dispose discipline as font size.

**First paint without flash.** `boot-theme.ts`'s inline script sets `--qilin-content-leading` alongside the pre-painted preference and font-size variables, so a stored leading is active before the first frame. The width variable stays in `ConversationRoot` and settles after the settings mirror loads — one frame late on a custom-width page load.

**Model-visible surface.** `setLeading` joins the Client theme Service and the generated inspect catalog; `snapshot.leading` joins `ThemeSnapshot`.

All copy lives in the typed `conversation` and `settings.theme` locale dictionaries; all styles use `--dsw-*` tokens.

## Alternatives considered

**A new settings card container.** Rejected: rows in the existing General card match the shipped composition model, and the [settings card layout note](2026-09-13-settings-card-layout.md) already rejected a shared card primitive.

**`null` for adaptive width.** Rejected: schemastery offers no nullable field, and a nullable input falls through `Schema.resolve` into defaults, making "no width" indistinguishable from "unset". The `0` sentinel keeps one number and one switch.

**A dedicated global variable beside `--qilin-chat-content-width`.** Rejected: the settings table and the drag handles would then race for two owners, exactly the split this note collapses into one value.

**Leading as an absolute line height setting.** Rejected: an absolute value would clip or stretch differently per font-size tier and per heading level; the additive delta preserves every ratio and keeps the current default at exactly 0.

**localStorage only, no settings row.** Rejected for width: it was the original mechanism and is invisible to the settings surface. Kept only as the one-time migration source, then removed.

## Consequences

The width setting and the drag handles are the same control: dragging commits into the namespace, and the settings row exercises the same `setContentWidth` as the handles. Clearing browser storage no longer loses a custom width. The legacy localStorage key is gone — sessions relying on it are migrated once, then it is unreachable.

The width value replays one frame after custom-width load because the settings mirror lands after mount; the leading variable paints before the first frame.

`ThemeSnapshot` and the inspect catalog gained `leading`/`setLeading`, and the bundling check now expects consumers of those surfaces to accept them. The `0` sentinel means stored widths of exactly `0` cannot express "custom 0px width" — out of scope by the clamp floor (`640px`) anyway.

## Testing

Row-renderer specs cover localized copy, stepper bounds, the adaptive sentinel including the up arrow's " customize at floor" behavior, and the reset action. `ConversationLayoutPolicy` specs cover seed, override precedence, adaptive unset, the legacy-key migration and its corrupt-value path, and pendingSeed supersession. Root specs cover the width-variable publish and handle-commit round-trip. Theme specs cover leading seeding, rejection outside `-2..8`, snapshot adoption, and the inline boot script's leading assignment. Wiring specs pin the registration rosters and bound-share fan-out.
