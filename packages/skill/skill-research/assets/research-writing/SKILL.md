---
name: research-writing
description: Use when drafting or revising an academic manuscript, thesis chapter, abstract, or section.
---

# Research Writing

Write from evidence and argument, not from a sentence-level polishing instinct. A section is ready when its claim, evidence, and boundary are visible to a reader who has not seen the analysis.

## Before drafting

Confirm the target in one short exchange if it is not already known: output type, venue or template, section and word limit, language, citation style, and the reader's expected expertise. Read `plan/outline.md`, the evidence map, and any experiment protocol. If a required artifact is missing, stop and create it with the owning skill.

For a chapter or section, write a one-line role statement first: "This section establishes X so that Y can claim Z." If that sentence is vague, the section is not planned yet.

## Paragraph contract

Each body paragraph carries one main claim:

1. **Topic sentence** - the claim in plain language.
2. **Evidence** - data, cited result, method condition, or logical step.
3. **Interpretation** - what the evidence supports and what it does not.
4. **Boundary or bridge** - the limitation, alternative explanation, or transition to the next claim.

Use citations only for claims they support. Never append a citation to a sentence because it "looks related". When a source is abstract-level only, mark the claim as provisional rather than overstating it.

## Section patterns

| Section | Required movement |
|---|---|
| Abstract | Context and problem, gap, approach, principal result with scope, conclusion. No citations unless the venue requires them. |
| Introduction | Application pressure, existing routes grouped by method family, unresolved bottleneck, specific gap, contribution and boundary. |
| Related work | Themes, not a paper-by-paper list. Compare two to four sources per paragraph and name what the theme does not solve. |
| Method | Problem setting, assumptions, inputs and outputs, procedure, complexity or cost, and enough detail to reproduce. |
| Results | Claim, evidence, comparison, uncertainty, and the condition under which it holds. Do not narrate every table cell. |
| Discussion | Interpretation, comparison with prior work, mechanisms, limitations, failure cases, and implications. Separate what was observed from what is speculated. |
| Conclusion | What was established, under which conditions, and what remains open. No new claims or citations. |

## Natural academic prose

The goal is a researcher's prose, not compressed bullet points. Preserve the object of study, data range, sample definition, method conditions, metric meaning, and conclusion limits when editing. Shorter is not automatically better.

Remove these patterns unless the user's style guide requires them:

- mechanical sequence markers such as "first, second, finally, moreover, in addition" when they merely order sentences;
- empty emphasis such as "it is worth noting that", "importantly", "obviously", "significantly" without a quantity or test;
- throat-clearing openings and summary sentences that repeat the heading;
- uniform sentence lengths, repeated "not only ... but also" frames, and generic praise;
- bold or italic emphasis in manuscript body text;
- bullet lists that replace an argument; lists are for checklists, parameters, and steps.

Prefer semantic transitions: contrast, cause, consequence, limitation, and scope. Let some sentences be longer when they carry a condition or a chain of reasoning. Keep necessary repetition when it maintains a term or a referent.

For Chinese academic prose, avoid translationese and review-response tone. State the object or phenomenon before the judgment, retain necessary qualifiers, and do not convert every paragraph into a "background-method-result-significance" template. When a user says the text reads as AI-generated, first check for over-compression and lost conditions before deleting more words.

## Evidence and claims

- Each core claim in the draft must map to a row in the evidence map or to a result in the analysis.
- Distinguish observation, interpretation, and speculation with explicit wording.
- Report effect sizes, uncertainty, and sample size where the claim is quantitative.
- Do not describe a planning value as a result. Use a visible placeholder such as `[awaiting real data]` and keep it out of a submission.
- Do not cite a source you have not verified; load `citation-audit` when a bibliography is involved.

## Two-stage review

**Stage 1 - specification compliance.** Check section role, required subsections, word or page limit, citation style, terminology, cross-references, and every artifact the user requested. A missing requirement is a failure even if the prose is good.

**Stage 2 - quality.** Check claim-evidence alignment, paragraph logic, unsupported generalizations, overclaiming, lost conditions, mechanical prose, and readability for the target audience. Read the section aloud or summarize each paragraph in one sentence; a paragraph that cannot be summarized is doing too many jobs.

## Discipline notes

- **Medicine and life sciences** - follow the venue's reporting guideline (for example CONSORT, STROBE, PRISMA); report participants, inclusion, endpoints, and harms precisely.
- **Engineering and computer science** - separate problem, method, experimental setting, results, and threats to validity; make baselines and ablations explicit.
- **Social sciences** - state the theoretical mechanism, case selection, measurement, and alternative explanations; do not present correlation as causation.
- **Humanities** - build an interpretive argument from primary texts and scholarship; distinguish evidence, interpretation, and historiographical position.
- **Law** - separate doctrine, authority, analogical reasoning, and policy argument; cite jurisdiction and provision precisely.

## Final check

Before delivering, report what was drafted, which evidence or data were used, which checks ran, and what remains unresolved. Do not call a draft submission-ready while a placeholder, unverified citation, missing limitation, or unresolved reviewer issue remains.
