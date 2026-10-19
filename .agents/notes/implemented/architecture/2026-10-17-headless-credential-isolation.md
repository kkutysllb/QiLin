# Agent Note: Headless jobs omit the interactive credential store

Status: implemented

English | [中文](2026-10-17-headless-credential-isolation.zh.md)

## Problem

A credential the user saves through the GUI becomes effective for every profile that mounts the store. A headless one-shot job sharing the same harness home would then authenticate with that saved key instead of the key the invocation supplied — the wrong actor for CI steps and batch pipelines, and a surprise when the job picks up a credential the GUI session saved after the pipeline was written.

## Decision

The shipped headless bundle disables the base credentials row (`packages/bundle/headless/cordis.patch.yml`), so one-shot jobs resolve keys through the launch snapshot only: the process environment, then the invocation directory's `.env`, then `$QILIN_HOME/.env`. The profile never reads, migrates, writes, or deletes `.credentials.yaml`. QiLin's base composition mounts no authorization or account consumer, so no further rows need disabling. `apps/cli/tests/profiles/headless/tests/credentials.e2e.ts` covers the three environment layers, named and native pi-ai authentication, missing and empty keys, ignored malformed storage, and restoration through a `--patch` overlay. The headless README's Credentials section owns the user-facing restoration recipe.

## Alternatives considered

**Rely on the global environment-first resolution alone.** Without disabling the row, a job launched with no key in its environment still reads saved credentials, so isolation would depend on every caller unsetting variables before every invocation.

**Add a precedence mode to the shared store.** It puts composition policy into the shared provider when profile patches already supply the required behavior.

## Consequences

- Headless ignores saved API keys, provider records, and grants. A provider requiring stored sign-in fails until the user restores the row through the documented overlay; the launch environment keeps precedence over a restored store, per credentials-local's resolution order.
- Environment and external provider credential chains remain available. Sessions, settings, and tools stay composed; omitting the store does not restrict filesystem reads by tools.
- Web, SDK, and ACP profiles keep the credential store; their authentication, login, and refresh flows are unchanged.
