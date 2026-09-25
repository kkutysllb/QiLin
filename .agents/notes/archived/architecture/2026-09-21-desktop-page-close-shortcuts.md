# Agent Note: Desktop close shortcuts follow page focus

Status: implemented
Archived: 2026-09-25

English | [中文](2026-09-21-desktop-page-close-shortcuts.zh.md)

## Problem

The close command has two targets: the focused right-sidebar page, or the Desktop window when no page can close. Electron's native close role bypasses the page owner. On Windows, closing the last window also quits the Desktop instance and stops its Host tasks, so this fallback is a lifecycle choice rather than a menu-label change.

## Decision

The native half ships now. The macOS File menu carries the Close entry: it displays the accepted single-key binding and routes through the renderer's command dispatch instead of a native close role. Native closure requires the current configuration revision, a focused and enabled product window, and inactive shortcut recording; recording sessions and stale revisions are refused. The existing window lifecycle applies without a shortcut-specific confirmation: macOS keeps the application alive after its last window closes; Windows and Linux quit and stop the Host. [Shortcut preference persistence](2026-09-20-device-local-shortcut-preferences.md) owns accepted bindings and revision publication.

The page half — a client `page.close` owner that resolves close against live focus, captures the target's Session, pane, tab occurrence, and navigation revision, and closes that page through its resource cleanup handler — is deferred until the sidebar's focused-target machinery lands. Until it registers, the catalog carries the command with no effective binding, so the menu entry stays disabled and the native close role remains the only window-closure path.

## Alternatives considered

**Use Electron's native close role.** It closes the window without asking the focused page owner and cannot preserve page cleanup or the accepted custom binding's routing. The desktop guards above keep the routing seam ready without changing closure behavior.

**Register the page owner against QiLin's current sidebar controller.** The controller has no focused-target identity (Session, pane, occurrence, revision), so a close resolved through it could not distinguish a live page from a stale target; the command would either close the wrong page or need a whole second lifecycle. Deferring keeps the reserved catalog entry honest.

**Disable the Windows window fallback.** This avoids a task-stopping close shortcut but omits the Desktop fallback. The product keeps native window-close semantics; users who need the application to remain running can minimize it.

## Consequences

Close behaves identically to the native close role today: the desktop guards are dormant until the page owner registers, and the File menu entry says so by being disabled. On Windows and Linux, closing the last window can stop active tasks by quitting the instance; the command does not add a background Host lifetime or a task-aware shutdown confirmation. Desktop keyboard tests cover revision, focus, and recording guards; the page-owner work lands with its own focus and stale-target tests.
