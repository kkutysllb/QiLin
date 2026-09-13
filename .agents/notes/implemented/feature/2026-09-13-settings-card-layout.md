# Agent Note: Settings card layout and QiLin project identity

Status: implemented

English | [中文](2026-09-13-settings-card-layout.zh.md)

## Problem

Settings needs a bounded detail presentation that stays readable across wide windows and exposes an explicit route back to the workspace. The shell also needs a shell-owned About page to explain the current project and carry its identity.

The existing QiLin brand provider owns a vector seal with both Chinese glyph outlines, but settings had no typed mark seats. A settings-specific fallback therefore needed an explicit rule: the visible project identity must contain both `麒` and `麟`, never a single-character approximation.

## Decision

The `sidebar.settings` occupant in `ui-settings-general` renders the active `settings.section` contribution inside a centered `.sectionCard`. The layout remains local to the shell and does not introduce a shared `SettingsCard` primitive.

The shell registers an `about` section at order `10_000`. It removes that row from the main navigation list and renders it in a pinned footer position. The About section is a slot-composed component with `PropsRuntime<'settings.section'>`, `PropsRenderSlots<'settings.about.mark'>`, and `PropsLocale<'settings'>`; its localized description and signature are shell-owned copy.

The header renders a localized **Back to workspace** capsule whose handler is the existing `onClose` callback. The button, mask, close icon, and Escape key therefore leave the panel through the same state transition.

`@qilin/client-ui-settings` declares `SettingsMarkOwnerProps` and one root-scoped single slot: `settings.about.mark`. The QiLin brand provider registers `QilinSealArtist` into that seat through a declaration-aware chain, so the settings registration does not depend on the sidebar or conversation hero declarations. When a mark seat is empty, the localized `about.logoMark` fallback is exactly `麒麟` and remains visible as two characters.

All new visible copy, accessibility labels, and fallback text live in the typed `settings` dictionaries. The section-card styles use existing `--dsw-*` tokens and satisfy the repository's elevation, corner-shape, and hairline-border rules.

## Alternatives considered

**Create a shared `SettingsCard` primitive.** Rejected. The existing [shared client control primitives decision](../architecture/2026-09-05-shared-client-control-primitives.md) records that settings cards across feature packages have different interaction semantics; this shell only needs a local presentation layout, so a new cross-package primitive would add API surface without a second current consumer.

**Make About a feature contribution.** Rejected. About describes the shell's current project and owns copy that belongs to no feature. Keeping it in `ui-settings-general` gives the shell a stable footer entry while the logo remains replaceable through slots.

**Use a single-character mark fallback.** Rejected. A single glyph is ambiguous and does not represent the required 麒麟 identity. Both the rendered provider mark and the localized fallback carry 麒 and 麟.

**Give the return capsule a separate close callback.** Rejected. The shell already owns the close transition used by the mask, close button, and Escape listener; another callback could diverge in focus restoration and open-state cleanup.

## Consequences

Settings details now have a bounded visual measure and a single-column path at every width. The navigation has a stable shell-owned About destination even when feature rows change. The About mark can be replaced by another brand provider without changing the shell component.

The mark slot is root-scoped and single-valued; a composition that omits a brand provider still receives an explicit two-character fallback rather than a blank or one-character mark.

## Testing

Focused component tests cover localized About copy, the 72px mark owner request, provider and fallback rendering, bottom navigation placement, About selection, and the workspace return action. Registration tests cover the About section child declaration, brand-slot disposal, and declaration-aware re-registration. The GUI test lane covers the elevation and corner-shape stylesheet contracts.
