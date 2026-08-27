"""Workspace registry REST API behavior (DSH alignment P1d).

Runs the real router against a minimal FastAPI app with dependency
overrides for the user/store getters and an auth-stamping middleware that
mirrors what gateway auth middleware provides to require_permission.
Everything shares one asyncio loop: the repository engines and httpx's
ASGI transport alike.
"""

from __future__ import annotations

from types import SimpleNamespace

import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import qilin.persistence.models  # noqa: F401
import app.gateway.routers.workspaces as ws_router_module
from app.gateway.authz import AuthContext
from qilin.persistence.base import Base
from qilin.persistence.thread_meta.sql import ThreadMetaRepository
from qilin.persistence.workspace.sql import WorkspaceRepository

OWNER = "user-A"


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
    workspaces = WorkspaceRepository(sf)
    threads = ThreadMetaRepository(sf)

    from qilin.runtime.user_context import reset_current_user, set_current_user

    token = set_current_user(SimpleNamespace(id=OWNER))

    app = FastAPI()
    app.include_router(ws_router_module.router)

    async def _stamp_auth(request, call_next):
        request.state.auth = AuthContext(
            user=SimpleNamespace(id=OWNER),
            permissions=[
                "threads:read", "threads:write", "threads:delete",
                "runs:create", "runs:read", "runs:cancel",
            ],
        )
        return await call_next(request)

    app.middleware("http")(_stamp_auth)

    # The router calls these helpers directly (not via FastAPI Depends), so
    # tests patch the module globals instead of dependency_overrides.
    async def _fake_current_user(request):
        return OWNER

    originals = (
        ws_router_module.get_current_user,
        ws_router_module.get_workspace_store,
    )
    ws_router_module.get_current_user = _fake_current_user
    ws_router_module.get_workspace_store = lambda request: workspaces

    # workspace_tree resolves the live thread store via app.state singletons
    # (production installs it alongside workspace_store).
    app.state.thread_store = threads
    app.state.workspace_store = workspaces

    transport = httpx.ASGITransport(app=app)
    try:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            yield c, workspaces, threads, tmp_path
    finally:
        ws_router_module.get_current_user, ws_router_module.get_workspace_store = originals
        reset_current_user(token)
        await engine.dispose()


pytestmark = pytest.mark.asyncio


async def _register(client, path) -> dict:
    resp = await client.post("/api/workspaces", json={"path": str(path)})
    assert resp.status_code == 201, resp.text
    return resp.json()


class TestRegistrationApi:
    async def test_create_list_rename_reorder(self, client):
        c, _, _, base = client
        (base / "alpha").mkdir()
        (base / "beta").mkdir()
        w1 = await _register(c, base / "alpha")
        w2 = await _register(c, base / "beta")
        listed = (await c.get("/api/workspaces")).json()
        assert [w["id"] for w in listed] == [w2["id"], w1["id"]]

        got = (
            await c.patch(f"/api/workspaces/{w1['id']}", json={"title": "Alpha"})
        ).json()
        assert got["title"] == "Alpha"

        assert (
            await c.post(f"/api/workspaces/{w1['id']}/reorder", json={})
        ).status_code == 200  # move-to-end no-op: w1 already last
        listed = (await c.get("/api/workspaces")).json()
        assert [w["title"] for w in listed] == ["beta", "Alpha"]

        # a real move: land Alpha directly before beta → top
        await c.post(
            f"/api/workspaces/{w1['id']}/reorder", json={"before_id": w2["id"]}
        )
        listed = (await c.get("/api/workspaces")).json()
        assert [w["title"] for w in listed] == ["Alpha", "beta"]

    async def test_create_requires_existing_directory(self, client):
        c, _, _, base = client
        resp = await c.post("/api/workspaces", json={"path": str(base / "nope")})
        assert resp.status_code == 400

    async def test_unknown_anchor_maps_to_404(self, client):
        c, _, _, base = client
        (base / "alpha").mkdir()
        w1 = await _register(c, base / "alpha")
        resp = await c.post(
            f"/api/workspaces/{w1['id']}/reorder", json={"before_id": "ghost"}
        )
        assert resp.status_code == 404
        assert resp.json()["detail"]["code"] == "WORKSPACE_NOT_FOUND"

    async def test_registration_scoped_per_caller(self, client):
        """The current-user override is what auth middleware would produce;
        scoping correctness lives at repository level (user isolation tests).
        Here we lock that list endpoints always resolve the caller."""
        c, _, _, base = client
        (base / "solo").mkdir()
        await _register(c, base / "solo")
        assert len((await c.get("/api/workspaces")).json()) == 1


class TestGroupingApi:
    async def test_explicit_attach_detach_and_tree(self, client):
        """Legacy NULL-cwd threads join via explicit attach; tree derives
        from the registry; Ungrouped holds the rest."""
        c, ws_repo, thread_repo, base = client
        (base / "proj").mkdir()
        w1 = await _register(c, base / "proj")

        await thread_repo.create("t-a", user_id=OWNER)
        await thread_repo.create("t-b", user_id=OWNER)

        # attach both explicitly (registry authoritative over stored cwd)
        assert (
            await c.post(
                f"/api/workspaces/{w1['id']}/threads", json={"thread_id": "t-a"}
            )
        ).status_code == 201
        assert (
            await c.post(
                f"/api/workspaces/{w1['id']}/threads", json={"thread_id": "t-b"}
            )
        ).status_code == 201

        tree = (await c.get("/api/workspaces/tree")).json()
        (group,) = tree["workspaces"]
        assert group["thread_ids"] == ["t-b", "t-a"]  # prepend order
        assert tree["ungrouped_thread_ids"] == []

        # detach → falls back to Ungrouped, stored cwd untouched
        assert (
            await c.delete(f"/api/workspaces/{w1['id']}/threads/t-b")
        ).status_code == 200
        tree = (await c.get("/api/workspaces/tree")).json()
        (group,) = tree["workspaces"]
        assert group["thread_ids"] == ["t-a"]
        assert tree["ungrouped_thread_ids"] == ["t-b"]

        # detach is idempotent
        assert (
            await c.delete(f"/api/workspaces/{w1['id']}/threads/t-b")
        ).status_code == 200

    async def test_missing_header_pruned_but_path_never_checked(self, client):
        """Only missing thread rows prune group members; a registered member
        whose stored cwd drifted (moved directory) stays put — registry is
        authoritative, matching DSH tree derivation."""
        c, ws_repo, _, base = client
        (base / "p").mkdir()
        w1 = await _register(c, base / "p")
        await ws_repo.attach_thread(
            w1["id"], "t-gone", user_id=OWNER   # header never created
        )

        tree = (await c.get("/api/workspaces/tree")).json()
        (group,) = tree["workspaces"]
        assert group["thread_ids"] == []


class TestArchiveApi:
    async def test_archive_unarchive_restore(self, client):
        c, ws_repo, thread_repo, base = client
        (base / "p").mkdir()
        w1 = await _register(c, base / "p")
        await thread_repo.create("t-x", user_id=OWNER)
        await ws_repo.attach_thread(w1["id"], "t-x", user_id=OWNER)

        resp = await c.put("/api/workspaces/archive", json={"thread_ids": ["t-x"]})
        assert resp.json() == {"archived": 1}
        tree = (await c.get("/api/workspaces/tree")).json()
        assert tree["archived_thread_ids"] == ["t-x"]
        (group,) = tree["workspaces"]
        assert group["thread_ids"] == []  # archived hides within groups too
        assert tree["ungrouped_thread_ids"] == []

        # unarchive restores the retained slot position
        resp = await c.request(
            "DELETE", "/api/workspaces/archive", json={"thread_ids": ["t-x"]}
        )
        assert resp.json() == {"unarchived": 1}
        tree = (await c.get("/api/workspaces/tree")).json()
        (group,) = tree["workspaces"]
        assert group["thread_ids"] == ["t-x"]
