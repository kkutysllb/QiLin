"""Tests for RunStore.delete_by_thread — cascade cleanup of run metadata.

When a user deletes a conversation thread, every run row belonging to that
thread must be removed. ``RunRow`` carries denormalized message summaries
(``first_human_message`` / ``last_ai_message``) and full token usage, so
leaving orphaned rows is a real data-leak. These tests cover both the SQL
backing store (``RunRepository``) and the in-memory store used in tests.
"""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from qilin.persistence.base import Base
from qilin.persistence.run.model import RunRow  # noqa: F401 — registers the table
from qilin.persistence.run.sql import RunRepository
from qilin.runtime.runs.store.memory import MemoryRunStore

THREAD_A = "thread-a"
THREAD_B = "thread-b"
USER_1 = "user-1"
USER_2 = "user-2"


@pytest.fixture()
async def run_repo():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    repo = RunRepository(session_factory)
    yield repo
    await engine.dispose()


class TestRunRepositoryDeleteByThread:
    async def test_deletes_all_runs_for_thread(self, run_repo: RunRepository) -> None:
        # RunRow enforces at most one pending/running run per thread
        # (uq_runs_thread_active), so multi-run threads use terminal statuses.
        await run_repo.put("r1", thread_id=THREAD_A, user_id=USER_1, status="success")
        await run_repo.put("r2", thread_id=THREAD_A, user_id=USER_1, status="error")
        await run_repo.put("r3", thread_id=THREAD_B, user_id=USER_1)

        deleted = await run_repo.delete_by_thread(THREAD_A, user_id=USER_1)

        assert deleted == 2
        assert await run_repo.list_by_thread(THREAD_A, user_id=USER_1) == []
        # Other threads are untouched.
        remaining = await run_repo.list_by_thread(THREAD_B, user_id=USER_1)
        assert [r["run_id"] for r in remaining] == ["r3"]

    async def test_respects_user_isolation(self, run_repo: RunRepository) -> None:
        # Same thread_id, different owners — only the caller's rows vanish.
        await run_repo.put("r1", thread_id=THREAD_A, user_id=USER_1, status="success")
        await run_repo.put("r2", thread_id=THREAD_A, user_id=USER_2, status="success")

        deleted = await run_repo.delete_by_thread(THREAD_A, user_id=USER_1)

        assert deleted == 1
        # USER_2's run survives.
        survivor = await run_repo.get("r2", user_id=USER_2)
        assert survivor is not None
        assert survivor["thread_id"] == THREAD_A

    async def test_user_id_none_clears_all_owners(self, run_repo: RunRepository) -> None:
        await run_repo.put("r1", thread_id=THREAD_A, user_id=USER_1, status="success")
        await run_repo.put("r2", thread_id=THREAD_A, user_id=USER_2, status="success")

        deleted = await run_repo.delete_by_thread(THREAD_A, user_id=None)

        assert deleted == 2
        assert await run_repo.list_by_thread(THREAD_A, user_id=None) == []

    async def test_missing_thread_returns_zero(self, run_repo: RunRepository) -> None:
        deleted = await run_repo.delete_by_thread("ghost", user_id=USER_1)
        assert deleted == 0

    async def test_clears_denormalized_message_summaries(self, run_repo: RunRepository) -> None:
        """first_human_message / last_ai_message leak conversation content."""
        await run_repo.put("r1", thread_id=THREAD_A, user_id=USER_1, status="running")
        await run_repo.update_run_completion(
            "r1",
            status="success",
            first_human_message="secret question",
            last_ai_message="secret answer",
            message_count=2,
        )

        await run_repo.delete_by_thread(THREAD_A, user_id=USER_1)

        # The row is gone, so its denormalized summaries are unrecoverable.
        assert await run_repo.get("r1", user_id=USER_1) is None


class TestMemoryRunStoreDeleteByThread:
    async def test_deletes_all_runs_for_thread(self) -> None:
        store = MemoryRunStore()
        # MemoryRunStore does not enforce the active-run uniqueness invariant,
        # but we mirror the SQL test's statuses for consistency.
        await store.put("r1", thread_id=THREAD_A, user_id=USER_1, status="success")
        await store.put("r2", thread_id=THREAD_A, user_id=USER_1, status="error")
        await store.put("r3", thread_id=THREAD_B, user_id=USER_1)

        deleted = await store.delete_by_thread(THREAD_A, user_id=USER_1)

        assert deleted == 2
        assert await store.list_by_thread(THREAD_A, user_id=USER_1) == []
        assert [r["run_id"] for r in await store.list_by_thread(THREAD_B, user_id=USER_1)] == ["r3"]

    async def test_respects_user_isolation(self) -> None:
        store = MemoryRunStore()
        await store.put("r1", thread_id=THREAD_A, user_id=USER_1, status="success")
        await store.put("r2", thread_id=THREAD_A, user_id=USER_2, status="success")

        deleted = await store.delete_by_thread(THREAD_A, user_id=USER_1)

        assert deleted == 1
        assert await store.get("r2", user_id=USER_2) is not None

    async def test_missing_thread_returns_zero(self) -> None:
        store = MemoryRunStore()
        assert await store.delete_by_thread("ghost", user_id=USER_1) == 0
