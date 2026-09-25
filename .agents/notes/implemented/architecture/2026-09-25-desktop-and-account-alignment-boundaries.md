# Agent Note: Desktop shell and upstream account stack boundaries

Status: implemented

English | [中文](2026-09-25-desktop-and-account-alignment-boundaries.zh.md)

## Problem

The fork carried the upstream desktop shell (the Electron application and its private Node-mode host) and kept preparatory code for the upstream account stack. Both contradict this fork's product shape: QiLin's desktop client is built as a separate project, and the account surface is QiLin's own ui-account design. Without a recorded boundary, upstream desktop and account commits keep inviting ports this repository must not take.

## Decision

The desktop shell directories are deleted from this repository, together with their packaging, signing, update, and release tooling, the desktop-only settings update surface, and the desktop runtime-lock input of third-party-notice generation. Upstream desktop changes are never ported here. The `desktop` profile name stays reserved for the separate QiLin desktop application, and the public CLI rejects `--profile desktop` instead of managing its files.

The account stack boundary is decided the same way: QiLin's account surface is the own ui-account package with its `/api/auth` gate. The upstream deepseek-account stack — the account service, the deepseek account LLM provider, the account settings UI, and its quota UI — is never ported. The preparatory account-quota failure code left in the llm core for that stack is deleted; provider-neutral `QUOTA` remains the exhaustion code.

## Retained web-side interfaces

The desktop shell loads this repository's web frontend, so the web-side halves of its interfaces stay and evolve as ordinary web interfaces: the `packages/client/web` window-drag module with its `data-window-drag` markers, and the `qilinDesktop` / `__QILIN_SHORTCUTS_CONFIG__` globals that the shortcuts and boot paths read. They are kept because the separate desktop project consumes them against the shipped web build; deleting them would force that project to fork the frontend. The settings desktop-update bridge and indicator are not part of this set: that flow existed only for the deleted shell's updater and was removed with it.

## Alternatives considered

**Keep the desktop shell until the separate project reaches parity.** Rejected: this repository neither builds nor releases the desktop product, so the shell had no consumer here while every reference — tsconfig aggregates, the workspace build list, release families, third-party notices, and the client i18n scan — paid maintenance cost.

**Port the upstream account stack alongside ui-account.** Rejected: two account surfaces behind one browser product duplicate sign-in, credential, and settings state. The own ui-account design is the shipped surface; the upstream stack has no owner here.

**Delete the window-drag and `qilinDesktop` interfaces with the shell.** Rejected: they are contracts the surviving web build honors for the external desktop project, not shell implementation.

## Consequences

Repository-wide references to the desktop tree are gone, and the frozen Agent Notes about desktop packaging, updates, and installers moved to the archive; their paths describe the removed tree. Qualification coverage that consumed the shell's preload bridge or exercised the deleted host's workspace-dependencies plugin moved with its subject; the separate desktop project owns that qualification there.
