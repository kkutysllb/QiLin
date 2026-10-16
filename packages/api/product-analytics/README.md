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
