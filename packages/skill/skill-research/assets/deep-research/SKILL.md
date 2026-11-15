---
name: deep-research
description: Use when a question needs current, multi-source web research before an answer or content deliverable, or when one search would be too shallow.
---

# Deep Research

Research is a coverage problem before it is a writing problem. Define the question, map the angles, read the strong sources in full, and triangulate before producing prose.

## 1. Frame the question

Write the question in one sentence and list what a sufficient answer must establish. Separate:

- facts and definitions;
- current state and recent changes;
- mechanisms or causes;
- comparisons and alternatives;
- constraints, risks, and criticisms;
- stakeholders and incentives.

If the user asks for a recommendation, state the criteria and the evidence that would change the recommendation.

## 2. Map the angles

Plan at least three independent angles, for example:

| Angle | What it answers | Source type |
|---|---|---|
| Primary | Official documentation, paper, dataset, filing, or standard | Primary source |
| Practitioner | Adoption, deployment, failure reports, case studies | Engineering blog, report, interview |
| Critical | Limitations, criticism, competing explanations | Review, critique, independent analysis |
| Temporal | What changed recently and what is dated | Dated news, release notes, version history |
| Comparative | Alternatives and tradeoffs | Benchmarks, independent evaluations |

One search query is not a research plan. Record the queries and the coverage in a scratch research log.

## 3. Search with precision

- Use the actual current date from the session context for time-sensitive queries; do not hardcode a past year.
- Use exact phrases, product or version names, authors, and venue names.
- Search for the primary source, not only commentary about it.
- Search for the strongest counterargument and for a documented failure.
- Use multiple phrasings, including the terminology a specialist would use.
- When a result is important, fetch the full page or paper; do not rely on the snippet.

## 4. Source hierarchy

Prefer, in order:

1. primary documents, datasets, standards, and peer-reviewed papers;
2. official documentation, filings, and first-party release notes;
3. independent technical analyses and systematic reviews;
4. reputable journalism and practitioner reports;
5. aggregators, summaries, and unattributed listicles.

Record the URL, title, author or organization, publication date, and access date. For a claim that may change, note the version or date. A source that cannot be located again is not evidence.

## 5. Triangulate

For each core factual claim, seek at least two independent sources. Independence means they do not derive from the same press release or dataset. When sources conflict:

- state the disagreement rather than averaging it;
- compare dates, definitions, populations, and methods;
- prefer the source closest to the raw evidence;
- mark the claim as uncertain if the conflict cannot be resolved.

Distinguish fact, inference, and opinion in the final answer. "The documentation states X" and "this suggests Y" are different claims.

## 6. Synthesis check

Before writing, verify:

- [ ] At least three angles were covered.
- [ ] The most important primary sources were read in full.
- [ ] Current information was checked with date-aware queries.
- [ ] Counterevidence and limitations are included.
- [ ] Each core fact has a locatable source.
- [ ] Conflicts and uncertainty are stated, not hidden.
- [ ] The answer separates what was found from what was inferred.

If a check fails, continue researching or state the limitation. Do not fill a gap with plausible general knowledge.

## 7. Output

Deliver the answer with a short source list. Cite specific pages, not just domains. For long research, provide a findings table or a structured brief with claims, evidence, confidence, and open questions. When the user asked for a content deliverable, keep the research notes separate from the final prose.

## Common failures

- stopping after one or two searches;
- citing search snippets without opening the source;
- treating a company blog and its press release as independent;
- ignoring the date and presenting old data as current;
- searching only for confirmation;
- presenting a recommendation without criteria or uncertainty;
- failing to record where a number came from.
