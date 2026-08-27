"""Per-thread sidebar tab state REST API behavior (Better Sidebar web §3.2).

Mirrors tests/test_workspaces_api.py: the real router mounted on a minimal
FastAPI app with an auth-stamping middleware that mirrors what gateway auth
middleware provides to require_permission, plus the current-user contextvar
that ThreadMetaRepository methods resolve user_id=AUTO against. The store is
an in-memory ThreadMetaRepository; the router's module-level getter seam is
patched instead of using dependency_overrides.
"""

from __future__ import annotations

from types import SimpleNamespace

import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.gateway.routers.sidebar_tabs as tabs_module
import qilin.persistence.models  # noqa: F401
from app.gateway.authz import AuthContext
from qilin.persistence.base import Base
from qilin.persistence.thread_meta.sql import ThreadMetaRepository
from qilin.runtime.user_context import reset_current_user, set_current_user

OWNER = "user-A"
THREAD = "thr-001"


@pytest_asyncio.fixture
async def client(tmp_path):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sf = async_sessionmaker(engine, expire_on_commit=False)
    threads = ThreadMetaRepository(sf)
    await threads.create(thread_id=THREAD, user_id=OWNER)

    token = set_current_user(SimpleNamespace(id=OWNER))

    app = FastAPI()
    app.include_router(tabs_module.router)
    app.state.thread_store = threads

    async def _stamp_auth(request, call_next):
        request.state.auth = AuthContext(
            user=SimpleNamespace(id=OWNER),
            permissions=["threads:read", "threads:write"],
        )
        return await call_next(request)

    app.middleware("http")(_stamp_auth)

    originals = tabs_module.get_thread_store
    tabs_module.get_thread_store = lambda request: threads

    transport = httpx.ASGITransport(app=app)
    try:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac
    finally:
        tabs_module.get_thread_store = originals
        reset_current_user(token)
        await engine.dispose()


@pytest.mark.asyncio
async def test_get_default_empty_when_no_metadata(client):
    r = await client.get(f"/api/threads/{THREAD}/sidebar-tabs")
    assert r.status_code == 200
    assert r.json() == {"tabs": [], "active": None, "split": "single"}


@pytest.mark.asyncio
async def test_put_then_get_roundtrip(client):
    payload = {
        "tabs": [
            {
                "key": "qilin:files",
                "panel": "qilin:files",
                "title": "Files",
                "icon": None,
                "payload": {"path": "src"},
                "pinned": False,
                "created_at": 1700000000.0,
            },
        ],
        "active": "qilin:files",
        "split": "vertical",
    }
    r = await client.put(f"/api/threads/{THREAD}/sidebar-tabs", json=payload)
    assert r.status_code == 200, r.text
    r2 = await client.get(f"/api/threads/{THREAD}/sidebar-tabs")
    assert r2.json() == payload


@pytest.mark.asyncio
async def test_put_rejects_unknown_thread(client):
    r = await client.put(
        "/api/threads/nonexistent/sidebar-tabs", json={"tabs": [], "active": None}
    )
    assert r.status_code == 404
