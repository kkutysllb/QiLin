"""Pure-Python lexical matching utilities for QiLinMem.

Shared by two callers that need the same text semantics:

- **Search ranking** (:meth:`rank_facts`): a hybrid lexical scorer over stored
  facts combining exact/substring containment with case- and diacritic-
  insensitive, IDF-weighted token overlap, soft document-length normalization,
  and recency tie-breaking. It is the pure-Python half of ``QiLinMem.search``'s
  hybrid retrieval (the other half being the FTS5 BM25 adapter) and doubles as
  the full ranking path when SQLite FTS5 is unavailable.
- **Write-time deduplication** (:func:`find_duplicate` /
  :func:`find_prepared_duplicate`): normalized-text equality plus Dice
  token-set similarity against a configurable near-duplicate threshold.

No third-party dependencies: normalization uses ``unicodedata`` (NFKD +
combining-mark strip + casefold), tokenization is regex-based with CJK
characters emitted as unigrams, and IDF is a log-scaled document frequency
computed over the candidate pool being scored.
"""

from __future__ import annotations

import math
import re
import unicodedata
from collections import Counter
from datetime import UTC, datetime
from typing import Any

# Runs of unicode word characters (letters/digits) excluding underscore.
_WORD_RE = re.compile(r"[^\W_]+", re.UNICODE)
# CJK code points (kana, unified ideographs + extensions, hangul) matched per
# character so "東京都" tokenizes as 東/京/都 rather than one opaque token.
_CJK_RE = re.compile(r"[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]")

# ── Scoring constants ────────────────────────────────────────────────────
# Ordered so a stronger lexical signal always outranks a weaker one:
# exact equality > substring containment > token overlap. The confidence
# nudge is deliberately tiny (0.05) so relevance, not stored confidence,
# dominates ranking; confidence only breaks near-ties.
EXACT_SCORE = 1.0
SUBSTRING_SCORE = 0.65
_TOKEN_MAX_SCORE = 0.55
_CONFIDENCE_WEIGHT = 0.05


# ── Normalization + tokenization ─────────────────────────────────────────
def _fold_case_and_diacritics(text: str) -> str:
    """Return ``text`` NFKD-decomposed with combining marks removed + casefolded.

    Folding diacritics ("café" -> "cafe", "München" -> "munchen") plus
    casefold makes every matcher below insensitive to accents and case, which
    FTS5's unicode61 tokenizer does NOT guarantee for all scripts.
    """
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(char for char in decomposed if not unicodedata.combining(char)).casefold()


def normalize_text(text: str) -> str:
    """Return the case/diacritic-insensitive comparison form (whitespace collapsed)."""
    if not isinstance(text, str) or not text:
        return ""
    return " ".join(_fold_case_and_diacritics(text).split())


def tokenize(text: str) -> list[str]:
    """Tokenize folded text: word runs as tokens, CJK characters as unigrams.

    Single-character ASCII tokens ("s" from "user's", a stray "a") are dropped:
    they carry no matching signal but pollute similarity sets. Single CJK
    characters are meaningful and kept.
    """
    folded = _fold_case_and_diacritics(text)
    tokens: list[str] = []
    for word in _WORD_RE.findall(folded):
        if len(word) == 1 and word.isascii():
            continue
        if not _CJK_RE.search(word):
            tokens.append(word)
            continue
        # Mixed or pure CJK run: emit non-CJK runs and CJK chars in text order.
        start = 0
        for match in _CJK_RE.finditer(word):
            prefix = word[start : match.start()]
            if prefix and not (len(prefix) == 1 and prefix.isascii()):
                tokens.append(prefix)
            tokens.append(match.group(0))
            start = match.end()
        suffix = word[start:]
        if suffix and not (len(suffix) == 1 and suffix.isascii()):
            tokens.append(suffix)
    return tokens


def exact_match_key(content: Any) -> str:
    """Return the ordered normalized-token key used for exact dedup equality.

    Joining tokens in order (not sorting) keeps "Alice likes Bob" distinct
    from "Bob likes Alice" while making "Python 3.12!" equal "python 3.12"
    (punctuation, case, diacritics and whitespace differences collapse).
    """
    if not isinstance(content, str):
        return ""
    return " ".join(tokenize(content))


def token_set(content: Any) -> frozenset[str]:
    """Return the normalized token set used for overlap/similarity matching."""
    if not isinstance(content, str):
        return frozenset()
    return frozenset(tokenize(content))


# ── Similarity + dedup ───────────────────────────────────────────────────
def dice_similarity(left: frozenset[str], right: frozenset[str]) -> float:
    """Return the Dice coefficient ``2|A∩B| / (|A| + |B|)`` of two token sets.

    1.0 for identical sets, 0.0 when disjoint or either set is empty. Chosen
    over Jaccard because it is symmetric AND insensitive to a small number of
    added tokens on one side (Jaccard punishes "The user lives in Tokyo" vs
    "User lives in Tokyo" much harder than Dice does).
    """
    if not left or not right:
        return 0.0
    return 2.0 * len(left & right) / (len(left) + len(right))


def find_prepared_duplicate(
    query_key: str,
    query_tokens: frozenset[str],
    prepared: list[tuple[dict[str, Any], str, frozenset[str]]],
    *,
    near_threshold: float,
) -> tuple[dict[str, Any] | None, str]:
    """Scan pre-extracted fact representations for a duplicate of the query.

    ``prepared`` entries are ``(fact, exact_match_key, token_set)`` triples so
    callers matching several candidate facts against the same stored set (the
    LLM-extraction batch path) tokenize each stored fact only once.

    Returns ``(fact, action)`` where action is ``"exact"`` (normalized-text
    equality), ``"near"`` (Dice similarity >= ``near_threshold``), or
    ``(None, "insert")``. Exact matches short-circuit: they beat any near
    score. Among near candidates the highest similarity wins. A
    ``near_threshold`` >= 1.0 disables near-duplicate merging (exact only).
    """
    if not query_key:
        return None, "insert"
    best: dict[str, Any] | None = None
    best_similarity = 0.0
    for fact, fact_key, fact_tokens in prepared:
        if not fact_key:
            continue
        if fact_key == query_key:
            return fact, "exact"
        if near_threshold >= 1.0:
            continue
        similarity = dice_similarity(query_tokens, fact_tokens)
        if similarity >= near_threshold and similarity > best_similarity:
            best = fact
            best_similarity = similarity
    if best is not None:
        return best, "near"
    return None, "insert"


def find_duplicate(
    content: str,
    facts: list[dict[str, Any]],
    *,
    near_threshold: float,
) -> tuple[dict[str, Any] | None, str]:
    """Convenience wrapper: find a duplicate of ``content`` among ``facts``."""
    prepared = [
        (fact, exact_match_key(fact.get("content", "")), token_set(fact.get("content", "")))
        for fact in facts
        if isinstance(fact, dict)
    ]
    return find_prepared_duplicate(exact_match_key(content), token_set(content), prepared, near_threshold=near_threshold)


# ── Hybrid scoring ───────────────────────────────────────────────────────
def _coerce_confidence(fact: dict[str, Any]) -> float:
    """Return a finite confidence in [0, 1], defaulting to 0.5 (corrupt-data safe)."""
    raw = fact.get("confidence")
    if raw is None or isinstance(raw, bool):
        return 0.5
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return 0.5
    if not math.isfinite(value):
        return 0.5
    return max(0.0, min(value, 1.0))


def fact_recency(fact: dict[str, Any]) -> float:
    """Return a POSIX timestamp for ranking tie-breaks (0.0 when unknown)."""
    for key in ("updatedAt", "createdAt"):
        raw = fact.get(key)
        if not (isinstance(raw, str) and raw):
            continue
        try:
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            continue
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed.timestamp()
    return 0.0


def score_fact(
    query_norm: str,
    query_idf: dict[str, float],
    query_idf_total: float,
    content: str,
    *,
    confidence: float,
    avg_doc_len: float,
) -> tuple[float, str]:
    """Score one fact's content against a prepared query; return ``(score, match_type)``.

    Match types (strongest wins, first match returns):

    - ``"exact"``      -- normalized full-text equality (score 1.0).
    - ``"substring"``  -- the normalized query occurs inside the fact text
                          (catches partial-word hits a tokenized index misses,
                          e.g. query "postgres" inside "PostgreSQL").
    - ``"token"``      -- IDF-weighted fraction of *distinct* query tokens
                          present in the fact, scaled by soft document-length
                          normalization (shorter-than-average facts rank above
                          longer ones with the same coverage).

    A small confidence bonus (<= 0.05) is added to every match. ``(0.0, "")``
    means "no lexical signal; exclude this fact".
    """
    doc_norm = normalize_text(content)
    if not doc_norm or not query_norm:
        return 0.0, ""
    if query_norm == doc_norm:
        return EXACT_SCORE + _CONFIDENCE_WEIGHT * confidence, "exact"
    if query_norm in doc_norm:
        return SUBSTRING_SCORE + _CONFIDENCE_WEIGHT * confidence, "substring"
    if query_idf_total <= 0.0:
        return 0.0, ""
    doc_tokens = tokenize(content)
    if not doc_tokens:
        return 0.0, ""
    doc_token_set = frozenset(doc_tokens)
    matched_idf = sum(idf for token, idf in query_idf.items() if token in doc_token_set)
    if matched_idf <= 0.0:
        return 0.0, ""
    coverage = matched_idf / query_idf_total
    # Soft length normalization: ~0.59 at average length, rising for shorter
    # facts and falling for longer ones. log1p keeps the penalty gentle so a
    # genuinely more on-topic longer fact still outranks a shorter vaguer one.
    length_norm = 1.0 / (1.0 + math.log1p(len(doc_tokens) / max(avg_doc_len, 1.0)))
    score = _TOKEN_MAX_SCORE * coverage * length_norm + _CONFIDENCE_WEIGHT * confidence
    return score, "token"


def rank_facts(
    query: str,
    facts: list[dict[str, Any]],
    *,
    top_k: int,
    category: str | None = None,
) -> list[tuple[dict[str, Any], float, str]]:
    """Rank ``facts`` against ``query``; return up to ``top_k`` ``(fact, score, match_type)``.

    ``category`` filters BEFORE the ``top_k`` slice (base-contract semantics:
    a category-scoped search is not starved by other categories' facts). IDF
    weights are computed over the filtered candidate pool itself, so rare
    terms within this user's memory rank above ubiquitous ones ("user").
    Sorting is deterministic: score desc, then recency (updatedAt/createdAt)
    desc, then fact id.
    """
    if top_k <= 0 or not isinstance(query, str):
        return []
    candidates = [
        fact
        for fact in facts
        if isinstance(fact, dict) and isinstance(fact.get("content"), str) and fact["content"].strip() and (category is None or fact.get("category") == category)
    ]
    query_norm = normalize_text(query)
    query_tokens = tokenize(query)
    if not candidates or not query_norm or not query_tokens:
        return []

    doc_token_lists = [tokenize(fact["content"]) for fact in candidates]
    document_frequency: Counter[str] = Counter()
    for tokens in doc_token_lists:
        document_frequency.update(set(tokens))
    pool_size = len(candidates)
    query_idf = {token: math.log(1.0 + pool_size / (1.0 + document_frequency.get(token, 0))) for token in set(query_tokens)}
    query_idf_total = sum(query_idf.values())
    avg_doc_len = sum(len(tokens) for tokens in doc_token_lists) / len(doc_token_lists)

    scored: list[tuple[dict[str, Any], float, str]] = []
    for fact in candidates:
        score, match_type = score_fact(
            query_norm,
            query_idf,
            query_idf_total,
            fact["content"],
            confidence=_coerce_confidence(fact),
            avg_doc_len=avg_doc_len,
        )
        if score > 0.0:
            scored.append((fact, score, match_type))

    scored.sort(key=lambda item: (-item[1], -fact_recency(item[0]), str(item[0].get("id") or "")))
    return scored[:top_k]
