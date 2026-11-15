---
name: scientific-research
description: Use when a research task spans multiple stages or a whole paper, thesis, or grant project, including scoping, evidence gathering, experiments, writing, review, and submission.
---

# Scientific Research

Run a research project as a sequence of evidence gates, not one drafting pass. The specialist skills carry the methods; this skill owns scope, artifact continuity, and the decision to advance a stage.

## Lock the scope before prose

Record these facts in `research/plan/project-overview.md`. Ask only for what the request does not already answer.

| Fact | Why it changes the work |
|---|---|
| Research question and claimed contribution | Every section and experiment must serve it. |
| Output type | Course paper, thesis chapter, journal article, conference paper, review, grant, or report. |
| Field, target venue, and template | Controls structure, length, citation style, and review criteria. |
| Language and audience | Determines prose conventions and terminology. |
| Available data, code, equipment, and ethics approval | Separates a design from an unexecutable promise. |
| Deadline and required deliverable format | Sets the depth of exploration and the final packaging step. |

For a new project, put artifacts under `research/`; if the project already has a paper directory, record that root in the overview and use it everywhere. Do not create empty directories for stages the task will not reach.

## Artifacts and gates

| Artifact | Owner skill | Gate before advancing |
|---|---|---|
| `plan/project-overview.md`, `plan/outline.md`, `plan/progress.md` | this skill | Scope is explicit and the outline has section roles and target lengths. |
| `plan/evidence-map.md` and `refs/search-log.md` | literature-review | Every core claim has a traceable source or is marked unsupported. |
| `plan/experiment-protocol.md`, `plan/method-experiment-traceability.md` | experiment-design | Each contribution maps to an experiment, table, or limitation. |
| Analysis tables, code, and `figures/data-manifest.md` | statistical-analysis, scientific-figures | Real and planning data are separated and reproducible. |
| `chapters/` or `manuscript/` | research-writing | Evidence and protocol gates passed; prose carries citations and conditions. |
| `plan/review/` | academic-paper-review, citation-audit | Citation audit and adversarial review completed before submission. |

Update `plan/progress.md` after each stage with what changed, what was verified, and the next action. A conversation-only plan is not a project artifact.

## Stage route

1. **Scope** - clarify the question, contribution, venue, and constraints; write the overview and outline.
2. **Evidence** - load `literature-review`; search, screen, extract, and synthesize. Load `citation-audit` before relying on any reference.
3. **Design** - load `experiment-design`; lock variables, baselines, metrics, controls, sample size, and analysis plan before seeing final results.
4. **Analysis and figures** - load `statistical-analysis` and `scientific-figures`; keep every number traceable to raw data, code, and a manifest.
5. **Draft** - load `research-writing`; write section by section from the evidence map and protocol, not from memory.
6. **Review** - load `academic-paper-review` for an adversarial read and `citation-audit` for a final reference check. Fix the artifact, then re-run the gate.

Load `deep-research` for current external context that is not a scholarly source. Load `grant-writing` when the deliverable is a proposal rather than a paper.

## Stage gates

Do not advance on a failed gate. Do not claim a gate passed without naming the artifact and the check that passed.

- **G0 Scope** - question, contribution, output type, venue, and constraints are written and confirmed.
- **G1 Evidence** - every citation in the draft exists in the evidence map; unsupported claims are marked.
- **G2 Design** - protocol, baselines, metrics, and analysis plan are locked before results.
- **G3 Data** - every figure and table has a data source, script, and manifest entry; planning data is labeled.
- **G4 Citation** - bibliography matches in-text citations; each source is verified; claim support is recorded.
- **G5 Review** - a reviewer report identifies remaining risks; every fatal or major issue is fixed or explicitly declared as a limitation.

## Subagent use

Split independent work by artifact, not by paragraph: one agent can map literature while another drafts the experiment protocol, but no two agents edit the same file. Give each agent the task packet, the relevant evidence or data, and the acceptance check. Review every returned artifact before accepting it; a subagent's completion claim is not evidence.

## Red flags

| Thought | Action |
|---|---|
| "The request is clear, start writing" | Write the scope and outline first; unclear points become questions. |
| "I will fill citations later" | Build the evidence map before drafting the section that needs it. |
| "The data looks plausible" | Trace it to a raw file and a reproducible script; label mock data. |
| "The draft is polished, so it is ready" | Run the evidence, citation, and review gates. |
| "One agent can write the whole paper faster" | Use disjoint ownership or a single-agent mode the user explicitly accepts. |
| "The gate is probably fine" | Name the artifact and the executed check, or the gate did not pass. |

## Completion audit

Before saying the project is complete, report: stage reached; artifacts produced; gates run and their results; unresolved evidence, data, or access gaps; and the remaining submission risk. If a gate was skipped, say so and do not present the result as submission-ready.
