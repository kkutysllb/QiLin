"""Gateway surface router tests: programmatic sidebar_open over REST.

Same minimal-app pattern as the terminal router tests: a FastAPI app
carrying just the surface router, an auth-stamping middleware, and
app.state.surface_registry pointed at a real (backend-free)
SurfaceRegistry. Resolution hits a temp workspace via the
_workspace_dir seam - no config-layer or process-cwd dependence.
"""

from types import SimpleNamespace

import httpx
import pytest_asyncio
from fastapi import FastAPI

import app.gateway.routers.ports_surface as ports_surface_module
import qilin.ports.surface as surface_module
from app.gateway.authz import AuthContext
from qilin.ports.surface import SurfaceRegistry

OWNER = "user-A"
THREAD = "thr-surf"
BASE = f"/api/threads/{THREAD}/surfaces"


def make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(ports_surface_module.router)
    app.state.surface_registry = SurfaceRegistry()

    async def _stamp_auth(request, call_next):
        request.state.auth = AuthContext(
            user=SimpleNamespace(id=OWNER),
            permissions=["threads:read", "threads:write", "threads:delete"],
        )
        return await call_next(request)

    app.middleware("http")(_stamp_auth)
    return app


@pytest_asyncio.fixture
async def client():
    app = make_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac, app


class TestSurfaceRoutes:
    async def test_open_workspace_file_returns_result_and_queues_event(
        self, client, tmp_path, monkeypatch
    ) -> None:
        ac, app = client
        monkeypatch.setattr(surface_module, "_workspace_dir", lambda _tid: tmp_path)
        plan = tmp_path / "plan.md"
        plan.write_text("# plan", encoding="utf-8")

        res = await ac.post(BASE, json={"target": "plan.md"})
        assert res.status_code == 200
        assert res.json() == {
            "kind": "file",
            "target": str(plan.resolve()),
            "title": "plan.md",
            "delivered": False,
        }
        registry: SurfaceRegistry = app.state.surface_registry
        assert registry.pending_count(THREAD) == 1

    async def test_open_missing_target_maps_to_400(self, client, monkeypatch) -> None:
        ac, _app = client
        monkeypatch.setattr(surface_module, "_workspace_dir", lambda _tid: None)
        res = await ac.post(BASE, json={"target": "/nope/missing.md"})
        assert res.status_code == 400
        assert "missing.md" in res.json()["detail"]

    async def test_open_url_does_not_touch_fs(self, client) -> None:
        ac, app = client
        res = await ac.post(BASE, json={"target": "https://example.com/docs"})
        assert res.status_code == 200
        body = res.json()
        assert body["kind"] == "url"
        assert body["title"] == "example.com"
        # The open was queued (no attached adapter); attaching drains it.
        registry: SurfaceRegistry = app.state.surface_registry
        queue = registry.subscribe(THREAD)
        kind, event = queue.get_nowait()
        assert kind == "surface"
        assert event.surface == "url"
        assert event.read_path is None
