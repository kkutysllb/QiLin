"""Workspace registry repository behavior (DSH dsh-workspace alignment).

Covers the verb surface over an in-memory SQLite database built from the
real ORM metadata: idempotent canonical-path creation with prepend order,
per-user scoping, rename, insertBefore reorder semantics for both the
registry list and thread accounts, cwd-validated attach, idempotent
detach/delete, the global archive set, and the bootstrap marker.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

import qilin.persistence.models  # noqa: F401  (registers workspace tables)
from qilin.persistence.base import Base
from qilin.persistence.workspace.sql import WorkspaceError, WorkspaceRepository


@pytest_asyncio.fixture
async def repo() -> AsyncIterator[tuple[WorkspaceRepository, AsyncEngine]]:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield WorkspaceRepository(async_sessionmaker(engine, expire_on_commit=False)), engine
    await engine.dispose()


pytestmark = pytest.mark.asyncio

USER = "user-A"
ALPHA = "/tmp/demo-alpha"
BETA = "/tmp/demo-beta"


async def account(repo: WorkspaceRepository, ws_id: str) -> list[str]:
    return await repo.session_account(ws_id, user_id=USER)


class TestCreation:
    async def test_create_defaults_title_to_basename(self, repo):
        r, _ = repo
        w1 = await r.create(user_id=USER, canonical_path=ALPHA)
        assert w1["title"] == "demo-alpha"

    async def test_create_is_idempotent_per_canonical_path(self, repo):
        """Repeated registration returns the existing record; title keeps its
        original value even when the repeat passes a different one."""
        r, _ = repo
        w1 = await r.create(user_id=USER, canonical_path=ALPHA)
        again = await r.create(user_id=USER, canonical_path=ALPHA, title="renamed?")
        assert again["id"] == w1["id"]
        assert again["title"] == "demo-alpha"

    async def test_new_workspaces_prepend_to_durable_order(self, repo):
        r, _ = repo
        w1 = await r.create(user_id=USER, canonical_path=ALPHA)
        w2 = await r.create(user_id=USER, canonical_path=BETA)
        listed = await r.list_for_user(user_id=USER)
        assert [w["id"] for w in listed] == [w2["id"], w1["id"]]
        assert listed[0]["position"] == 0


class TestUserScoping:
    async def test_other_user_sees_nothing(self, repo):
        r, _ = repo
        await r.create(user_id=USER, canonical_path=ALPHA)
        assert await r.list_for_user(user_id="user-B") == []

    async def test_same_path_different_users_coexist(self, repo):
        r, _ = repo
        wa = await r.create(user_id=USER, canonical_path=ALPHA)
        wb = await r.create(user_id="user-B", canonical_path=ALPHA)
        assert wa["id"] != wb["id"]
        assert len(await r.list_for_user(user_id="user-B")) == 1


class TestReorder:
    async def test_insert_before_none_appends_to_end(self, repo):
        r, _ = repo
        w1 = await r.create(user_id=USER, canonical_path=ALPHA)
        w2 = await r.create(user_id=USER, canonical_path=BETA)
        await r.insert_before(w2["id"], None, user_id=USER)
        listed = await r.list_for_user(user_id=USER)
        assert [w["id"] for w in listed] == [w1["id"], w2["id"]]

    async def test_insert_before_anchor_lands_directly_before(self, repo):
        r, _ = repo
        w1 = await r.create(user_id=USER, canonical_path=ALPHA)
        w2 = await r.create(user_id=USER, canonical_path=BETA)
        w3 = await r.create(user_id=USER, canonical_path="/tmp/demo-gamma")
        # durable order: w3, w2, w1 → move w3 directly before w1
        await r.insert_before(w3["id"], w1["id"], user_id=USER)
        listed = await r.list_for_user(user_id=USER)
        assert [w["id"] for w in listed] == [w2["id"], w3["id"], w1["id"]]

    async def test_unknown_anchor_rejects(self, repo):
        r, _ = repo
        w1 = await r.create(user_id=USER, canonical_path=ALPHA)
        with pytest.raises(WorkspaceError) as exc_info:
            await r.insert_before(w1["id"], "nope", user_id=USER)
        assert exc_info.value.code == "WORKSPACE_NOT_FOUND"


class TestRename:
    async def test_set_title(self, repo):
        r, _ = repo
        w1 = await r.create(user_id=USER, canonical_path=ALPHA)
        got = await r.set_title(w1["id"], "Alpha 工作区", user_id=USER)
        assert got["title"] == "Alpha 工作区"


class TestThreadAccount:
    async def test_attach_accepts_any_thread_registry_authoritative(self, repo):
        """Explicit attachment is trusted: a thread whose stored cwd differs
        (legacy NULL-cwd, moved dir) still joins the account — the tree
        derives from the registry, never re-checks paths."""
        r, _ = repo
        w1 = await r.create(user_id=USER, canonical_path=ALPHA)
        await r.attach_thread(w1["id"], "t-null", user_id=USER)
        assert await account(r, w1["id"]) == ["t-null"]
        await r.attach_thread(w1["id"], "t-other", user_id=USER, thread_cwd="/elsewhere")
        assert await account(r, w1["id"]) == ["t-other", "t-null"]

    async def test_attach_prepends_and_is_idempotent(self, repo):
        r, _ = repo
        w1 = await r.create(user_id=USER, canonical_path=ALPHA)
        for tid in ("t1", "t2", "t3"):
            await r.attach_thread(w1["id"], tid, user_id=USER, thread_cwd=ALPHA)
        assert await account(r, w1["id"]) == ["t3", "t2", "t1"]
        await r.attach_thread(w1["id"], "t3", user_id=USER, thread_cwd=ALPHA)
        assert await account(r, w1["id"]) == ["t3", "t2", "t1"]

    async def test_move_semantics(self, repo):
        r, _ = repo
        w1 = await r.create(user_id=USER, canonical_path=ALPHA)
        t1, t2, t3 = "t1", "t2", "t3"
        for tid in (t1, t2, t3):
            await r.attach_thread(w1["id"], tid, user_id=USER, thread_cwd=ALPHA)

        # Display order is index-ascending: [t3,t2,t1] shows t3 on top.
        # "directly before" = index == anchor_index - 1.

        # genuine no-op: already last, no anchor
        await r.move_thread_before(w1["id"], t1, None, user_id=USER)
        assert await account(r, w1["id"]) == [t3, t2, t1]
        # genuine no-op: t3 already directly before t2 (indices 0 and 1)
        await r.move_thread_before(w1["id"], t3, t2, user_id=USER)
        assert await account(r, w1["id"]) == [t3, t2, t1]

        # real insertion: t2 lands directly before t3 → top
        await r.move_thread_before(w1["id"], t2, t3, user_id=USER)
        assert await account(r, w1["id"]) == [t2, t3, t1]

        # append-to-end via anchor=None
        await r.move_thread_before(w1["id"], t2, None, user_id=USER)
        assert await account(r, w1["id"]) == [t3, t1, t2]

    async def test_unaccounted_move_rejects(self, repo):
        r, _ = repo
        w1 = await r.create(user_id=USER, canonical_path=ALPHA)
        with pytest.raises(WorkspaceError) as exc_info:
            await r.move_thread_before(w1["id"], "ghost", None, user_id=USER)
        assert exc_info.value.code == "THREAD_NOT_ACCOUNTED"

    async def test_detach_is_idempotent(self, repo):
        r, _ = repo
        w1 = await r.create(user_id=USER, canonical_path=ALPHA)
        await r.attach_thread(w1["id"], "t1", user_id=USER, thread_cwd=ALPHA)
        await r.detach_thread(w1["id"], "t1", user_id=USER)
        await r.detach_thread(w1["id"], "t1", user_id=USER)
        assert await account(r, w1["id"]) == []


class TestArchiveSet:
    async def test_archive_unarchive_roundtrip(self, repo):
        r, _ = repo
        await r.archive_thread("t9", user_id=USER)
        assert await r.archived_thread_ids(user_id=USER) == ["t9"]
        await r.archive_thread("t8", user_id=USER)
        await r.unarchive_thread("t9", user_id=USER)
        assert await r.archived_thread_ids(user_id=USER) == ["t8"]

    async def test_archive_scoped_per_user(self, repo):
        r, _ = repo
        await r.archive_thread("t9", user_id=USER)
        assert await r.archived_thread_ids(user_id="user-B") == []


class TestBootstrapMarker:
    async def test_initialized_flag(self, repo):
        r, _ = repo
        assert await r.is_initialized(user_id=USER) is False
        await r.mark_initialized(user_id=USER)
        assert await r.is_initialized(user_id=USER) is True


class TestDeletion:
    async def test_delete_returns_false_for_unknown(self, repo):
        r, _ = repo
        assert await r.delete("nope", user_id=USER) is False

    async def test_delete_second_time_false_then_account_gone(self, repo):
        r, _ = repo
        w1 = await r.create(user_id=USER, canonical_path=ALPHA)
        await r.attach_thread(w1["id"], "t1", user_id=USER, thread_cwd=ALPHA)
        assert await r.delete(w1["id"], user_id=USER) is True
        assert await r.delete(w1["id"], user_id=USER) is False
        with pytest.raises(WorkspaceError) as exc_info:
            await account(r, w1["id"])
        assert exc_info.value.code == "WORKSPACE_NOT_FOUND"

    async def test_threads_survive_registration_deletion_elsewhere(self, repo):
        """Deleting the workspace never touches thread rows — the thread
        simply loses its group and renders under Ungrouped."""
        r, engine = repo
        w1 = await r.create(user_id=USER, canonical_path=ALPHA)
        session_factory = async_sessionmaker(engine, expire_on_commit=False)

        async with session_factory() as session:
            from qilin.persistence.thread_meta.model import ThreadMetaRow

            session.add(ThreadMetaRow(thread_id="t1", status="idle"))
            await session.commit()

        await r.delete(w1["id"], user_id=USER)
        async with session_factory() as session:
            row = await session.get(ThreadMetaRow, "t1")
            assert row is not None
