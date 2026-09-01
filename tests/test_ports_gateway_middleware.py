"""H5 ports x gateway global middleware — plugin-host callers must pass.

Regression for auth-enabled deployments: AuthMiddleware only honored minted
tokens and CSRFMiddleware double-submit blocked every ports POST, so the
plugin host booted with "[skills] materialize failed: 403" and
"[system-prompt] announce failed: 403". The ports face is loopback
infrastructure carrying its own shared-secret credential (X-QiLin-Internal-
Token, constant-time checked in routers/ports.py), so both global middlewares
must let it through while every other path stays gated.
"""

import importlib

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.gateway.auth_middleware import AuthMiddleware
from app.gateway.csrf_middleware import CSRFMiddleware
from app.gateway.internal_auth import (
    _INTERNAL_AUTH_SECRET,
    create_internal_auth_headers,
)
from qilin.ports import system_prompt as sp

RAW_SECRET = _INTERNAL_AUTH_SECRET.decode()


def _client() -> TestClient:
    """Ports router + dummy user routes behind the real middleware pair.

    Middleware order mirrors app.py: AuthMiddleware added first, CSRF last —
    in Starlette the last-added middleware is outermost (checked first).
    """
    import app.gateway.routers.ports as ports

    app = FastAPI()
    app.include_router(ports.router)

    @app.get("/api/echo")
    async def echo_get() -> dict:
        return {"ok": True}

    @app.post("/api/echo")
    async def echo_post() -> dict:
        return {"ok": True}

    app.add_middleware(AuthMiddleware)
    app.add_middleware(CSRFMiddleware)
    return TestClient(app)


def setup_function(_) -> None:
    importlib.reload(sp)


def test_ports_post_with_raw_secret_passes_global_middleware() -> None:
    client = _client()
    resp = client.post(
        "/api/ports/system-prompt/sections",
        headers={"X-QiLin-Internal-Token": RAW_SECRET},
        json={"name": "probe:raw-secret", "order": 1, "text": "hi"},
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


def test_minted_token_still_passes() -> None:
    client = _client()
    resp = client.post(
        "/api/ports/system-prompt/sections",
        headers=create_internal_auth_headers(),
        json={"name": "probe:minted", "order": 1, "text": "hi"},
    )
    assert resp.status_code == 200


def test_ports_post_without_token_still_fail_closed() -> None:
    """No credential: the CSRF exemption must NOT become an auth bypass —
    the global auth middleware rejects before the route (fail-closed 401).
    The route-level 403 stays covered by test_system_prompt_port.py, which
    mounts the router without middlewares (defense in depth)."""
    client = _client()
    resp = client.post(
        "/api/ports/system-prompt/sections",
        json={"name": "x", "order": 1, "text": "hi"},
    )
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "not_authenticated"


def test_non_ports_post_still_requires_csrf() -> None:
    client = _client()
    resp = client.post("/api/echo")
    assert resp.status_code == 403
    assert "CSRF" in resp.json()["detail"]


def test_non_ports_get_still_requires_session() -> None:
    client = _client()
    resp = client.get("/api/echo")
    assert resp.status_code == 401


def test_non_ports_get_with_raw_secret_passes() -> None:
    """Raw secret grants the synthetic internal user on any path — same trust
    class as a minted token (holders of the HMAC key can mint anyway)."""
    client = _client()
    resp = client.get("/api/echo", headers={"X-QiLin-Internal-Token": RAW_SECRET})
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
