---
name: literature-review
description: Use when searching, screening, or synthesizing literature for a review, related-work section, background, scoping review, or research-gap argument.
---

# Literature Review

A review is an argument about a body of evidence, not an annotated bibliography. The deliverable is a traceable search and a synthesis that supports specific claims.

## Hard rules

- Never invent a citation, DOI, author, year, venue, or finding.
- A source may support a claim only at the level actually read. Mark abstract-level support as provisional.
- Every core claim needs a source in the evidence map; a research gap should normally rest on more than one source.
- Keep the search reproducible: database, query, date, filters, and hit counts belong in `research/refs/search-log.md`.
- Do not cite a paper merely because its title matches the topic.

## 1. Frame the question

Write the review question, scope, and audience before searching. Use a recognized frame when it fits:

| Field | Health and social science | General technical review |
|---|---|---|
| Population or object | Participants, condition, dataset, or system | Artifact, method family, or phenomenon |
| Intervention or exposure | Treatment, program, or factor | Technique, architecture, or design choice |
| Comparison | Control or alternative | Baseline family or prior approach |
| Outcome | Measured result and time point | Metric, claim, or capability |
| Study design | RCT, cohort, qualitative, etc. | Empirical, theoretical, systems, survey |

For a scoping review, state breadth and map evidence rather than pooling effects. For a systematic review, register or record the protocol, define eligibility, and use a PRISMA-style flow when the venue expects it.

## 2. Search and log

Plan at least three query families: core terms, synonyms and abbreviations, and venue or method-specific terms. Search broadly first, then narrow. Use the available web search and fetch tools; for scholarly sources, query public APIs such as Crossref, PubMed E-utilities, arXiv, and Semantic Scholar, and record the exact endpoint or query.

```text
Crossref search:  https://api.crossref.org/works?query.bibliographic=<terms>&rows=20&filter=from-pub-date:2021-01-01
Crossref record:  https://api.crossref.org/works/<doi>
arXiv search:     https://export.arxiv.org/api/query?search_query=all:<terms>&max_results=20
PubMed search:    https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=<terms>&retmode=json
PubMed fetch:     https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=<ids>&retmode=xml
Semantic Scholar: https://api.semanticscholar.org/graph/v1/paper/search?query=<terms>&limit=20&fields=title,authors,year,venue,externalIds,abstract
```

Respect each endpoint's rate limit and identify the source of every record. A query that returns no usable record is still recorded as a search.

Record in `refs/search-log.md`:

| Field | Example |
|---|---|
| Date | 2026-11-15 |
| Database or source | Crossref API, PubMed, arXiv |
| Query | `"retrieval augmented generation" AND evaluation` |
| Filters | 2021-2026, English, peer-reviewed |
| Hits and reviewed | 84 hits, 22 titles screened, 9 full texts |
| Inclusion decision | Include, exclude, or pending, with reason |

Search Chinese literature through the databases the user can access (for example CNKI, Wanfang, or VIP). The agent prepares Chinese and English query strings and organizes records the user supplies; it does not pretend to have searched a database it cannot access.

## 3. Screen and extract

Screen titles and abstracts first, then full texts. Record exclusion reasons. Extract into `plan/evidence-map.md`:

| Source ID | Citation | Design or type | Sample or setting | Finding actually reported | Usable claim | Limitation or risk | Read level |
|---|---|---|---|---|---|---|---|

Rules:

- One row per source; do not merge two papers into one "finding".
- `Usable claim` is a sentence that could appear in the manuscript, not "this paper is relevant".
- `Read level` is `abstract`, `full text`, or `user notes`. A claim from an abstract is provisional.
- Mark indirect, conflicting, or weak support explicitly; do not average it away.

## 4. Synthesize by theme

Organize by debate, method family, mechanism, population, or outcome - not by publication date. A synthesis paragraph should:

1. name the theme and why it matters;
2. compare two to four sources, including where they agree and disagree;
3. explain the mechanism or condition behind the difference;
4. state what the theme leaves unresolved;
5. bridge to the next theme or to the present study.

Avoid "Author A found X. Author B found Y. Author C found Z." If a paragraph can be converted into table rows without losing meaning, it is not yet synthesis.

Use a coverage table in `plan/review/evidence-coverage.md` to check that each claim has enough support and that contradictory evidence is represented. For a systematic review, report the screening flow and the certainty or risk-of-bias assessment the venue expects.

## 5. Write the review

Typical structure for a journal review:

1. **Introduction** - field significance, scope, review question, and what the review contributes.
2. **Method** - search strategy, eligibility, screening, extraction, and synthesis method.
3. **Findings by theme** - the argument, with evidence and contradictions.
4. **Discussion** - state of the field, quality of evidence, gaps, and implications.
5. **Limitations** - search limits, language and publication bias, and scope.

For a thesis chapter, omit the method section only when the venue or advisor does not require it. State the search scope in the introduction instead.

## 6. Verify before delivery

- Every in-text citation has a row in the evidence map and a verified record.
- The bibliography is consistent with the citation style.
- The search log can reproduce the final set.
- Unsupported or provisional claims are marked.
- The gap statement names what is missing, for whom, and why current evidence cannot answer it.

Load `citation-audit` before submission. A review is not complete because it reads smoothly; it is complete when the evidence chain is inspectable.
