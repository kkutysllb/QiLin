"""Sandbox-mode knob-event API behavior (DSH sandbox/mode alignment).

Mirrors the workspaces API test harness: real router on a minimal FastAPI
app, module-global patches for the store getters, one shared asyncio loop.
"""

from __future__ import annotations

from types import SimpleNamespace

import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.gateway.routers.sandbox_mode as sb_router_module
from app.gateway.authz import AuthContext
from qilin.persistence.base import Base
from qilin.persistence.sandbox_mode.sql import SandboxModeRepository
from qilin.persistence.thread_meta.sql import ThreadMetaRepository

OWNER = "user-A"
OTHER = "user-B"


@pytest_asyncio.fixture
async def client():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sf = async_sessionmaker(engine, expire_on_commit=False)
    events = SandboxModeRepository(sf)
    threads = ThreadMetaRepository(sf)

    from qilin.runtime.user_context import reset_current_user, set_current_user

    token = set_current_user(SimpleNamespace(id=OWNER))

    app = FastAPI()
    app.include_router(sb_router_module.router)

    async def _stamp_auth(request, call_next):
        request.state.auth = AuthContext(
            user=SimpleNamespace(id=OWNER),
            permissions=["threads:read", "threads:write", "threads:delete"],
        )
        return await call_next(request)

    app.middleware("http")(_stamp_auth)

    async def _fake_current_user(request):
        return OWNER

    originals = (
        sb_router_module.get_current_user,
        sb_router_module.get_sandbox_mode_store,
    )
    sb_router_module.get_current_user = _fake_current_user
    sb_router_module.get_sandbox_mode_store = lambda request: events

    app.state.thread_store = threads
    app.state.sandbox_mode_store = events

    transport = httpx.ASGITransport(app=app)
    try:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            yield c, events, threads
    finally:
        (
            sb_router_module.get_current_user,
            sb_router_module.get_sandbox_mode_store,
        ) = originals
        reset_current_user(token)
        await engine.dispose()


pytestmark = pytest.mark.asyncio


def _base(thread_id: str) -> str:
    return f"/api/threads/{thread_id}/sandbox-mode"


class TestFoldResolution:
    async def test_no_event_resolves_to_default(self, client):
        c, _, _ = client
        resp = await c.get(_base("thread-legacy"))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body == {
            "thread_id": "thread-legacy",
            "mode": "danger-full-access",
            "source": None,
            "updated_at": None,
            "defaulted": True,
        }


class TestSetMode:
    async def _make_thread(self, threads, thread_id: str, owner: str) -> None:
        await threads.create(thread_id, metadata={}, user_id=owner)

    async def test_post_requires_existing_owned_row(self, client):
        c, _, threads = client
        # Missing row → 404 via require_existing (anti-enumeration).
        missing = await c.post(
            _base("t-absent"), json={"mode": "read-only"}
        )
        assert missing.status_code == 404

        await self._make_thread(threads, "t-owned", OWNER)
        ok = await c.post(_base("t-owned"), json={"mode": "read-only"})
        assert ok.status_code == 200, ok.text
        assert ok.json()["mode"] == "read-only"

        # Another user's row stays invisible (strict-deny).
        await self._make_thread(threads, "t-other", OTHER)
        cross = await c.post(_base("t-other"), json={"mode": "read-only"})
        assert cross.status_code == 404

    async def test_invalid_mode_is_400_with_stable_code(self, client):
        c, _, threads = client
        await self._make_thread(threads, "t-owned", OWNER)
        bad = await c.post(_base("t-owned"), json={"mode": "full-control"})
        assert bad.status_code == 400
        assert bad.json()["detail"]["code"] == "SANDBOX_MODE_INVALID"

    async def test_fold_is_last_write_wins_and_persists(self, client):
        c, _, threads = client
        await self._make_thread(threads, "t-fold", OWNER)
        await c.post(_base("t-fold"), json={"mode": "workspace-write"})
        await c.post(_base("t-fold"), json={"mode": "read-only"})

        folded = (await c.get(_base("t-fold"))).json()
        assert folded["defaulted"] is False
        assert folded["mode"] == "read-only"
        assert folded["source"] == "user"

        log = (await c.get(f"{_base('t-fold')}/events")).json()
        assert [e["mode"] for e in log] == ["workspace-write", "read-only"]
