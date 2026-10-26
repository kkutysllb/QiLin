---
description: "The product event map the desktop reports usage against, without the collector that upstream ships beside it."
kind: "package-reference"
---

# @qilin-agent/client-product-analytics

English | [中文](README.zh.md)

## Summary

`@qilin-agent/client-product-analytics` publishes the event names and field types the desktop reports product usage against, plus the desktop renderer's `./client` sender that reports them through the Host's authenticated analytics Remote namespace. It carries no collector: the upstream package's Host plugin, its generated Typert faces, locale files, and environment sampling depend on host packages this repository does not have yet.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Import the map where an event is declared and the event type where one is sent:

### Navigation, preset, and new-session events

Official navigation reports New Session, Plugins, Automation tasks, and More clicks with their physical placement: `sidebar`, `sidebar_more`, or `titlebar`. Opening Automation tasks from the left sidebar More menu counts as `sidebar_more`, not as a direct sidebar click. Historical `sidebar_menu_click` records without `position` remain unattributed. More-menu actions distinguish the sidebar, conversation, and rightbar regions. Third-party entry identifiers and custom preset names are excluded.

Direct preset switches report accepted different choices in the mode picker: an unbound staged choice, or Host application for a blank Session. Custom source modes are `other`, and only built-in targets are reported. Default changes, automatic fallback, restoration, and Creator launchers are excluded. Each switch records the Coding Tools setting known at the action; an unknown setting reports nothing. `code_work_view_toggle` reports a successful change of that setting.

`send_button_click` carries `is_new_session`, which is true while the submitting Session is still blank, and `agent_preset`, the Session's preset as `creator`, `ptc`, `minimal`, `standard`, or `other` for a custom preset; `agent_preset` is omitted while the preset is unknown.


<a id="dev-note"></a>
## Dev Note

The upstream package is `the upstream client/product-analytics package` in `deepseek-harness`; its host half depends on `@deepseek-ai/dsh-host-product-telemetry-otel`, which has no counterpart here yet.

## Model Experience

None, as analytics adds no model context or Session events.

#### KV Cache effect

None; collection does not modify model requests.

## Known Limitations and Deferred Work

- The collector, its Host Remote methods, and the locale files are not ported. The `./client` sender needs the analytics Remote namespace the desktop Host serves; nothing in this repository mounts it, so the sender stays unused until the Host half lands.
- The desktop reports against these events through its own sender, which lives in the desktop application rather than here.
