---
description: User-installed QiLin and DSH plugin management tab for Web Settings.
kind: package-reference
---

# @qilin/client-ui-settings-user-plugins

English | [中文](README.zh.md)

## Summary

This browser plugin adds the User plugins tab under Settings > Plugins. It lists profile bundle layers, checks npm latest versions, installs package specs, updates or uninstalls user layers, and searches GitHub's topic:dsh-plugin repositories. Mutation results show retained command output and tell the user when a QiLin restart is required.

## Use This Package

The package registers one settings.plugins.tab contribution and consumes only the generated pluginManager Remote. It owns transient loading, error, search, and operation state in the tab component; profile files and package-manager operations remain Host-owned.

## Model Experience

None. This UI does not change prompts, tools, or provider requests.

### KV Cache effect

None; no model request is made.

## Known Limitations and Deferred Work

- The tab cannot apply a newly installed bundle until the QiLin process restarts.
- Registry and GitHub availability depends on the network and Host service configuration.
- The tab currently exposes a package-spec input rather than a curated registry allowlist.
