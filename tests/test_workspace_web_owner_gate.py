"""Regression: web (non-internal) runs must still bind the chosen workspace.

Root cause of the "workspace empty / thread stuck in Ungrouped" bug was NOT
the context extraction -- it was the owner gate. ``start_run`` resolved the
run owner via ``get_trusted_internal_owner_user_id(request)``, which returns a
value ONLY for trusted internal (scheduler/channel) requests and is always
``None`` for a normal browser session. Every workspace-binding step then
gated on that ``None`` owner, so for web runs:

* the server-resolved ``workspace_cwd`` was never injected, leaving the agent
  anchored to the empty staging area, and
* ``_ensure_thread_metadata`` skipped the per-user registry lookup and the
  ``attach_thread`` call, so the thread materialized with ``cwd=NULL`` and
  stayed in Ungrouped.

The fix introduces ``binding_owner_user_id = owner_user_id or user.id`` so the
workspace capture uses the authenticated web user as the effective owner.
"""

from __future__ import annotations

import inspect
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import qilin.persistence.models  # noqa: F401
from qilin.persistence.base import Base
from qilin.persistence.thread_meta.sql import ThreadMetaRepository
from qilin.persistence.workspace.sql import WorkspaceRepository

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# services pulls gateway auth config which demands QILIN_INTERNAL_AUTH_TOKEN.
from app.gateway.services import _ensure_thread_metadata  # noqa: E402

OWNER = "web-user-A"


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

    from qilin.runtime.user_context import reset_current_user, set_current_user

    token = set_current_user(SimpleNamespace(id=OWNER))
    yield ctx, threads, workspaces
    reset_current_user(token)
    await engine.dispose()


async def test_web_owner_binds_workspace(env):
    """A non-internal (web) effective owner must capture cwd and attach."""
    ctx, threads, workspaces = env
    ws = await workspaces.create(user_id=OWNER, canonical_path="/tmp/web-proj")

    # Mirror the fix: owner_user_id is None for web, so the effective owner is
    # request.state.user.id. ``_ensure_thread_metadata`` receives that owner.
    binding_owner_user_id = None or str(OWNER)
    await _ensure_thread_metadata(
        ctx, _Record("t-web"), owner_user_id=binding_owner_user_id, workspace_id=ws["id"]
    )

    row = await threads.get("t-web", user_id=OWNER)
    assert row["cwd"] == "/tmp/web-proj"
    assert await workspaces.session_account(ws["id"], user_id=OWNER) == ["t-web"]


async def test_web_owner_without_workspace_stays_ungrouped(env):
    ctx, threads, _ = env
    await _ensure_thread_metadata(ctx, _Record("t-web-plain"), owner_user_id=OWNER)
    assert (await threads.get("t-web-plain", user_id=OWNER))["cwd"] is None


class TestStartRunWiring:
    def test_start_run_computes_binding_owner(self):
        import app.gateway.services as services

        src = inspect.getsource(services.start_run)
        assert "binding_owner_user_id = owner_user_id or (" in src
        assert "str(user.id) if user is not None else None" in src

    def test_workspace_capture_gates_on_binding_owner(self):
        import app.gateway.services as services

        src = inspect.getsource(services.start_run)
        assert "if run_workspace_id and binding_owner_user_id:" in src
        assert "run_workspace_id, user_id=binding_owner_user_id" in src

    def test_thread_metadata_uses_binding_owner(self):
        import app.gateway.services as services

        src = inspect.getsource(services.start_run)
        assert "owner_user_id=binding_owner_user_id," in src


async def test_preexisting_thread_binds_workspace(env):
    """A thread that already exists without a workspace binding must be
    attached when its run first carries a ``workspace_id``, so it leaves
    Ungrouped instead of staying ungrouped forever."""
    ctx, threads, workspaces = env
    await threads.create("t-preexisting", user_id=OWNER)
    ws = await workspaces.create(user_id=OWNER, canonical_path="/tmp/web-proj")

    await _ensure_thread_metadata(
        ctx, _Record("t-preexisting"), owner_user_id=OWNER, workspace_id=ws["id"]
    )

    assert await workspaces.session_account(ws["id"], user_id=OWNER) == ["t-preexisting"]


async def test_preexisting_thread_without_workspace_stays_ungrouped(env):
    """Without a ``workspace_id``, a pre-existing thread is never attached."""
    ctx, threads, workspaces = env
    await threads.create("t-preexisting-plain", user_id=OWNER)
    ws = await workspaces.create(user_id=OWNER, canonical_path="/tmp/web-proj")

    await _ensure_thread_metadata(ctx, _Record("t-preexisting-plain"), owner_user_id=OWNER)

    assert await workspaces.session_account(ws["id"], user_id=OWNER) == []