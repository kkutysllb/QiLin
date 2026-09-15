---
description: "Runtime compatibility helpers that let QiLin load DSH-era plugin manifests and module names."
kind: "package-library"
---

# @qilin/dsh-compat

English | [中文](README.zh.md)

## Summary

This package keeps the DSH plugin ecosystem usable in QiLin. It selects a bundle or client declaration from either the native `qilin` manifest key or the DSH-era `dsh` key, and canonicalizes renamed DSH module specifiers onto QiLin module-table entries.

## Use This Package

Profile loading uses `bundlePatchOf` for `qilin.bundle.patch` and `dsh.bundle.patch`. The client module graph and browser loader use `clientDeclarationOf` and `dshCompatModuleId` so prebuilt DSH factories can keep their original `require()` names.

The exact platform aliases are exported as `DSH_PLATFORM_MODULE_ALIASES`. Unknown third-party names pass through unchanged; the compatibility layer does not replace service implementations or provide Electron-only APIs.

## Understand The Implementation

The manifest reader gives a QiLin declaration precedence when both keys exist. The module resolver applies explicit aliases first, then maps `@deepseek-ai/dsh-<name>` to `@qilin/<name>`; `client-runtime` maps to QiLin’s `client-modules` package. The browser shell seeds static platform aliases, while dynamic graph edges and factory requests are canonicalized at their owning loaders.

## Model Experience

This utility does not change model-visible prompts, tool schemas, session events, token budgets, or KV-cache behavior.

## Known Limitations and Deferred Work

DSH plugins that depend on engine-specific services, resource URL schemes, or Electron bridges still require per-plugin validation. This package handles manifest and module identity compatibility only; it does not emulate API drift between DSH and QiLin.

## Dev Note

The alias table mirrors the DSH-to-QiLin package renames used by the vendored coding-sidebar channel. Add a mapping only when a real DSH package or bundle requires it, and cover both graph ordering and browser `require()` behavior.
