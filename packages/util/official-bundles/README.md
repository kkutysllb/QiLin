---
description: "The installation-owned bundle lists the Host admits and the Plugins page renders, so no consumer keeps a copy of its own."
kind: "package-reference"
---

# @qilin-agent/official-bundles

English | [中文](README.zh.md)

## Summary

`@qilin-agent/official-bundles` holds one copy of every bundle list the QiLin installation owns by name: the built-in profile layers the Plugins page hides, the optional bundles its main and More lists rank, the bundles it marks Experimental, the names it no longer ships, and the public releases it offers for on-demand installation. The Host admits a bundle from these lists and the Plugins page renders from them, so a bundle name added here reaches both faces instead of drifting between a Host list and a client copy. The module holds plain strings and sets with no registry, service, or runtime state.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

### Place an official bundle on the Plugins page

`EXTENSION_BUNDLES` names the optional bundles the main list always holds, in order; `MORE_BUNDLES` names the Experimental ones held back until the profile enables them, which the More list ranks last; `HIDDEN_BUNDLES` names the layers with no page of their own: the built-in profile layers, the Agent Teams bundle the Session header switches, and the automation tasks layer that is always on. The page derives placement from these lists, so a new optional bundle joins `EXTENSION_BUNDLES` here rather than in a package-local copy. Placement reads admission as well: the More list holds the Experimental bundles alone, and every optional bundle outside `EXPERIMENTAL_BUNDLES` stays on the main list, so removing a name from that set promotes it there.

### Ask whether a bundle is Experimental, hidden, or on demand

`isExperimentalBundle(name)` answers from `EXPERIMENTAL_BUNDLES`, so the badge follows admission instead of a package-name prefix: a package that merely starts with `experimental-` is not marked. `isHiddenBundle(name)` and `isOnDemandBundle(name)` answer the other two questions over the same lists.

### Retire a bundle the installation stopped shipping

`RETIRED_BUNDLES` names bundles the product no longer ships. A profile that still lists one keeps booting: [`@qilin-agent/app-boot`](../../boot/app-boot/README.md#profiles) drops the name from `qilin.profile.bundles` while loading the profile and reports the removal, instead of failing on a bundle nothing installs. The set carries no placement behavior: a retired name appears in no offered list.

### Rename a bundle that moved

`RENAMED_BUNDLES` maps a retired package name to the bundle that replaced it after a package move. App-boot rewrites the name in `qilin.profile.bundles` and its `dependencies` key while loading a profile, writes the manifest back, and reports the rewrite once on stderr. A profile created before the rename therefore keeps booting on the shipped replacement instead of failing to resolve the old name; a profile that already lists the replacement keeps one row.

### Admit a release for on-demand installation

`ON_DEMAND_BUNDLES` names the public releases the Plugins page installs on demand; nothing named there ships inside the distribution. The generated offline catalog in `@qilin-agent/app-boot` carries one metadata entry per admitted name, and its freshness check rejects a catalog that disagrees with this list. The list is empty while QiLin ships no on-demand provider backend, and every consumer then offers nothing and shows no on-demand affordance.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The module is a data table plus three lookups: three `ReadonlySet` instances (including the retired names) and three `readonly string[]` lists, with no import outside the package. The two lists are ordered arrays because placement ranks by index; the membership questions read sets. Tests assert the invariants a consumer relies on: each offered name appears once across the two ordered lists, every offered name is Experimental, a built-in main-list entry, or on demand, no hidden layer appears in an offered list, and a retired name appears in none of them.

### Source map

| File | Role |
|---|---|
| [`src/bundles.ts`](src/bundles.ts) | The lists: hidden layers, main-list and More-list options, Experimental admission, retired names, and on-demand admission |
| [`src/placement.ts`](src/placement.ts) | The three membership questions over those lists |
| [`src/index.ts`](src/index.ts) | Package exports |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [App boot](../../boot/app-boot/README.md) — profile layers, optional-bundle admission, and the generated on-demand catalog.
- [Plugin manager](../../boot/plugin-manager/README.md) — the Host service that lists, installs, and switches these bundles.
- [Plugin manager page](../../client/ui-plugin-manager/README.md) — the Plugins page that renders the lists.

-----

<a id="model-experience"></a>
## Model Experience

None, as the installation-owned bundle lists only name packages the Host admits and the Plugins page renders.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The Experimental badge follows this list, not the package name** — an installed package outside `EXPERIMENTAL_BUNDLES` keeps no badge even when its name starts with `experimental-`; add the name here once it becomes an offered bundle.
- **One exact package name per entry** — the lists hold npm package names and admit no range or pattern form, because presence decides admission rather than version resolution.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The lists live in a util package rather than in the Host: the Plugins page runs in the browser and cannot value-import a Host package, so a Host-only table would force the page to keep a second copy — the drift this package exists to remove. Because the runtime surface is static data with no module identity, the package is listed in `DUPLICATE_SAFE_PACKAGES`, so two installed copies stay interchangeable.

</details>
