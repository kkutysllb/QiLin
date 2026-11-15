---
name: citation-audit
description: Use when checking a bibliography, verifying references before submission, or confirming that cited sources support their claims.
---

# Citation Audit

A reference is verified only when its record exists and the cited source supports the sentence at the point of use. A real DOI attached to an unrelated claim is still a citation error.

## Scope

Audit in this order:

1. every in-text citation has a bibliography entry;
2. every bibliography entry is cited at least once (unless a venue requires a reading list);
3. every entry resolves to a real record with matching authors, year, title, venue, and identifier;
4. every claim is supported by the cited source at the level actually read;
5. retractions, errata, and expressions of concern are checked;
6. names, capitalization, punctuation, and ordering follow one style.

## 1. Extract the citation units

Build a table before correcting anything:

| Cite key | In-text location | Sentence claim | Bibliography entry | Identifier | Claim support | Status |
|---|---|---|---|---|---|---|
| smith2024 | Intro P3 | "X improves Y under Z" | Smith et al., 2024 | 10.xxxx/... | direct, indirect, absent, or unread | verified, fix, or remove |

Use the manuscript's own citation keys. Keep one row per citation use; a source used for two different claims has two rows with different support judgments.

## 2. Verify the record

Resolve each identifier through at least one authoritative source:

| Source | Use |
|---|---|
| DOI / Crossref | `https://api.crossref.org/works/{doi}` for title, authors, venue, year, and type |
| PubMed | E-utilities for biomedical records and PMID/PMCID mapping |
| arXiv | `https://export.arxiv.org/api/query?id_list={id}` for preprints and versions |
| Publisher page | Final volume, issue, pages, and version of record |
| Semantic Scholar or OpenAlex | Cross-check citation metadata and related records |

Compare every field with the manuscript. Common failures: wrong year, swapped author order, conference paper cited as a journal article, preprint cited as the version of record, missing page range, and a DOI that belongs to a different paper.

If a record cannot be resolved, mark it `unverified`. Do not "correct" it from memory. Ask the user for the source or remove the claim.

## 3. Verify claim support

For each row, read at least the abstract and, for a core claim, the relevant full-text section. Record the support level:

- **Direct** - the source states the claim or reports the result.
- **Indirect** - the source supports a premise, not the claim as written.
- **Background** - the source motivates the area but does not support the specific claim.
- **Absent** - the source does not support the claim.
- **Unread** - the text was not available; the claim remains provisional.

Revise the sentence or the citation when support is indirect or absent. Do not weaken a claim silently by deleting the citation; mark the evidence gap.

## 4. Retractions and integrity signals

Check the DOI landing page and Crossref metadata for retraction or correction notices. For biomedical and high-risk claims, check Retraction Watch and PubMed publication-type tags. Flag:

- retracted or withdrawn work;
- expressions of concern and major errata;
- preprint-only evidence presented as peer-reviewed;
- a venue with no identifiable editorial process;
- duplicated text or a figure that appears in another publication;
- citation stuffing or an implausible citation count.

Do not accuse authors of misconduct from a metadata mismatch. Report the check and the evidence, and let the user decide.

## 5. Style and consistency

Apply one style consistently: APA 7, IEEE, Vancouver, Chicago, or GB/T 7714. Check author-name forms, et al. thresholds, title case, journal abbreviations, DOI format, access dates, and ordering. Use a reference manager or a script for mechanical checks, then read the output.

Check for duplicates: the same work under a preprint and a published version, two spellings of an author, or a DOI repeated under different keys. Keep one entry and a note on the version used.

## 6. Output

Deliver an audit table plus a short action list:

```markdown
## Citation audit

| Status | Count |
|---|---|
| verified | 41 |
| record mismatch | 3 |
| claim unsupported | 2 |
| unverified | 1 |
| retracted or flagged | 0 |

### Required fixes
1. [cite key] - [problem] - [action]
```

Do not claim a bibliography is verified if any entry is unverified or any core claim remains unsupported. State the number checked, the sources used, and the residual risk.

## Hard rules

- Never invent a reference, DOI, author, or finding.
- Never add a citation to satisfy a reviewer without reading the source.
- Never present a search snippet as full-text support.
- Keep the user's citation style; do not silently convert it.
- Record the date of each online check when the record may change.
