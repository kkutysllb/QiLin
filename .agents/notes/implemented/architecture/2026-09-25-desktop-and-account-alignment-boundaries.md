# Agent Note: Upstream account stack boundary

Status: implemented

English | [中文](2026-09-25-desktop-and-account-alignment-boundaries.zh.md)

## Problem

The desktop-shell half of this note (no desktop shell here, upstream desktop changes never ported) was reversed on 2026-10-09: the OpenKyLin repository merged into this one as `desktop/` and the engine dependency inverted to this working tree. See [the merge note](2026-10-09-openkylin-desktop-merged-into-qilin.md). This note now owns the account-stack boundary only; the retained web-side interfaces below still hold, consumed by the in-repo shell.

The fork kept preparatory code for the upstream account stack, which contradicts this fork's product shape: the account surface is QiLin's own ui-account design. Without a recorded boundary, upstream account commits keep inviting ports this repository must not take.

## Decision

QiLin's account surface is the own ui-account package with its `/api/auth` gate. The upstream deepseek-account stack — the account service, the deepseek account LLM provider, the account settings UI, and its quota UI — is never ported. The preparatory account-quota failure code left in the llm core for that stack is deleted; provider-neutral `QUOTA` remains the exhaustion code.

## Retained web-side interfaces

The desktop shell loads this repository's web frontend, so the web-side halves of its interfaces stay and evolve as ordinary web interfaces: the `packages/client/web` window-drag module with its `data-window-drag` markers, and the `qilinDesktop` / `__QILIN_SHORTCUTS_CONFIG__` globals that the shortcuts and boot paths read. The settings desktop-update bridge and indicator are not part of this set: that flow existed only for the pre-merge shell's updater and was removed with it.

## Alternatives considered

**Port the upstream account stack alongside ui-account.** Rejected: two account surfaces behind one browser product duplicate sign-in, credential, and settings state. The own ui-account design is the shipped surface; the upstream stack has no owner here.

## Consequences

The account surface stays single: ui-account behind `/api/auth`. The desktop shell decision now lives in [the merge note](2026-10-09-openkylin-desktop-merged-into-qilin.md).
