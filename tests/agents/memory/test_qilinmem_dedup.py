"""Tests for QiLinMem's dedup-on-write (exact skip / near-duplicate merge).

Every fact-write path checks the bucket's stored facts for duplicates before
inserting (see ``core.lexical``): a case/diacritic/punctuation-insensitive
normalized-text match is an EXACT duplicate (skipped; the existing fact id is
returned, nothing is written), and a Dice token-set similarity at/above
``dedup_similarity_threshold`` (default 0.85) is a NEAR duplicate (merged into
the existing fact: richer text wins, confidence takes the max, and storage
bumps revision/updatedAt only when the merge changed something material).
Anything else inserts as a new fact.

Covered write paths: the manual ``create_fact`` CRUD surface (memory_add tool
/ client API) and the LLM-extraction apply path (``_apply_updates``).
"""

import copy
import json
from pathlib import Path

from qilin.agents.memory.backends.qilinmem.qilin_mem import QiLinMem
from qilin.agents.memory.backends.qilinmem.qilinmem.config import QiLinMemConfig
from qilin.agents.memory.backends.qilinmem.qilinmem.core.storage import (
    create_empty_memory,
    create_storage,
)
from qilin.agents.memory.backends.qilinmem.qilinmem.core.updater import MemoryUpdater

USER = "u1"
AGENT = "lead-agent"


def make_backend(tmp_path: Path, backend_config: dict | None = None) -> QiLinMem:
    config: dict = {"storage_path": str(tmp_path), "retrieval_adapter": ""}
    config.update(backend_config or {})
    return QiLinMem(backend_config=config)


def make_updater(tmp_path: Path, dedup_threshold: float = 0.85) -> MemoryUpdater:
    config = QiLinMemConfig(storage_path=str(tmp_path), retrieval_adapter="", dedup_similarity_threshold=dedup_threshold)
    return MemoryUpdater(config, create_storage(config))


def fact_ids(backend: QiLinMem) -> set[str]:
    return {str(fact["id"]) for fact in backend.get_memory(agent_name=AGENT, user_id=USER)["facts"]}


def stored_fact(backend: QiLinMem, fact_id: str) -> dict:
    matches = [fact for fact in backend.get_memory(agent_name=AGENT, user_id=USER)["facts"] if fact["id"] == fact_id]
    assert matches, f"fact {fact_id} not stored"
    return matches[0]


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
                    "workContext": {"summary": "", "updatedAt": ""},
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


class TestCreateFactDedup:
    """Dedup on the manual create_fact path."""

    def test_exact_duplicate_skips_and_returns_existing_id(self, tmp_path: Path) -> None:
        backend = make_backend(tmp_path)
        _memory, first_id = backend.create_fact("User lives in Tokyo", agent_name=AGENT, user_id=USER)
        _memory, second_id = backend.create_fact("USER LIVES IN TOKYO.", agent_name=AGENT, user_id=USER)
        assert second_id == first_id
        assert fact_ids(backend) == {first_id}

    def test_exact_duplicate_ignores_diacritics_and_punctuation(self, tmp_path: Path) -> None:
        backend = make_backend(tmp_path)
        _memory, first_id = backend.create_fact("User drinks Café au lait!", agent_name=AGENT, user_id=USER)
        _memory, second_id = backend.create_fact("user drinks cafe au lait", agent_name=AGENT, user_id=USER)
        assert second_id == first_id
        assert fact_ids(backend) == {first_id}

    def test_exact_duplicate_does_not_touch_timestamps(self, tmp_path: Path) -> None:
        backend = make_backend(tmp_path)
        _memory, fact_id = backend.create_fact("User lives in Tokyo", agent_name=AGENT, user_id=USER)
        created = stored_fact(backend, fact_id)
        _memory, returned_id = backend.create_fact("User lives in Tokyo", agent_name=AGENT, user_id=USER)
        assert returned_id == fact_id
        after = stored_fact(backend, fact_id)
        assert after["updatedAt"] == created["updatedAt"]
        assert after["revision"] == created["revision"]

    def test_near_duplicate_merges_into_existing_fact(self, tmp_path: Path) -> None:
        backend = make_backend(tmp_path)
        _memory, base_id = backend.create_fact("User prefers Python 3", category="preference", confidence=0.7, agent_name=AGENT, user_id=USER)
        base = stored_fact(backend, base_id)
        # Same tokens plus one more, and a higher confidence: near-duplicate.
        _memory, returned_id = backend.create_fact("User prefers Python 3.12", category="preference", confidence=0.9, agent_name=AGENT, user_id=USER)
        assert returned_id == base_id
        merged = stored_fact(backend, base_id)
        # Richer text wins, confidence takes the max, no second fact appears.
        assert merged["content"] == "User prefers Python 3.12"
        assert merged["confidence"] == 0.9
        assert merged["createdAt"] == base["createdAt"]
        assert merged["updatedAt"] >= base["updatedAt"]
        assert merged["revision"] == base["revision"] + 1
        assert fact_ids(backend) == {base_id}

    def test_near_duplicate_without_material_change_skips_write(self, tmp_path: Path) -> None:
        backend = make_backend(tmp_path)
        _memory, base_id = backend.create_fact("User prefers Python 3.12", confidence=0.9, agent_name=AGENT, user_id=USER)
        base = stored_fact(backend, base_id)
        # Shorter text + lower confidence: nothing material to merge.
        _memory, returned_id = backend.create_fact("User prefers Python 3", confidence=0.6, agent_name=AGENT, user_id=USER)
        assert returned_id == base_id
        after = stored_fact(backend, base_id)
        assert after == base
        assert fact_ids(backend) == {base_id}

    def test_distinct_fact_inserts_normally(self, tmp_path: Path) -> None:
        backend = make_backend(tmp_path)
        _memory, tokyo_id = backend.create_fact("User lives in Tokyo", agent_name=AGENT, user_id=USER)
        _memory, train_id = backend.create_fact("User commutes by train", agent_name=AGENT, user_id=USER)
        assert train_id != tokyo_id
        assert fact_ids(backend) == {tokyo_id, train_id}

    def test_threshold_one_disables_near_merge_but_keeps_exact_skip(self, tmp_path: Path) -> None:
        backend = make_backend(tmp_path, {"dedup_similarity_threshold": 1.0})
        _memory, base_id = backend.create_fact("User prefers Python 3", agent_name=AGENT, user_id=USER)
        # Exact still dedups.
        _memory, exact_id = backend.create_fact("USER PREFERS PYTHON 3!", agent_name=AGENT, user_id=USER)
        assert exact_id == base_id
        # Near-duplicate now inserts as its own fact.
        _memory, near_id = backend.create_fact("User prefers Python 3.12", agent_name=AGENT, user_id=USER)
        assert near_id != base_id
        assert fact_ids(backend) == {base_id, near_id}

    def test_old_record_participates_in_dedup(self, tmp_path: Path) -> None:
        write_legacy_v1_memory(tmp_path, "fact_legacy01", "User maintains legacy memory format facts")
        backend = make_backend(tmp_path)
        # No agent_name -> default bucket, where the migrated legacy facts live.
        _memory, returned_id = backend.create_fact("USER maintains legacy memory format FACTS!", agent_name=None, user_id=USER)
        assert returned_id == "fact_legacy01"
        document = backend.get_memory(user_id=USER)
        assert [str(fact["id"]) for fact in document["facts"]] == ["fact_legacy01"]


class TestExtractionDedup:
    """Dedup on the LLM-extraction apply path (``_apply_updates``)."""

    @staticmethod
    def base_memory() -> dict:
        memory = create_empty_memory()
        memory["facts"] = [
            {
                "id": "fact_base01",
                "content": "User prefers Python 3",
                "category": "preference",
                "confidence": 0.8,
                "createdAt": "2026-08-01T00:00:00Z",
                "updatedAt": "2026-08-01T00:00:00Z",
                "source": {"type": "manual", "threadId": None},
            }
        ]
        return memory

    def test_exact_and_near_duplicates_do_not_append(self, tmp_path: Path) -> None:
        updater = make_updater(tmp_path)
        update = {
            "user": {},
            "history": {},
            "factsToRemove": [],
            "newFacts": [
                {"content": "USER PREFERS PYTHON 3!", "category": "preference", "confidence": 0.9},  # exact
                {"content": "User prefers Python 3.12", "category": "preference", "confidence": 0.9},  # near
                {"content": "User commutes by train", "category": "context", "confidence": 0.9},  # distinct
            ],
        }
        metrics: dict = {}
        updated = updater._apply_updates(copy.deepcopy(self.base_memory()), update, metrics=metrics)
        facts = updated["facts"]
        assert len(facts) == 2
        base = next(fact for fact in facts if fact["id"] == "fact_base01")
        # The near-duplicate merged into the stored fact: richer text + max confidence.
        assert base["content"] == "User prefers Python 3.12"
        assert base["confidence"] == 0.9
        appended = next(fact for fact in facts if fact["id"] != "fact_base01")
        assert appended["content"] == "User commutes by train"
        assert metrics["facts_merged_near_duplicate"] == 1

    def test_within_batch_duplicates_collapse(self, tmp_path: Path) -> None:
        updater = make_updater(tmp_path)
        update = {
            "user": {},
            "history": {},
            "factsToRemove": [],
            "newFacts": [
                {"content": "User likes morning runs", "category": "context", "confidence": 0.9},
                {"content": "The user likes morning runs!", "category": "context", "confidence": 0.85},  # near-dup of the previous
            ],
        }
        updated = updater._apply_updates(copy.deepcopy(self.base_memory()), update)
        appended = [fact for fact in updated["facts"] if fact["id"] != "fact_base01"]
        assert len(appended) == 1
        # Richer text wins within the batch too.
        assert appended[0]["content"] in {"User likes morning runs", "The user likes morning runs!"}
        assert appended[0]["confidence"] == 0.9

    def test_low_confidence_new_fact_still_rejected_before_dedup(self, tmp_path: Path) -> None:
        updater = make_updater(tmp_path)
        update = {
            "user": {},
            "history": {},
            "factsToRemove": [],
            "newFacts": [
                {"content": "User prefers Python 3", "category": "preference", "confidence": 0.3},  # below threshold
            ],
        }
        metrics: dict = {}
        updated = updater._apply_updates(copy.deepcopy(self.base_memory()), update, metrics=metrics)
        assert [fact["id"] for fact in updated["facts"]] == ["fact_base01"]
        assert metrics["facts_passed_confidence"] == 0
        assert metrics["rejected_low_confidence"] == 1

    def test_persisted_extraction_dedup_via_create_and_apply(self, tmp_path: Path) -> None:
        # End-to-end across the real storage: facts merged by the extraction
        # path land as an update of the existing fact, not a new Markdown file.
        updater = make_updater(tmp_path)
        updater.create_memory_fact("User prefers Python 3", category="preference", confidence=0.8, agent_name=AGENT, user_id=USER)
        update = {
            "user": {},
            "history": {},
            "factsToRemove": [],
            "newFacts": [{"content": "User prefers Python 3.12", "category": "preference", "confidence": 0.9}],
        }
        memory = updater.get_memory_data(AGENT, user_id=USER)
        updated = updater._apply_updates(copy.deepcopy(memory), update)
        updater._save_memory_to_file(updated, AGENT, user_id=USER, expected_revision=int(memory.get("revision") or 0))
        fresh = updater.get_memory_data(AGENT, user_id=USER)
        assert len(fresh["facts"]) == 1
        assert fresh["facts"][0]["content"] == "User prefers Python 3.12"
        assert fresh["facts"][0]["revision"] == 2
