# Settings Page Card Layout Design

English | [中文](2026-09-13-settings-card-layout-design.zh.md)

## Background

The settings page uses a full-window content column, with form rows laid directly across the content area and no clear page boundary or nearby route back to the workspace.

This design changes settings details to centered content cards, preserves the existing settings slots, navigation ledger, connection recovery, onboarding flow, and configuration-file operations, and adds a workspace return action plus an About entry.

## Goals

- Show one bounded primary card for every settings section.
- Provide an identifiable Back to workspace capsule in the upper right and reuse the existing settings close behavior.
- Provide an About QiLin entry at the bottom of the left navigation.
- Use the existing QiLin two-character seal component for project identity; the seal must contain both 麒 and 麟, with no single-character text or fallback.
- Keep every detail page in a single-column, scrollable layout at every width.
- Preserve the existing settings slots and persisted settings document format.

## Visual Structure

The settings panel remains composed of a mask, navigation rail, and content area. The navigation rail keeps its resizable width, feature sections follow ledger order, and the About entry stays pinned at the bottom of the rail.

The content header keeps the settings title, existing configuration-file actions, and close button, and adds a Back to workspace capsule on the right. The return and close buttons call the same shell close handler, so mask clicks, Escape, the close icon, and the return button have the same result.

The content detail card uses a bounded width, low-contrast border, and theme elevation. Card titles, descriptions, and settings-row copy remain owned by the feature plugins; the shell owns the card container, spacing, and scroll boundary.

Every detail page uses one primary card that owns the content width. The About introduction lives only on its own page, reached through the bottom navigation entry.

The About QiLin page uses the same primary card container and shows the seal, project description, and project signature. It does not render an empty version placeholder when version information is unavailable.

## Components and Data Flow

`SettingsRoot` continues to own panel visibility, the active section, navigation width, and onboarding completion state. It passes `close` to `SettingsPanel` and continues to render feature sections through `renderSlot('settings.section', ...)`.

The settings shell registers the About section as a `settings.section` entry with the fixed id `about` and an order after feature sections. The navigation ledger therefore remains the projection produced by `useSections`, and the active section is still rendered through the `only` filter.

The About component receives only localized copy and the display parameters required by the brand slot. It does not read ctx, access remote services, write the settings document, or enter the Session or model request.

The Back to workspace button uses the `onClose` callback from `SettingsPanel`. The About page owns the brand mark seat and fallback value; its explanatory copy remains in the settings locale dictionary.

## Localization

The `settings` namespace in `ui-settings-general` adds English and Chinese keys for the workspace return action, About entry, About title, project description, project signature, project identity, and related accessibility names.

Visible copy for existing feature-plugin settings rows remains owned by each feature locale namespace; the shell does not duplicate or rewrite it.

## Responsive and Accessibility

Navigation controls continue to use button semantics and `aria-current` for the active section. The Back to workspace button has a clear localized accessible name, and the close button continues to receive its name through the hidden-text seat.

The detail card stays centered within the content width at every breakpoint and prevents horizontal overflow from the detail card or settings rows.

Only the settings content area scrolls; the navigation rail and header actions remain visible. Cards, buttons, and rows keep stable dimensions so copy changes do not shift the layout.

## Testing

Existing settings shell tests continue to cover navigation selection, active-section projection, close paths, resizable navigation width, connection recovery, and onboarding ownership.

Component tests cover the About navigation item at the bottom, About content after selection, the seal, the workspace return button invoking close, and the absence of an empty version placeholder.

Run `pnpm run test:gui` to verify client components and Host GUI packages. Run `QILIN_SNAPSHOT=replay pnpm run test:web` to verify the assembled browser page preserves existing settings flows. Use browser screenshots to inspect centered cards, button placement, wrapping, and the absence of overlap at desktop and narrow widths.

## Non-goals

This change does not add settings document fields, alter the settings slot protocol, change feature-plugin configuration behavior, modify the account menu settings entry, add network requests, or modify session logs or model prompt content.
