---
name: experiment-design
description: Use when designing a study, experiment, benchmark, ablation, or evaluation protocol before final data exist.
---

# Experiment Design

Design the evidence before running the experiment. A result is only interpretable if the protocol, baselines, analysis plan, and stopping rules were fixed before the favorable number appeared.

## 1. State a falsifiable hypothesis

Write the hypothesis so that an outcome could contradict it:

- **Question** - the uncertainty the study addresses.
- **Hypothesis** - a directional or quantitative prediction.
- **Mechanism** - why the prediction should hold.
- **Variables** - independent variables and their levels, dependent measures, and controlled variables.
- **Prediction** - the pattern that would support or refute the hypothesis.
- **Boundary** - the population, setting, and conditions to which the claim is limited.

Avoid "we expect the method to perform well". Name the comparison, metric, direction, and condition.

## 2. Lock the protocol

Record `research/plan/experiment-protocol.md` before collecting final results:

| Element | Required content |
|---|---|
| Data and sample | Source, inclusion and exclusion, size, splits, preprocessing, and leakage checks |
| Baselines | Closest prior methods and a naive or human reference where meaningful; why each is fair |
| Conditions | Manipulations, controls, and held-constant factors |
| Metrics | Primary and secondary outcomes, units, aggregation, and direction of benefit |
| Analysis plan | Statistical test, effect size, confidence interval, multiplicity correction, and missing-data rule |
| Sample size | Power analysis or precision target, assumptions, and stopping rule |
| Randomness | Seeds, randomization, repeated runs, and how variance is reported |
| Environment | Hardware, software versions, prompts, checkpoints, and data versions |
| Ethics and access | Approval, consent, data-use limits, and who can access the raw data |

If a choice cannot be fixed before data collection, record it as exploratory and label the resulting analysis as exploratory. Do not present an exploratory result as confirmatory.

## 3. Controls and threats to validity

For each threat, write the control or the limitation:

- selection and sampling bias;
- confounding variables and batch effects;
- leakage between train, validation, and test;
- distribution shift and external validity;
- instrumentation, annotation, and inter-rater reliability;
- p-hacking, optional stopping, and selective reporting;
- compute and implementation differences that could explain a comparison;
- for human or clinical studies, blinding, randomization, attrition, and adverse events.

Ablations should isolate the claimed mechanism, not merely remove a component. A component that improves the metric without testing the proposed mechanism supports a performance claim, not a mechanistic one.

## 4. Method-to-experiment traceability

Create `research/plan/method-experiment-traceability.md`:

| Contribution | Method module | Experiment | Table or figure | Allowed claim | Status |
|---|---|---|---|---|---|
| C1 | ... | E1 | Table 2 | "improves X under Y" | planned, running, done, or missing |

If a contribution has no experiment, add a limitation or remove the contribution. Do not let an introduction claim survive only in prose.

## 5. Planning data

Mock or synthetic values may be used for table layout and figure planning. They must not be presented as evidence.

- Name files with a `mock_` or `synthetic_` prefix.
- Put a visible note in every planned table: `PLANNING DATA - not experimental evidence`.
- Keep a visible `[awaiting real data]` marker in prose that will later use real values.
- Never write "results show", "we found", or "the method achieves" for a planning value.
- Record the replacement owner and the real data source in the table schema.

## 6. Reproducibility package

Before submission, assemble the artifacts a competent reader needs:

- a manifest of data, code, models, prompts, and configuration;
- an environment lock or exact versions;
- a single command or script that regenerates each table and figure;
- expected outputs and known nondeterminism;
- access conditions for restricted or human-subjects data;
- checksums or version identifiers for immutable inputs.

A repository that runs only on the author's machine is not a reproducibility package. State what cannot be shared and why.

## 7. Analyze and report

Run the locked primary analysis first. Report the estimate, uncertainty, sample size, and the conditions under which it holds. Report all prespecified outcomes, including null results. If you deviate from the protocol, record the deviation and its reason before interpreting the result.

Results prose pattern:

> Under condition Y, method A changed metric M by X (95% CI ...) relative to baseline B. The gain is consistent with the ablation of component C; condition Z remains a failure case.

This separates observation, mechanism, and limitation. It does not overstate a single run.

## Checklist

- [ ] Hypothesis is falsifiable and the boundary is stated.
- [ ] Data, splits, baselines, metrics, and controls are fixed.
- [ ] Sample size or precision target is justified.
- [ ] Analysis plan includes effect size, uncertainty, and multiplicity.
- [ ] Every contribution maps to an experiment or a limitation.
- [ ] Planning data is visibly labeled and excluded from claims.
- [ ] Reproducibility artifacts and access conditions are recorded.
- [ ] Deviations and null results are reported.
