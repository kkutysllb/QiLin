"""Files router path-guard + basic list behavior."""
from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest
import pytest_asyncio
from fastapi import APIRouter, FastAPI
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import qilin.persistence.models  # noqa: F401
import app.gateway.routers.files as files_module
from app.gateway.authz import AuthContext
from app.gateway.deps import get_current_user
from qilin.config.paths import Paths
from qilin.persistence.base import Base


OWNER = "user-A"
THREAD = "thr-001"


@pytest_asyncio.fixture
async def client(tmp_path, monkeypatch):
    # Redirect QILIN_HOME so per-thread workspace path is inside tmp_path.
    home = tmp_path / ".qilin"
    home.mkdir()
    monkeypatch.setattr("qilin.config.paths.get_paths", lambda: Paths(home))
    # Pre-create thread workspace dir with a sample tree.
    ws = Paths(home).user_workspace_dir(THREAD)
    ws.mkdir(parents=True)
    (ws / "README.md").write_text("# hello", encoding="utf-8")
    (ws / "src").mkdir()
    (ws / "src" / "main.py").write_text("print('hi')", encoding="utf-8")

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    app = FastAPI()
    app.include_router(files_module.router)

    async def _stamp_auth(request, call_next):
        request.state.auth = AuthContext(
            user=SimpleNamespace(id=OWNER),
            permissions=["threads:read", "threads:write", "threads:delete"],
        )
        return await call_next(request)

    app.middleware("http")(_stamp_auth)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    # Reset module-level overrides to keep tests isolated.
    files_module.get_current_user = get_current_user


def test_resolve_workspace_path_rejects_traversal():
    """Path traversal (..) must fail with path_outside_workspace."""
    from app.gateway.routers.files import _resolve_workspace_path
    with pytest.raises(files_module.WorkspacePathError) as ei:
        _resolve_workspace_path(THREAD, "../../etc/passwd")
    assert ei.value.code == "path_outside_workspace"


def test_resolve_workspace_path_accepts_root():
    from app.gateway.routers.files import _resolve_workspace_path
    root = _resolve_workspace_path(THREAD, "")
    assert root.name == "workspace"


@pytest.mark.asyncio
async def test_list_root_returns_entries(client):
    r = await client.get("/api/files/list", params={"thread_id": THREAD, "path": ""})
    assert r.status_code == 200, r.text
    body = r.json()
    names = {e["name"] for e in body["entries"]}
    assert {"README.md", "src"} <= names
    assert body["parent"] is None


@pytest.mark.asyncio
async def test_read_text_returns_content(client):
    r = await client.get("/api/files/read", params={"thread_id": THREAD, "path": "README.md"})
    assert r.status_code == 200
    assert r.json()["content"] == "# hello"


@pytest.mark.asyncio
async def test_write_then_read_roundtrip(client):
    r = await client.post(
        "/api/files/write",
        json={"thread_id": THREAD, "path": "notes.txt", "content": "abc"},
    )
    assert r.status_code == 200, r.text
    r2 = await client.get("/api/files/read", params={"thread_id": THREAD, "path": "notes.txt"})
    assert r2.json()["content"] == "abc"


@pytest.mark.asyncio
async def test_write_rejects_binary_ext(client):
    r = await client.post(
        "/api/files/write",
        json={"thread_id": THREAD, "path": "evil.exe", "content": "x"},
    )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "not_text_file"


@pytest.mark.asyncio
async def test_write_rejects_parent_missing(client):
    r = await client.post(
        "/api/files/write",
        json={"thread_id": THREAD, "path": "missing/sub/x.txt", "content": "x"},
    )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "parent_not_found"


@pytest.mark.asyncio
async def test_mkdir_and_delete(client):
    r = await client.post(
        "/api/files/mkdir",
        json={"thread_id": THREAD, "path": "newdir/sub"},
    )
    assert r.status_code == 200, r.text
    r = await client.request(
        "DELETE",
        "/api/files/delete",
        json={"thread_id": THREAD, "path": "newdir/sub"},
    )
    assert r.status_code == 200
