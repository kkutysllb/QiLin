# Agent Note: The desktop menu bar follows the standard application menus

Status: implemented

English | [中文](2026-10-28-desktop-standard-menus.zh.md)

## Problem

The desktop menu exposed the application lifecycle only: About, Check for Updates, Manage qilin Command, Hide, and Quit on macOS, a single File menu with Close, and, on Windows, a caption bar with two popups (Application and Edit). Session and workspace entry points, pane visibility, zoom, window commands, and any Help destination were missing, so the application read as a shell around the Web page rather than a desktop product, and the same commands were reachable only through the Web client's own controls.

## Decision

- [`apps/desktop/src/application-menu.ts`](../../../../apps/desktop/src/application-menu.ts) owns one menu definition. It returns the native template for macOS and Linux and `[]` for Windows, whose title bar draws the caption menus from the same definition through `captionMenu`.
- The bar carries Application, File, Edit, View, Window, and Help on macOS and Linux. Windows draws File, Edit, View, and Help in the title bar and keeps only the hidden developer shortcuts on its native menu, because a native menu bar would duplicate the title-bar buttons.
- File offers New Session, Search Sessions, Add Workspace, Settings outside macOS, Close Window, and Exit outside macOS. View toggles both sidebars, page zoom, and full screen, and holds the developer reload, force-reload, and DevTools entries. Help opens the project home and issue tracker and, outside macOS, carries Check for Updates and About. Development builds add Restart App and Host to the application or File menu.
- Renderer entries are built from `installDesktopShortcuts`'s `commandItem`: each shows the binding the user currently has, stays disabled until the Web client publishes its shortcut configuration, and dispatches its command id through the same `shortcuts-input` channel as a physical key. A customized binding therefore changes the accelerator and the dispatched command together, and the existing revision, recording, focus, and overlay guards apply unchanged.
- The menu rebuilds when any published binding, the command set, or the shell locale changes; the previous implementation rebuilt only for the close accelerator.
- Every label comes from the Desktop dictionary in `apps/desktop/src/locale.ts`, so English and Chinese stay key-aligned and the caption bar, native bar, and tray read the same strings.

## Alternatives considered

**Register the menu in the Web client and render it in the page.** The page already owns shortcuts, but a product menu must survive a not-yet-loaded or crashed page, and macOS requires a native menu bar; the shell would still need this definition.

**Keep roles and let Electron localize the labels.** Role labels follow the OS language rather than the application's own locale setting, so a user who selects Chinese in a Chinese-locale-less environment would see English menu items beside Chinese chrome.

**Fill the Windows caption bar with the application menu.** The title bar already shows the product name and window controls; a third application popup wastes space, and About, updates, and quit fit the File and Help menus Windows users expect.

## Consequences

The menu now names renderer commands the shell cannot verify at build time; a command id missing from the running client leaves the entry enabled with no effect, which is why the entries stay disabled until the client publishes its revision. Adding a menu entry for a new client command requires that command to be registered in the Web client and named in `application-menu.ts`; there is no dynamic contribution path, deliberately, so the menu cannot diverge from the shipped product.

## Verification

- `apps/desktop/tests/application-menu.spec.ts` pins the per-platform template, the caption sets, command binding propagation, and both Help destinations.
- `apps/desktop/tests/main-startup.spec.ts` boots the real main entry on each platform and asserts the built menu, the caption popups, and the About dialog.
- `pnpm exec vitest run` inside `apps/desktop` covers the suite; `tsc -p apps/desktop/tsconfig.host.json` typechecks the shell.
