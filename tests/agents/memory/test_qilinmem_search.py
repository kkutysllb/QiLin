"""Tests for QiLinMem's hybrid search ranking (FTS5 + lexical fusion).

QiLinMem.search produces two independent ranked lists for the requested scope
-- the FTS5 retrieval adapter (BM25 + time-decay + confidence, when configured)
and a pure-Python lexical pass over the stored facts (exact/substring +
case/diacritic-insensitive IDF-weighted token overlap with soft length
normalization and recency tie-breaks) -- then fuses them with reciprocal rank
fusion. These tests exercise both configurations:

- ``retrieval_adapter=""`` (no FTS5): the lexical list is the whole result.
- default ``retrieval_adapter="fts5"``: the fusion path, including the
  partial-word substring matches the tokenized FTS5 index misses.

All tests construct ``QiLinMem`` directly with a ``tmp_path`` storage root (no
LLM configured -- search and fact CRUD never invoke the model).
"""

import json
from pathlib import Path

import pytest

from qilin.agents.memory.backends.qilinmem.qilin_mem import QiLinMem

USER = "u1"
AGENT = "lead-agent"


def make_backend(tmp_path: Path, backend_config: dict | None = None) -> QiLinMem:
    """Build a QiLinMem rooted at ``tmp_path`` (lexical-only by default)."""
    config: dict = {"storage_path": str(tmp_path), "retrieval_adapter": ""}
    config.update(backend_config or {})
    return QiLinMem(backend_config=config)


def seed_facts(backend: QiLinMem, *contents: str, category: str = "context", confidence: float = 0.8) -> list[str]:
    """Create one fact per content string; return their fact ids."""
    fact_ids = []
    for content in contents:
        _memory, fact_id = backend.create_fact(content, category=category, confidence=confidence, agent_name=AGENT, user_id=USER)
        assert fact_id is not None
        fact_ids.append(fact_id)
    return fact_ids


def write_legacy_v1_memory(tmp_path: Path, fact_id: str, content: str) -> None:
    """Write a pre-v2 user memory.json (facts inlined in the global document)."""
    memory_dir = tmp_path / "users" / USER
    memory_dir.mkdir(parents=True, exist_ok=True)
    (memory_dir / "memory.json").write_text(
        json.dumps(
            {
                "version": "1.0",
                "revision": 3,
                "lastUpdated": "2026-01-01T00:00:00Z",
                "user": {
                    "workContext": {"summary": "Works on data pipelines", "updatedAt": "2026-01-01T00:00:00Z"},
                    "personalContext": {"summary": "", "updatedAt": ""},
                    "topOfMind": {"summary": "", "updatedAt": ""},
                },
                "history": {
                    "recentMonths": {"summary": "", "updatedAt": ""},
                    "earlierContext": {"summary": "", "updatedAt": ""},
                    "longTermBackground": {"summary": "", "updatedAt": ""},
                },
                "facts": [
                    {
                        "id": fact_id,
                        "content": content,
                        "category": "context",
                        "confidence": 0.8,
                        "createdAt": "2026-01-02T00:00:00Z",
                        "updatedAt": "2026-01-02T00:00:00Z",
                        "source": "manual",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )


class TestLexicalSearchRanking:
    """Pure-Python lexical ranking (no FTS5 adapter configured)."""

    def test_relevant_fact_ranks_above_irrelevant(self, tmp_path: Path) -> None:
        backend = make_backend(tmp_path)
        python_id, _vim_id, _pg_id = seed_facts(
            backend,
            "User prefers Python for scripting",
            "User's favorite editor is Vim",
            "PostgreSQL connection string stored in env",
        )
        results = backend.search("python scripting", user_id=USER, agent_name=AGENT)
        assert results, "expected at least one match"
        assert results[0]["id"] == python_id
        assert "Python" in results[0]["content"]
        # Irrelevant facts that share no query token must not be returned.
        assert "User's favorite editor is Vim" not in {fact["content"] for fact in results}
        assert "PostgreSQL connection string stored in env" not in {fact["content"] for fact in results}

    def test_exact_match_outranks_substring_outranks_token_overlap(self, tmp_path: Path) -> None:
        backend = make_backend(tmp_path)
        exact_id, substring_id, token_id = seed_facts(
            backend,
            "Tokyo trains",  # exact normalized equality with the query
            "The Tokyo trains are punctual",  # query occurs as a substring
            "User visited Tokyo once and remembers the punctual trains",  # tokens present, phrase absent
        )
        results = backend.search("tokyo trains", user_id=USER, agent_name=AGENT)
        by_id = {fact["id"]: fact for fact in results}
        assert [fact["id"] for fact in results[:3]] == [exact_id, substring_id, token_id]
        assert by_id[exact_id]["matchType"] == "exact"
        assert by_id[substring_id]["matchType"] == "substring"
        assert by_id[token_id]["matchType"] == "token"

    def test_top_k_limits_and_orders_results(self, tmp_path: Path) -> None:
        backend = make_backend(tmp_path)
        seed_facts(
            backend,
            "User likes morning runs",
            "User likes evening runs",
            "User likes night runs",
        )
        results = backend.search("user likes runs", top_k=2, user_id=USER, agent_name=AGENT)
        assert len(results) == 2
        scores = [fact["score"] for fact in results]
        assert scores == sorted(scores, reverse=True)

    def test_empty_query_and_no_match_return_empty(self, tmp_path: Path) -> None:
        backend = make_backend(tmp_path)
        seed_facts(backend, "User prefers Python for scripting")
        assert backend.search("", user_id=USER, agent_name=AGENT) == []
        assert backend.search("   ", user_id=USER, agent_name=AGENT) == []
        assert backend.search("quantum entanglement", user_id=USER, agent_name=AGENT) == []
        # Empty memory: no facts stored at all.
        assert backend.search("anything", user_id="nobody", agent_name=AGENT) == []
        assert backend.search("python", top_k=0, user_id=USER, agent_name=AGENT) == []

    def test_results_carry_scores(self, tmp_path: Path) -> None:
        backend = make_backend(tmp_path)
        seed_facts(backend, "User prefers Python for scripting", "User's favorite editor is Vim")
        results = backend.search("python", user_id=USER, agent_name=AGENT)
        assert results
        for fact in results:
            assert isinstance(fact["score"], float)
            assert fact["score"] > 0.0
            assert fact["matchType"] in {"exact", "substring", "token", "fts5"}

    def test_case_and_diacritic_insensitive_matching(self, tmp_path: Path) -> None:
        backend = make_backend(tmp_path)
        cafe_id, munich_id = seed_facts(
            backend,
            "User drinks Café au lait every morning",
            "User was born in München",
        )
        # "CAFÉ" folds to "cafe" and matches the folded content substring.
        results = backend.search("CAFE au lait", user_id=USER, agent_name=AGENT)
        assert results[0]["id"] == cafe_id
        # "munchen" (no umlaut) token-matches "München" after diacritic folding.
        results = backend.search("munchen born", user_id=USER, agent_name=AGENT)
        assert results[0]["id"] == munich_id

    def test_partial_word_substring_match(self, tmp_path: Path) -> None:
        backend = make_backend(tmp_path)
        seed_facts(backend, "PostgreSQL connection string stored in env")
        # "postgres" is a substring of "PostgreSQL" -- a tokenized index misses
        # it; the lexical pass must catch it.
        results = backend.search("postgres", user_id=USER, agent_name=AGENT)
        assert len(results) == 1
        assert results[0]["matchType"] == "substring"

    def test_category_filter_applies_before_top_k(self, tmp_path: Path) -> None:
        backend = make_backend(tmp_path)
        backend.create_fact("User prefers Python", category="preference", confidence=0.9, agent_name=AGENT, user_id=USER)
        backend.create_fact("User debugs Python code", category="behavior", confidence=0.9, agent_name=AGENT, user_id=USER)
        results = backend.search("python", top_k=5, user_id=USER, agent_name=AGENT, category="preference")
        assert len(results) == 1
        assert results[0]["category"] == "preference"
        assert results[0]["content"] == "User prefers Python"
        assert backend.search("python", user_id=USER, agent_name=AGENT, category="goal") == []


class TestFts5FusionSearch:
    """Default configuration: FTS5 adapter + lexical pass fused by RRF."""

    def test_relevant_above_irrelevant_with_scores(self, tmp_path: Path) -> None:
        backend = make_backend(tmp_path, {"retrieval_adapter": "fts5"})
        python_id, _bike_id, _pg_id = seed_facts(
            backend,
            "User prefers Python for scripting",
            "User rides a bicycle to work",
            "PostgreSQL connection string stored in env",
        )
        results = backend.search("python", user_id=USER, agent_name=AGENT)
        assert results[0]["id"] == python_id
        assert isinstance(results[0]["score"], float)
        assert results[0]["score"] > 0.0
        returned_contents = [fact["content"] for fact in results]
        assert "User rides a bicycle to work" not in returned_contents

    def test_fusion_covers_fts5_partial_word_blind_spot(self, tmp_path: Path) -> None:
        backend = make_backend(tmp_path, {"retrieval_adapter": "fts5"})
        pg_id = seed_facts(backend, "PostgreSQL connection string stored in env")[0]
        # FTS5's tokenized index cannot match the partial word "postgres";
        # the lexical substring pass finds it and the fusion keeps it.
        results = backend.search("postgres", user_id=USER, agent_name=AGENT)
        assert [fact["id"] for fact in results] == [pg_id]
        assert results[0]["matchType"] == "substring"

    def test_top_k_and_empty_behavior(self, tmp_path: Path) -> None:
        backend = make_backend(tmp_path, {"retrieval_adapter": "fts5"})
        seed_facts(backend, "User likes morning runs", "User likes evening runs")
        assert len(backend.search("runs", top_k=1, user_id=USER, agent_name=AGENT)) == 1
        assert backend.search("", user_id=USER, agent_name=AGENT) == []
        assert backend.search("quantum entanglement", user_id=USER, agent_name=AGENT) == []


class TestOldRecordCompatibility:
    """Pre-v2 (legacy JSON) stored memories stay readable and searchable."""

    def test_legacy_v1_facts_are_migrated_and_searchable(self, tmp_path: Path) -> None:
        write_legacy_v1_memory(tmp_path, "fact_legacy01", "User maintains legacy memory format facts")
        backend = make_backend(tmp_path)
        # Search with no agent_name resolves to the default bucket the legacy
        # facts migrate into; the load itself drives the v1 -> v2 migration.
        results = backend.search("legacy memory format", user_id=USER)
        assert results, "legacy fact should be findable after migration"
        assert results[0]["id"] == "fact_legacy01"
        assert results[0]["score"] > 0.0
        # The full document is still exposed through the management surface.
        document = backend.get_memory(user_id=USER)
        legacy = [fact for fact in document["facts"] if fact["id"] == "fact_legacy01"]
        assert legacy and legacy[0]["content"] == "User maintains legacy memory format facts"
        assert document["user"]["workContext"]["summary"] == "Works on data pipelines"

    def test_legacy_v1_facts_score_against_new_writes(self, tmp_path: Path) -> None:
        write_legacy_v1_memory(tmp_path, "fact_legacy01", "User maintains legacy memory format facts")
        backend = make_backend(tmp_path)
        backend.create_fact("User prefers Python", agent_name=None, user_id=USER)
        results = backend.search("legacy", user_id=USER)
        assert [fact["id"] for fact in results] == ["fact_legacy01"]


@pytest.mark.parametrize("query", ["python", "PYTHON Scripting", "  python  "])
def test_query_normalization_does_not_change_match_set(tmp_path: Path, query: str) -> None:
    backend = make_backend(tmp_path)
    python_id = seed_facts(backend, "User prefers Python for scripting")[0]
    results = backend.search(query, user_id=USER, agent_name=AGENT)
    assert any(fact["id"] == python_id for fact in results)
