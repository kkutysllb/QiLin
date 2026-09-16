---
description: Profile-scoped Remote service for installing, updating, removing, and discovering QiLin or DSH bundle plugins.
kind: package-reference
---

# @qilin/host-plugin-manager

English | [中文](README.zh.md)

## Summary

The plugin manager exposes the Web Settings user-plugin workflow through the pluginManager Remote. It reads the active profile, runs profile-local pnpm mutations, reconciles QiLin and legacy DSH bundle metadata, and reports a bounded output tail with restart-required semantics. Community discovery uses GitHub topic:dsh-plugin search and update checks use npm dist-tags.

## Use This Package

Mount the Host service in a profile composition and consume it through the generated Remote assembly. The service never edits the live Loader tree: a successful install, update, or uninstall changes profile files and requires a QiLin restart before the new bundle layer is composed.

A mutation whose reconcile finds an upstream DSH-era engine package installed in the profile fails with the same diagnostic the CLI prints — each colliding package, the QiLin package it maps onto, and the removal command — and the profile's bundle list stays unchanged. An upstream engine copy resolves ahead of the compatibility fallback, so activating it would load a second engine instance.

A profile that has never been initialized has no manifest and lists no layers rather than failing the listing. Each listed layer reports `updatable` and `removable` from its resolution channel. A shipped layer is never removable; one the profile owns (`PROFILE_OWNED_BUNDLES`) still upgrades in place, and `updatePlugin` reaches it with `pnpm add <name>@latest` so the installed copy wins resolution over the installation seed. Layers that move with the installation, and every other shipped layer, report `updatable: false`.

## Model Experience

None. This package serves Settings UI operations and does not add model-visible behavior.

### KV Cache effect

None; no provider request is assembled.

## Known Limitations and Deferred Work

- Package operations require pnpm on PATH and a writable profile directory.
- GitHub and npm lookups depend on network availability and return no registry version when a request fails.
- The current manager does not provide rollback after a pnpm process has committed its package files.
