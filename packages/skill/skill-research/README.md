---
description: "Bundled scientific research workflows for the research lifecycle, from scoping and literature review through experiments, statistics, writing, figures, peer review, citation audit, and grants."
kind: "package-reference"
---

# @qilin-agent/skill-research

English | [中文](README.zh.md)

## Summary

Agents can load ten scientific research workflows on demand: an end-to-end project orchestrator, evidence-driven manuscript writing, literature review, paper review, experiment design, statistical analysis, publication figures, citation audit, deep web research, and grant writing. Every body is self-contained and uses the deployment's existing file, shell, web, and Python tools; the package ships instructions and no executable helpers. The provider contributes catalog entries only when mounted beside the skill registry and the model-facing skill tool.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the provider beside `@qilin-agent/skill` and `@qilin-agent/tool-skill`. The Web bundle mounts it by default, so Web and Desktop profiles expose the catalog; a headless or SDK deployment adds the row explicitly.

```yaml
- name: '@qilin-agent/skill-research'
```

| Field | Default | Meaning |
|---|---|---|
| `assetRoot` | Packaged `assets/` | Absolute directory containing the ten skill folders; packaged carriers can place it outside an application archive. |

| Skill | Use it for |
|---|---|
| `scientific-research` | End-to-end or whole-manuscript work: scope, artifacts, stage gates, routing, and completion audit. |
| `research-writing` | Drafting or revising sections, abstracts, papers, and theses with evidence-driven paragraphs and natural academic prose. |
| `literature-review` | Search logs, screening, evidence maps, thematic synthesis, and research-gap arguments. |
| `academic-paper-review` | A structured reviewer report or a pre-submission adversarial self-review. |
| `experiment-design` | Hypotheses, protocols, controls, sample size, method-to-experiment traceability, planning data, and reproducibility. |
| `statistical-analysis` | Test or model selection, assumptions, effect sizes, confidence intervals, multiplicity, and reporting. |
| `scientific-figures` | Data manifests, publication-quality plots, accessible color, diagram specifications, and captions. |
| `citation-audit` | Record verification, claim-level support, retraction checks, duplicate detection, and style consistency. |
| `deep-research` | Current multi-source web research with angle mapping, full-source reading, triangulation, and dated sources. |
| `grant-writing` | Funder fit, one-page concept, specific aims, research strategy, budget, review criteria, and resubmission. |

The skills write project artifacts under `research/` by default when a project has no existing paper layout: `plan/` for scope, progress, evidence maps, protocols, and review; `refs/` for search logs and records; `data/` and `figures/` for reproducible analysis; and `chapters/` or `manuscript/` for prose. The orchestrator records a project's existing layout instead when one is present.

The instructions use `web_search` and `web_fetch` for external sources and the deployment's Python environment for statistics and plotting. Missing packages are reported or installed with the user's consent; no skill assumes a fixed conda environment or a bundled scholarly API client.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Activation reads each packaged `SKILL.md` frontmatter and fails loudly on a missing skill, a missing description, or a relative asset root. It registers one `bundled` candidate per skill at the packaged rank, with model and user invocation both enabled. The skill tool loads a body on demand; the provider strips frontmatter and returns the Markdown body. Bodies are self-contained, so the candidate resource base is opaque rather than a directory of assets the model would need to read.

| File | Responsibility |
|---|---|
| [`src/index.ts`](src/index.ts) | Provider registration, asset validation, and frontmatter parsing. |
| [`assets/`](assets/) | Ten instruction bodies, one directory per skill. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Skill registry](../skill/README.md) — discovery, precedence, and the provider contract.
- [Skill tool](../tool-skill/README.md) — the session catalog and model-facing loader.
- [Office skills](../skill-office/README.md) — document authoring and structural checks.
- [Web tools](../../web/tool-web/README.md) — the search and fetch tools the research instructions call.
- [Workspace dependencies](../tool-workspace-dependencies/README.md) — locating the deployment's Python and Node payload.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through `qilin-tool-skill`, which renders the catalog entries and the selected instruction body.

#### KV Cache effect

Mounting the provider appends ten catalog entries to the existing skill-catalog context. Loading a skill appends its instruction body at the skill tool's insertion point; neither path replaces an earlier prompt section.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The package provides no scholarly database API client. Literature search uses the deployment's web tools and public endpoints; offline deployments cannot search.
- Citation verification depends on accessible DOI, PubMed, arXiv, or publisher records. A source that cannot be resolved remains unverified and must not be presented as checked.
- Statistical and plotting instructions require packages such as `numpy`, `scipy`, `statsmodels`, `pingouin`, or `matplotlib`. The package does not install them, and the bundled Python payload may not include all of them.
- The skills are instructions, not validators. They cannot prove that a citation exists, that a statistical test was run, or that a figure was rendered; the agent must execute and observe those checks.
- Domain-specific reporting guidelines and funder rules vary by venue and change over time. The agent must read the current author guide or call rather than rely on a generic checklist.
- The provider does not ship project-specific templates, dataset connectors, or reference-manager integrations.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The bundled bodies adapt research workflow methods from the MIT-licensed `research-writing-skill` project, the internal KSkills research collection, `academic-research-skills`, and `Scientific Agent Skills`. Attribution and license texts are in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). Edit the `assets/*/SKILL.md` bodies directly; the provider reads them at activation and load time, and the package tests enforce catalog order, body budgets, and malformed-asset rejection.

</details>
