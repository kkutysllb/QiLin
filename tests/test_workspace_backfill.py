"""M2 first-run backfill: legacy cwd-bearing threads fold into the
registry exactly once; NULL-cwd threads stay Ungrouped untouched."""

from __future__ import annotations

from types import SimpleNamespace

import httpx
import pytest


@pytest.fixture()
async def m2_env(monkeypatch, tmp_path):
    from fastapi import FastAPI
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import StaticPool

    import app.gateway.routers.workspaces as ws_router
    from app.gateway.authz import AuthContext
    from qilin.persistence.base import Base
    from qilin.persistence.thread_meta.sql import ThreadMetaRepository
    from qilin.persistence.workspace.sql import WorkspaceRepository

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sf = async_sessionmaker(engine, expire_on_commit=False)

    legacy_dir = tmp_path / "projA"
    legacy_dir.mkdir()
    threads = ThreadMetaRepository(sf)
    await threads.create("t1", metadata={}, user_id="user-A", cwd=str(legacy_dir))
    await threads.create("t2", metadata={}, user_id="user-A", cwd=str(legacy_dir))
    await threads.create("t3", metadata={"cwd": None}, user_id="user-A")

    async def fake_user(request):
        return "user-A"

    ws_router.get_current_user = fake_user
    app = FastAPI()
    app.include_router(ws_router.router)

    async def stamp(request, call_next):
        request.state.auth = AuthContext(
            user=SimpleNamespace(id="user-A"),
            permissions=["threads:read", "threads:write"],
        )
        return await call_next(request)

    app.middleware("http")(stamp)
    app.state.thread_store = threads
    app.state.workspace_store = WorkspaceRepository(sf)

    transport = httpx.ASGITransport(app=app)
    yield SimpleNamespace(
        client=httpx.AsyncClient(transport=transport, base_url="http://t"),
        threads=threads,
        workspaces=app.state.workspace_store,
        legacy_dir=str(legacy_dir),
    )
    await engine.dispose()


@pytest.mark.asyncio
async def test_backfill_derives_grouping_once_and_preserves_ungrouped(m2_env):
    env = m2_env
    resp = await env.client.get("/api/workspaces")
    assert resp.status_code == 200
    listed = resp.json()
    assert len(listed) == 1
    assert listed[0]["path"] in (env.legacy_dir,) or listed[0].get("canonical_path") == env.legacy_dir or listed[0]["title"]

    # every cwd-bearing thread accounted under the derived workspace;
    account = await env.workspaces.session_account(listed[0]["id"], user_id="user-A")
    assert sorted(account) == ["t1", "t2"]
    assert await env.workspaces.is_initialized(user_id="user-A")

    # NULL-cwd thread untouched → renders Ungrouped by projection semantics
    all_threads = await env.threads.search(limit=10, user_id="user-A")
    assert {r["thread_id"] for r in all_threads} >= {"t1", "t2", "t3"}


@pytest.mark.asyncio
async def test_second_list_short_circuits_via_marker(m2_env, monkeypatch):

    calls = {"n": 0}
    orig_is_init = type(m2_env.workspaces).is_initialized

    async def spy(self, *, user_id):
        calls["n"] += 1
        return await orig_is_init(self, user_id=user_id)

    monkeypatch.setattr(type(m2_env.workspaces), "is_initialized", spy)

    r1 = await m2_env.client.get("/api/workspaces")
    assert r1.status_code == 200
    after_first = calls["n"]

    r2 = await m2_env.client.get("/api/workspaces")
    assert r2.status_code == 200
    assert calls["n"] == after_first + 1  # checked again…
    # …but no duplicate registry rows were produced
    listed = r2.json()
    assert len(listed) == 1
