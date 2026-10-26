---
kind: upgrade-guide
description: "QiLin checks plugin compatibility from `@qilin-agent/` peer ranges only; a manifest's `engines.dsh` range refuses nothing."
---

# `engines.dsh` stays advisory

English | [中文](guide.zh.md)

## Change

Upstream release 0.2.1-alpha.3 made a plugin's own `engines.dsh` range decide compatibility by itself, applied `peerDependencies` only when that range is absent, treated a `workspace:` value inside `engines.dsh` as incompatible, refused a manifest whose `engines` is not an object or whose `engines.dsh` is not a string, and renamed the refusal's `peers` field to `requirements`.

QiLin keeps `engines.dsh` advisory. `evaluatePluginCompatibility` in `packages/boot/app-boot/src/plugin-compatibility.ts` reads the `peerDependencies` that name `@qilin-agent/` harness packages and never reads `engines`; installation and profile startup use that result alone. The `requirements` rename is present, and its keys name peer packages. The vendored framework packages `@qilin-agent/kylin`, `@qilin-agent/cosmokit`, `@qilin-agent/schemastery`, and `node-addon-system`, plus `@qilin-agent/kylin-plugin-*`, are excluded because their versions move independently of a QiLin release.

A QiLin release version cannot satisfy an upstream plugin's `engines.dsh: ^0.2.x` range, so making that range decisive would refuse every DSH plugin before its peers were read. [`@qilin-agent/dsh-compat`](../../../../packages/util/dsh-compat/README.md) keeps DSH-era plugins loadable: it reads `dsh.bundle.patch` and `dsh.client` beside the QiLin manifest keys and canonicalizes renamed module specifiers; it does not emulate API drift between the two runtimes.

What follows for consumers:

- A package that declares only `engines.dsh`, with no peer range, is never refused by the compatibility check.
- An unmet `@qilin-agent/` peer range rejects an installation under the `incompatible-version` code, naming each unmet requirement, and profile startup refuses a package installed that way.
- The Discover listing annotates each market version from the index's `engines.dsh`; that annotation selects the version to offer and does not authorize an installation ([plugin market README](../../../../packages/boot/plugin-market/README.md)).

## Migration

1. Declare `@qilin-agent/` peer ranges for the runtime a plugin needs, because only those are checked. Keep `engines.dsh` accurate for upstream installations, but do not rely on it in QiLin.
2. Read `requirements` keys as peer package names. A key `engines.dsh` appears only in market-listing records.
3. To install a plugin whose peer range names a runtime version this QiLin does not satisfy, grant an exact-version exemption with `qilin plugin allow-version <package@version> --qilin-version <runtime> --accept-risk`, or with the plugin manager's exemption action. `qilin plugin version-exemptions` lists grants and `qilin plugin revoke-version <package@version> --qilin-version <runtime>` removes one. The grant is stored in the profile's `compatibility.json`, applies to the next composition, and is inherited by neither a plugin upgrade nor a QiLin upgrade ([plugin manager README](../../../../packages/boot/plugin-manager/README.md#version-compatibility-and-exemptions)).
4. Confirm: installing a package with an unmet peer range prints the exact `allow-version` command, and after the grant and a restart the plugin loads while `version-exemptions` lists the pair.
