"""Gateway workspace capture: first-materialization cwd write + auto-attach.

Locks the DSH-alignment semantics of ``_ensure_thread_metadata``: the
``workspace_id`` run-context key resolves to the registry's canonical path,
is written exactly once as ``threads_meta.cwd``, and auto-attaches the
thread to the workspace account. Existing threads are never re-captured;
absent/unknown workspace ids degrade to NULL cwd (Ungrouped); all registry
failures are non-fatal for the run.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import (
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

import qilin.persistence.models  # noqa: F401

# imported eagerly below the storage imports; services pulls gateway auth
# config which demands QILIN_INTERNAL_AUTH_TOKEN in the environment.
from app.gateway.services import _ensure_thread_metadata
from qilin.persistence.base import Base
from qilin.persistence.thread_meta.sql import ThreadMetaRepository
from qilin.persistence.workspace.sql import WorkspaceRepository


class _Recorder:
    """Thread store spy delegating creation to the real repository."""

    def __init__(self, real: ThreadMetaRepository) -> None:
        self._real = real
        self.created_with: list[dict] = []

    async def get(self, thread_id, **kwargs):
        return await self._real.get(thread_id, **kwargs)

    async def create(self, thread_id, **kwargs):
        self.created_with.append({"thread_id": thread_id, **kwargs})
        return await self._real.create(thread_id, **kwargs)

    def __getattr__(self, name):
        return getattr(self._real, name)


class _RunCtx:
    def __init__(self, thread_store, workspace_store) -> None:
        self.thread_store = thread_store
        self.workspace_store = workspace_store


class _Record:
    def __init__(self, thread_id: str) -> None:
        self.thread_id = thread_id
        self.assistant_id = None
        self.metadata = {}


@pytest_asyncio.fixture
async def env():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sf = async_sessionmaker(engine, expire_on_commit=False)
    threads = ThreadMetaRepository(sf)
    workspaces = WorkspaceRepository(sf)
    ctx = _RunCtx(threads, workspaces)

    # Gateway paths resolve user_id=AUTO through the contextvar; tests set a
    # standing current user so AUTO resolution succeeds like auth middleware.
    from types import SimpleNamespace

    from qilin.runtime.user_context import reset_current_user, set_current_user

    token = set_current_user(SimpleNamespace(id=OWNER))
    yield ctx, threads, workspaces
    reset_current_user(token)
    await engine.dispose()


OWNER = "user-A"

# imported lazily so module-level auth-free import stays possible elsewhere


pytestmark = pytest.mark.asyncio


async def test_first_run_with_workspace_captures_cwd_and_attaches(env):
    ctx, threads, workspaces = env
    ws = await workspaces.create(user_id=OWNER, canonical_path="/tmp/proj-alpha")

    recorder = _Recorder(threads)
    ctx.thread_store = recorder
    await _ensure_thread_metadata(
        ctx, _Record("t-new"), owner_user_id=OWNER, workspace_id=ws["id"]
    )

    row = await threads.get("t-new", user_id=OWNER)
    assert row["cwd"] == "/tmp/proj-alpha"
    assert recorder.created_with[0]["cwd"] == "/tmp/proj-alpha"
    assert await workspaces.session_account(ws["id"], user_id=OWNER) == ["t-new"]


async def test_existing_thread_is_never_recaptured(env):
    """A second run on an existing thread must not touch its cwd nor attach."""
    ctx, threads, workspaces = env
    ws_a = await workspaces.create(user_id=OWNER, canonical_path="/tmp/proj-a")
    ws_b = await workspaces.create(user_id=OWNER, canonical_path="/tmp/proj-b")
    await threads.create("t-old", user_id=OWNER, cwd="/tmp/proj-a")

    await _ensure_thread_metadata(
        ctx, _Record("t-old"), owner_user_id=OWNER, workspace_id=ws_b["id"]
    )
    assert (await threads.get("t-old", user_id=OWNER))["cwd"] == "/tmp/proj-a"
    assert await workspaces.session_account(ws_a["id"], user_id=OWNER) == []
    assert await workspaces.session_account(ws_b["id"], user_id=OWNER) == []


async def test_unknown_workspace_degrades_to_null_cwd(env):
    ctx, threads, _ = env
    await _ensure_thread_metadata(
        ctx, _Record("t-x"), owner_user_id=OWNER, workspace_id="ghost"
    )
    assert (await threads.get("t-x", user_id=OWNER))["cwd"] is None


async def test_absent_workspace_id_yields_ungrouped(env):
    ctx, threads, _ = env
    await _ensure_thread_metadata(ctx, _Record("t-y"), owner_user_id=OWNER)
    assert (await threads.get("t-y", user_id=OWNER))["cwd"] is None


async def test_registry_failure_is_non_fatal_for_creation(env):
    class _BrokenWorkspaceStore:
        async def get(self, *a, **kw):
            raise RuntimeError("registry unavailable")

    ctx, threads, _ = env
    ctx.workspace_store = _BrokenWorkspaceStore()
    # Must not raise; thread still materializes with NULL cwd.
    await _ensure_thread_metadata(
        ctx, _Record("t-z"), owner_user_id=OWNER, workspace_id="ws-1"
    )
    assert (await threads.get("t-z", user_id=OWNER))["cwd"] is None
