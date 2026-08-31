"""Gateway terminal router tests: REST verbs over a fake-backend registry.

The app under test is a minimal FastAPI app carrying just the terminal
router, an auth-stamping middleware (the authz decorator reads
request.state.auth), and app.state.terminal_registry pointed at a
TerminalRegistry with the scripted FakeBackend - no real processes, no
database. Wire shapes (camelCase aliases, status mapping) are asserted on
the HTTP boundary. WS data-plane coverage is deferred to the web-demo E2E
pass: driving registry queues from the TestClient's app thread is
thread-unsafe (asyncio.Queue is loop-bound) and would make the test flaky.
"""

from types import SimpleNamespace

import httpx
import pytest_asyncio
from fastapi import FastAPI

import app.gateway.routers.ports_terminal as ports_terminal_module
from app.gateway.authz import AuthContext
from qilin.ports.terminal import TerminalPort, TerminalRegistry

OWNER = "user-A"
THREAD = "thr-001"


class FakeBackend(TerminalPort):
    def __init__(self) -> None:
        self.on_output = None
        self.on_exit = None
        self.written: list[bytes] = []
        self.resized: list[tuple[int, int]] = []
        self.signaled: list[str] = []
        self.closed = False
        self._exited = False
        self._exit_code: int | None = None
        self._exit_signal: str | None = None

    async def start(self) -> None:
        pass

    def write(self, data: bytes) -> int:
        self.written.append(bytes(data))
        return len(data)

    def resize(self, cols: int, rows: int) -> None:
        self.resized.append((cols, rows))

    def signal(self, sig: str) -> None:
        self.signaled.append(sig)

    async def close(self) -> None:
        self.closed = True

    def exited(self) -> bool:
        return self._exited

    @property
    def exit_code(self) -> int | None:
        return self._exit_code

    @property
    def exit_signal(self) -> str | None:
        return self._exit_signal

    # test helpers
    def emit(self, data: bytes) -> None:
        if self.on_output is not None:
            self.on_output(data)

    def finish(self, code: int | None = 0, sig: str | None = None) -> None:
        self._exited = True
        self._exit_code = None if sig else code
        self._exit_signal = sig
        if self.on_exit is not None:
            self.on_exit(self._exit_code, self._exit_signal)


def make_app() -> tuple[FastAPI, list[FakeBackend]]:
    backends: list[FakeBackend] = []

    def factory(argv, cwd, cols, rows) -> FakeBackend:
        backend = FakeBackend()
        backends.append(backend)
        return backend

    app = FastAPI()
    app.include_router(ports_terminal_module.router)
    app.state.terminal_registry = TerminalRegistry(backend_factory=factory)

    async def _stamp_auth(request, call_next):
        request.state.auth = AuthContext(
            user=SimpleNamespace(id=OWNER),
            permissions=["threads:read", "threads:write", "threads:delete"],
        )
        return await call_next(request)

    app.middleware("http")(_stamp_auth)
    return app, backends


@pytest_asyncio.fixture
async def client():
    app, backends = make_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac, app, backends


BASE = f"/api/threads/{THREAD}/terminals"


class TestTerminalRoutes:
    async def test_create_send_read_wait_round_trip(self, client) -> None:
        ac, _app, backends = client

        created = await ac.post(BASE, json={"title": "dev", "command": ""})
        assert created.status_code == 200
        assert set(created.json()) == {"uuid", "title"}
        terminal_uuid = created.json()["uuid"]

        sent = await ac.post(
            f"{BASE}/{terminal_uuid}/send", json={"text": "echo hi", "submit": True}
        )
        assert sent.status_code == 200
        assert sent.json() == {"uuid": terminal_uuid, "bytes": 8}
        assert backends[0].written[-1] == b"echo hi\r"

        backends[0].emit(b"build done\n")
        waited = await ac.post(
            f"{BASE}/{terminal_uuid}/wait-for",
            json={"needle": "done", "timeout_ms": 1000},
        )
        assert waited.status_code == 200
        body = waited.json()
        assert body["kind"] == "found" and body["needle"] == "done"

        read = await ac.get(f"{BASE}/{terminal_uuid}/read?offset=0&count=10")
        assert read.status_code == 200
        read_body = read.json()
        # The fake backend does not echo stdin (a real pty's ECHO does that
        # server-side); the transcript only carries emitted output.
        assert read_body["text"] == "build done"
        assert read_body["totalLines"] == 1
        assert "lineBegin" in read_body and "truncated" in read_body

    async def test_list_scopes_to_thread(self, client) -> None:
        ac, _app, _backends = client
        await ac.post(BASE, json={"title": "a"})
        await ac.post(BASE, json={"title": "b"})

        listed = await ac.get(f"{BASE}")
        assert [tab["title"] for tab in listed.json()] == ["a", "b"]

    async def test_resize_and_signal(self, client) -> None:
        ac, _app, _backends = client
        terminal_uuid = (await ac.post(BASE, json={"title": "t"})).json()["uuid"]

        resized = await ac.post(
            f"{BASE}/{terminal_uuid}/resize", json={"cols": 40, "rows": 10}
        )
        assert resized.status_code == 200
        assert resized.json() == {"uuid": terminal_uuid, "cols": 40, "rows": 10}

        signaled = await ac.post(
            f"{BASE}/{terminal_uuid}/signal", json={"signal": "SIGINT"}
        )
        assert signaled.status_code == 200
        assert signaled.json() == {"uuid": terminal_uuid, "signal": "SIGINT"}

        invalid = await ac.post(
            f"{BASE}/{terminal_uuid}/signal", json={"signal": "SIGUSR1"}
        )
        assert invalid.status_code == 422

        clamp_reject = await ac.post(
            f"{BASE}/{terminal_uuid}/resize", json={"cols": 0, "rows": 10}
        )
        assert clamp_reject.status_code == 422

    async def test_close_idempotent_over_http(self, client) -> None:
        ac, _app, backends = client
        terminal_uuid = (await ac.post(BASE, json={"title": "t"})).json()["uuid"]

        first = await ac.delete(f"{BASE}/{terminal_uuid}")
        assert first.json() == {"uuid": terminal_uuid, "closed": True}
        assert backends[0].closed is True

        second = await ac.delete(f"{BASE}/{terminal_uuid}")
        assert second.status_code == 200
        assert second.json() == {"uuid": terminal_uuid, "closed": False}

    async def test_unknown_terminal_maps_to_404(self, client) -> None:
        ac, _app, _backends = client
        missing = await ac.get(f"{BASE}/no-such-uuid/read")
        assert missing.status_code == 404

    async def test_body_validation_rejects_empty_needle(self, client) -> None:
        ac, _app, _backends = client
        terminal_uuid = (await ac.post(BASE, json={"title": "t"})).json()["uuid"]
        bad = await ac.post(
            f"{BASE}/{terminal_uuid}/wait-for", json={"needle": "", "timeout_ms": 500}
        )
        assert bad.status_code == 422
