"""H5 language port — registry + gateway route tests."""
import importlib

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.gateway.internal_auth import create_internal_auth_headers
from qilin.ports import system_prompt as sp


def _client() -> TestClient:
    import app.gateway.routers.ports as ports

    app = FastAPI()
    app.include_router(ports.router)
    return TestClient(app)


def setup_function(_) -> None:
    importlib.reload(sp)


def test_registry_upsert_order_and_render() -> None:
    sp.register_section("b", 900, "B text")
    sp.register_section("a", 10, "A text")
    sp.register_section("b", 950, "B2 text")  # upsert by name
    assert [s.name for s in sp.list_sections()] == ["a", "b"]
    assert sp.render_sections() == "A text\n\nB2 text"
    assert sp.unregister_section("b") is True
    assert sp.unregister_section("b") is False


def test_router_requires_internal_token() -> None:
    client = _client()
    resp = client.post(
        "/api/ports/system-prompt/sections",
        json={"name": "x", "order": 1, "text": "hi"},
    )
    assert resp.status_code == 403


def test_router_register_list_delete_roundtrip() -> None:
    client = _client()
    headers = create_internal_auth_headers()
    resp = client.post(
        "/api/ports/system-prompt/sections",
        headers=headers,
        json={"name": "kcoder:language", "order": 900, "text": "中文指令"},
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    listed = client.get("/api/ports/system-prompt/sections", headers=headers).json()
    assert listed["sections"][0]["name"] == "kcoder:language"
    assert sp.render_sections().find("中文指令") != -1
    deleted = client.delete(
        "/api/ports/system-prompt/sections/kcoder:language", headers=headers
    )
    assert deleted.json()["removed"] is True
    assert sp.render_sections() == ""
