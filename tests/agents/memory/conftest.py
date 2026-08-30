"""Shared fixtures for the QiLinMem backend test suites (dedup + search)."""

import json
from pathlib import Path

import pytest

from qilin.agents.memory.backends.qilinmem.qilin_mem import QiLinMem

USER = "u1"


@pytest.fixture()
def make_backend():
    """Factory: build a QiLinMem rooted at ``tmp_path`` (lexical-only by default)."""

    def _make_backend(tmp_path: Path, backend_config: dict | None = None) -> QiLinMem:
        config: dict = {"storage_path": str(tmp_path), "retrieval_adapter": ""}
        config.update(backend_config or {})
        return QiLinMem(backend_config=config)

    return _make_backend


@pytest.fixture()
def write_legacy_v1_memory():
    """Factory: write a pre-v2 user memory.json (facts inlined in the global document).

    ``work_context_summary`` seeds the migrated ``user.workContext.summary``;
    the search suite asserts a non-empty value survives the v1 -> v2 migration.
    """

    def _write(
        tmp_path: Path,
        fact_id: str,
        content: str,
        work_context_summary: str = "",
    ) -> None:
        memory_dir = tmp_path / "users" / USER
        memory_dir.mkdir(parents=True, exist_ok=True)
        (memory_dir / "memory.json").write_text(
            json.dumps(
                {
                    "version": "1.0",
                    "revision": 3,
                    "lastUpdated": "2026-01-01T00:00:00Z",
                    "user": {
                        "workContext": {"summary": work_context_summary, "updatedAt": "2026-01-01T00:00:00Z"},
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

    return _write
