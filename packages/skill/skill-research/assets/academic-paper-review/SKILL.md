---
name: academic-paper-review
description: Use when reviewing or critiquing a research paper, preprint, thesis, or submission, or when simulating peer review before submitting.
---

# Academic Paper Review

Review the submitted work, not the paper you wish had been written. A useful review is specific, evidence-based, and constructive; a summary without an assessment is not a review.

## Read before judging

1. Identify the paper metadata: title, authors, venue or status, year, field, and paper type (empirical, theoretical, survey, systems, position, or clinical).
2. Read the abstract, introduction, method, results, discussion, limitations, and conclusion. Do not stop at the abstract.
3. Extract the claims and their evidence:

| Claim | Where stated | Evidence offered | Evidence adequate? | Severity if unsupported |
|---|---|---|---|---|
| C1 | Section, page, or figure | Data, proof, citation, or none | Strong, partial, or absent | Fatal, major, minor |

4. Mark what the paper actually establishes versus what it asserts. A claim about generality needs evidence across settings, not one favorable dataset.

## Assessment criteria

Rate each dimension with a short justification. Do not use a numeric score without saying what would raise or lower it.

| Dimension | Questions |
|---|---|
| Soundness | Is the method technically correct? Are assumptions stated? Are there logical gaps? |
| Novelty | What is genuinely new relative to the closest prior work? Is the delta more than a combination? |
| Significance | Does the result change practice, theory, or a research direction? For whom? |
| Experimental design | Are datasets, splits, baselines, controls, and ablations fair and sufficient? |
| Statistical rigor | Are assumptions checked, uncertainty reported, effect sizes given, and multiple comparisons handled? |
| Reproducibility | Are data, code, hyperparameters, prompts, and compute described well enough to reproduce? |
| Evidence and citations | Are key claims supported by the cited work? Is important prior work missing or mischaracterized? |
| Clarity and ethics | Is the paper understandable? Are limitations, conflicts, funding, and ethical approvals disclosed? |

For a **theoretical** paper, check proof correctness, assumption strength, bound tightness, and connection to practice. For a **survey**, check coverage, taxonomy quality, recency, and synthesis rather than a list of summaries. For a **systems** paper, check architecture decisions, scale evidence, deployment realism, and operational costs. For a **clinical** paper, check the reporting guideline, participant flow, harms, and prespecified outcomes.

## Contextualize the contribution

Search for the closest prior work, the standard baselines, and recent surveys. Use the search only to locate the contribution and test the paper's claims; do not penalize the authors for omitting the reviewer's own work or for not solving a different problem. If related work is missing, name the specific line of work and why it matters.

## Review report

Use this structure unless the venue provides its own form.

```markdown
# Review: [paper title]

## Summary
[Two or three sentences: problem, approach, and main result. No verdict here.]

## Strengths
### S1: [specific strength]
[Where it appears and why it matters.]

## Weaknesses
### W1: [specific weakness]
[Location, evidence, impact on the claims, and what would address it.]

## Methodology assessment
| Dimension | Rating | Justification |
|---|---|---|
| Soundness | 1-5 | ... |
| Novelty | 1-5 | ... |
| Significance | 1-5 | ... |
| Experimental design | 1-5 | ... |
| Statistical rigor | 1-5 | ... |
| Reproducibility | 1-5 | ... |

## Questions for the authors
1. [Question that resolves a genuine ambiguity.]

## Minor issues
- [Specific citation, figure, notation, or clarity issue.]

## Recommendation
Overall: accept / weak accept / borderline / weak reject / reject
Confidence: high / medium / low, with the basis for that confidence.
Contribution level: landmark / significant / moderate / marginal / below threshold.
```

## Review discipline

- Point to a section, equation, figure, or table. "The writing is unclear" is not actionable; name the unclear sentence and the missing definition.
- Separate fatal flaws from fixable issues. Do not bury a fatal design problem among typos.
- Do not demand experiments that are out of scope or impossible with the data the authors can access; explain the minimum evidence needed for the claim.
- Give credit for genuine contributions even when the paper has major weaknesses.
- Do not dismiss work because of author identity, institution, or language quality.
- Treat unpublished material as confidential. Do not circulate it or use it in another review.
- If you could not verify a proof, a dataset, or a claim, say so and lower your confidence rather than guessing.

## Self-review before submission

Run the same criteria against your own draft. For each fatal or major concern, either fix the artifact or state it as a limitation. Check that the introduction's promises appear as results, that every contribution maps to evidence, that baselines are fair, that limitations are not hidden in the conclusion, and that the abstract does not overstate the scope.

A review is complete when the recommendation follows from the listed evidence and a reader could reproduce the reasoning. It is not complete because the paper has been summarized.
