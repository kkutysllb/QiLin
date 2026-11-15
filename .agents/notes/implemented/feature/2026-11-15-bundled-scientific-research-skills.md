# Agent Note: Bundled scientific research skills

Status: implemented

English | [中文](2026-11-15-bundled-scientific-research-skills.zh.md)

## Problem

Scientific research tasks cross literature search, evidence synthesis, experiment design, statistical analysis, figures, manuscript writing, citation checking, peer review, and grant preparation. The engine shipped document-authoring skills but no research workflow, so an agent had to improvise the evidence and review gates that keep a paper traceable. Installing a separate third-party skill pack per project also made the available catalog depend on the user's setup.

## Decision

The [research provider](../../../../packages/skill/skill-research/README.md) contributes ten self-contained skills at the bundled rank: `scientific-research`, `research-writing`, `literature-review`, `academic-paper-review`, `experiment-design`, `statistical-analysis`, `scientific-figures`, `citation-audit`, `deep-research`, and `grant-writing`. The Web bundle mounts the provider, so Web and Desktop profiles advertise the catalog. Headless and SDK profiles stay lean and pay the catalog cost only when a deployment adds the row.

The bodies are self-contained Markdown with an opaque resource base; the provider reads each description at activation and each body on demand. No bundled script, database client, or Python environment is included. The instructions use the deployment's existing file, web, shell, and Python tools, and state the gates and artifacts a research task must produce. A configurable absolute `assetRoot` supports carriers whose application archive is not readable by the model's file tools; the package tests cover relocation, malformed metadata, catalog order, disposal, and body budgets.

The methods adapt the MIT-licensed [research-writing-skill](https://github.com/norman-bury/research-writing-skill), the internal KSkills research collection, [academic-research-skills](https://github.com/VincenzoImp/academic-research-skills), and [Scientific Agent Skills](https://github.com/K-Dense-AI/scientific-agent-skills). Attribution and license texts ship in the package's `THIRD_PARTY_NOTICES.md`.

## Alternatives considered

**Copy the upstream skill trees verbatim.** The upstream packs carry platform-specific hooks, scripts, and nested module routing that do not fit QiLin's skill provider, and copying them would add a second workflow system to maintain. The new bodies preserve the methods while keeping one catalog shape.

**Ship the literature-search Python script.** The upstream script depends on external APIs and Python packages that the bundled runtime does not guarantee. Research instructions instead query the same public endpoints through the existing web tools and report missing network or package access honestly.

**Create one package per research skill.** Ten small packages would multiply bundle rows, manifests, and tests without an independent lifecycle. One provider keeps the catalog and attribution in one place; a skill can still be edited or removed without touching the provider.

**Add a dedicated scholarly-search tool now.** A model-facing tool could reduce query construction work, but it also adds rate-limit, credential, and result-shaping contracts. The current skills can reach Crossref, PubMed, arXiv, and Semantic Scholar through `web_fetch`; a dedicated tool remains a separate capability decision.

## Consequences

Web and Desktop profiles gain ten catalog entries and their descriptions; loading a skill adds only that body. Headless and SDK profiles are unchanged unless they mount the row. The skills cannot prove a citation exists, a test ran, or a figure rendered, so agents must execute and observe those checks. Offline deployments cannot search, and statistical or plotting code depends on packages the bundled Python payload may not include. Updating a method requires editing the bundled asset and its tests; no upstream synchronization is automatic.
