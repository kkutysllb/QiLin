"""Gateway router for the terminal port: per-thread REST verbs + live WS.

REST (ownership scope = thread_id; terminal uuids are registry-internal):
- POST   /api/threads/{thread_id}/terminals                        create
- GET    /api/threads/{thread_id}/terminals                        list
- POST   /api/threads/{thread_id}/terminals/{uuid}/send            keystrokes
- GET    /api/threads/{thread_id}/terminals/{uuid}/read            scrollback page
- POST   /api/threads/{thread_id}/terminals/{uuid}/wait-for        completion cue
- POST   /api/threads/{thread_id}/terminals/{uuid}/resize          pty size
- POST   /api/threads/{thread_id}/terminals/{uuid}/signal          POSIX signal
- DELETE /api/threads/{thread_id}/terminals/{uuid}                 close

WS /api/threads/{thread_id}/terminals/stream - the data plane:
- client text frames: JSON control ({"type":"subscribe"|"unsubscribe"|
  "resize"|"signal", "uuid", ...})
- client binary frames: b"<uuid>\n" + raw bytes -> pty stdin
- server binary frames: b"<uuid>\n" + raw pty output for subscribed uuids
- server text frames: JSON events ("terminal.exited", exitCode/exitSignal)

Result shapes are the qilin.ports.protocol models serialized by_alias, so
the browser client sees exactly the DSH wire vocabulary.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from pydantic import BaseModel, Field

from app.gateway.authz import require_permission
from qilin.ports.errors import PortError
from qilin.ports.protocol.terminal import (
    TerminalCloseResult,
    TerminalCreateResult,
    TerminalReadResult,
    TerminalResizeResult,
    TerminalSendResult,
    TerminalSignalResult,
    TerminalSnapshot,
    TerminalWaitResult,
)
from qilin.ports.surface import SurfaceRegistry, get_default_surface_registry
from qilin.ports.terminal import TerminalRegistry, get_default_registry

router = APIRouter(prefix="/api/threads/{thread_id}/terminals", tags=["ports-terminal"])

#: WS data-plane subscriber queue depth (frames; slow sockets drop frames -
#: the scrollback transcript stays authoritative for reads).
_WS_QUEUE_MAXSIZE = 256


class TerminalCreateBody(BaseModel):
    title: str = Field(min_length=1, max_length=256)
    command: str = Field(default="", max_length=8192)


class TerminalSendBody(BaseModel):
    text: str = Field(max_length=65536)
    submit: bool = False


class TerminalWaitForBody(BaseModel):
    needle: str = Field(min_length=1, max_length=1024)
    timeout_ms: int = Field(default=10000, ge=100, le=600_000)


class TerminalResizeBody(BaseModel):
    cols: int = Field(ge=2, le=1024)
    rows: int = Field(ge=2, le=1024)


class TerminalSignalBody(BaseModel):
    signal: str = Field(pattern="^(SIGINT|SIGTERM|SIGKILL|SIGHUP|SIGTSTP)$")


_PORT_ERROR_STATUS: dict[str, int] = {
    "bad-request": 400,
    "not-found": 404,
    "forbidden": 403,
    "pty-error": 500,
    "pty-deps-missing": 503,
}


def _http_status(exc: PortError) -> int:
    return _PORT_ERROR_STATUS.get(exc.code, 400)


# Module-level seam - tests override app.state.terminal_registry; prod
# falls back to the process-wide singleton shared with the LangChain tools.
def get_terminal_registry(request: Request) -> TerminalRegistry:
    registry = getattr(request.app.state, "terminal_registry", None)
    if registry is None:
        return get_default_registry()
    return registry


def _thread_workspace(thread_id: str) -> str | None:
    """Default cwd for spawned shells: the thread workspace when it exists."""
    try:
        from qilin.config.paths import get_paths

        candidate = get_paths().user_workspace_dir(thread_id)
    except Exception:
        return None
    if candidate.is_dir():
        return str(candidate)
    return None


# ---------------------------------------------------------------------------
# REST
# ---------------------------------------------------------------------------


@router.post("", response_model=TerminalCreateResult)
@require_permission("threads", "write")
async def create_terminal(
    thread_id: str,
    body: TerminalCreateBody,
    registry: TerminalRegistry = Depends(get_terminal_registry),
) -> TerminalCreateResult:
    terminal_uuid = await registry.create(
        thread_id,
        body.title,
        command=body.command,
        cwd=_thread_workspace(thread_id),
    )
    return TerminalCreateResult(uuid=terminal_uuid, title=body.title)


@router.get("", response_model=list[TerminalSnapshot])
@require_permission("threads", "read")
async def list_terminals(
    thread_id: str,
    registry: TerminalRegistry = Depends(get_terminal_registry),
) -> list[TerminalSnapshot]:
    return registry.list(thread_id)


@router.post("/{terminal_uuid}/send", response_model=TerminalSendResult)
@require_permission("threads", "write")
async def send_text(
    thread_id: str,
    terminal_uuid: str,
    body: TerminalSendBody,
    registry: TerminalRegistry = Depends(get_terminal_registry),
) -> TerminalSendResult:
    try:
        written = registry.send(terminal_uuid, thread_id, body.text, submit=body.submit)
    except PortError as exc:
        raise HTTPException(_http_status(exc), exc.message) from exc
    return TerminalSendResult(uuid=terminal_uuid, byte_count=written)


@router.get("/{terminal_uuid}/read", response_model=TerminalReadResult)
@require_permission("threads", "read")
async def read_scrollback(
    thread_id: str,
    terminal_uuid: str,
    offset: int = 0,
    count: int = 500,
    registry: TerminalRegistry = Depends(get_terminal_registry),
) -> TerminalReadResult:
    try:
        return registry.read(terminal_uuid, thread_id, offset=offset, count=count)
    except PortError as exc:
        raise HTTPException(_http_status(exc), exc.message) from exc


@router.post("/{terminal_uuid}/wait-for", response_model=TerminalWaitResult)
@require_permission("threads", "write")
async def wait_for_output(
    thread_id: str,
    terminal_uuid: str,
    body: TerminalWaitForBody,
    registry: TerminalRegistry = Depends(get_terminal_registry),
) -> TerminalWaitResult:
    try:
        return await registry.wait_for(
            terminal_uuid, thread_id, body.needle, timeout_ms=body.timeout_ms
        )
    except PortError as exc:
        raise HTTPException(_http_status(exc), exc.message) from exc


@router.post("/{terminal_uuid}/resize", response_model=TerminalResizeResult)
@require_permission("threads", "write")
async def resize_terminal(
    thread_id: str,
    terminal_uuid: str,
    body: TerminalResizeBody,
    registry: TerminalRegistry = Depends(get_terminal_registry),
) -> TerminalResizeResult:
    try:
        cols, rows = registry.resize(terminal_uuid, thread_id, body.cols, body.rows)
    except PortError as exc:
        raise HTTPException(_http_status(exc), exc.message) from exc
    return TerminalResizeResult(uuid=terminal_uuid, cols=cols, rows=rows)


@router.post("/{terminal_uuid}/signal", response_model=TerminalSignalResult)
@require_permission("threads", "write")
async def signal_terminal(
    thread_id: str,
    terminal_uuid: str,
    body: TerminalSignalBody,
    registry: TerminalRegistry = Depends(get_terminal_registry),
) -> TerminalSignalResult:
    try:
        registry.signal(terminal_uuid, thread_id, body.signal)
    except PortError as exc:
        raise HTTPException(_http_status(exc), exc.message) from exc
    return TerminalSignalResult(uuid=terminal_uuid, signal=body.signal)


@router.delete("/{terminal_uuid}", response_model=TerminalCloseResult)
@require_permission("threads", "write")
async def close_terminal(
    thread_id: str,
    terminal_uuid: str,
    registry: TerminalRegistry = Depends(get_terminal_registry),
) -> TerminalCloseResult:
    try:
        closed = await registry.close(terminal_uuid, thread_id)
    except PortError as exc:
        raise HTTPException(_http_status(exc), exc.message) from exc
    return TerminalCloseResult(uuid=terminal_uuid, closed=closed)


# ---------------------------------------------------------------------------
# WS data plane
# ---------------------------------------------------------------------------


def _ws_frame(terminal_uuid: str, data: bytes) -> bytes:
    """One binary frame: first line is the terminal uuid, then raw bytes."""
    return terminal_uuid.encode("utf-8") + b"\n" + data


async def _authenticate_ws(websocket: WebSocket):
    """WS auth - WebSocket upgrades bypass AuthMiddleware, so replicate the
    cookie -> user resolution (shared semantics with the browser stream)."""
    from app.gateway.routers.browser import _authenticate_ws as _browser_auth

    return await _browser_auth(websocket)


def _ws_origin_allowed(websocket: WebSocket) -> bool:
    """WS-CSRF defense (same-origin / configured CORS), browser parity."""
    from app.gateway.routers.browser import _ws_origin_allowed as _browser_origin

    return _browser_origin(websocket)


@router.websocket("/stream")
async def terminals_stream(websocket: WebSocket, thread_id: str) -> None:
    """Bidirectional live terminal stream for one thread.

    Control is JSON text; payload rides binary frames with a uuid first
    line so N terminals multiplex over one socket.
    """
    user = await _authenticate_ws(websocket)
    if user is None:
        await websocket.close(code=4401)
        return
    if not _ws_origin_allowed(websocket):
        await websocket.close(code=4403)
        return

    registry: TerminalRegistry = getattr(
        websocket.app.state, "terminal_registry", None
    ) or get_default_registry()
    surface_registry: SurfaceRegistry = getattr(
        websocket.app.state, "surface_registry", None
    ) or get_default_surface_registry()

    await websocket.accept()

    # Surface port: this socket is the session's UI adapter while alive.
    # Attaching drains any opens queued while the UI was detached.
    surface_queue = surface_registry.subscribe(thread_id)

    async def pump_surface() -> None:
        while True:
            item = await surface_queue.get()
            if item[0] == "surface":
                await send_json(item[1].model_dump(by_alias=True))

    surface_pump = asyncio.create_task(pump_surface())

    subscriptions: dict[str, asyncio.Queue] = {}
    pump_tasks: dict[str, asyncio.Task] = {}
    send_lock = asyncio.Lock()

    async def send_json(payload: dict[str, Any]) -> None:
        async with send_lock:
            await websocket.send_text(json.dumps(payload, ensure_ascii=False))

    async def send_bytes(frame: bytes) -> None:
        async with send_lock:
            await websocket.send_bytes(frame)

    def pump(terminal_uuid: str, queue: asyncio.Queue) -> asyncio.Task:
        async def _pump() -> None:
            while True:
                item = await queue.get()
                if item[0] == "data":
                    await send_bytes(_ws_frame(terminal_uuid, item[1]))
                else:  # ("exit", code, sig)
                    await send_json(
                        {
                            "type": "terminal.exited",
                            "uuid": terminal_uuid,
                            "exitCode": item[1],
                            "exitSignal": item[2],
                        }
                    )
                    return  # terminal finished; subscription ends naturally

        return asyncio.create_task(_pump())

    def teardown() -> None:
        surface_registry.unsubscribe(thread_id, surface_queue)
        surface_pump.cancel()
        for terminal_uuid, queue in subscriptions.items():
            registry.unsubscribe(terminal_uuid, thread_id, queue)
        for task in pump_tasks.values():
            task.cancel()
        subscriptions.clear()
        pump_tasks.clear()

    try:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                return
            if (text := message.get("text")) is not None:
                try:
                    control = json.loads(text)
                    kind = control["type"]
                except (json.JSONDecodeError, KeyError, TypeError):
                    await send_json({"type": "error", "message": "malformed control frame"})
                    continue
                terminal_uuid = control.get("uuid", "")
                if kind == "subscribe":
                    if terminal_uuid in subscriptions:
                        continue
                    try:
                        queue = registry.subscribe(terminal_uuid, thread_id)
                    except PortError as exc:
                        await send_json(
                            {"type": "error", "message": exc.message, "code": exc.code}
                        )
                        continue
                    subscriptions[terminal_uuid] = queue
                    pump_tasks[terminal_uuid] = pump(terminal_uuid, queue)
                elif kind == "unsubscribe":
                    queue = subscriptions.pop(terminal_uuid, None)
                    if queue is not None:
                        registry.unsubscribe(terminal_uuid, thread_id, queue)
                        task = pump_tasks.pop(terminal_uuid, None)
                        if task is not None:
                            task.cancel()
                elif kind == "resize":
                    try:
                        registry.resize(
                            terminal_uuid,
                            thread_id,
                            int(control["cols"]),
                            int(control["rows"]),
                        )
                    except (PortError, KeyError, TypeError, ValueError) as exc:
                        await send_json({"type": "error", "message": str(exc)})
                elif kind == "signal":
                    try:
                        registry.signal(terminal_uuid, thread_id, control["signal"])
                    except (PortError, KeyError) as exc:
                        await send_json({"type": "error", "message": str(exc)})
                else:
                    await send_json({"type": "error", "message": "unknown control type"})
            elif (blob := message.get("bytes")) is not None:
                # Data plane: b"<uuid>\n" + raw keystroke bytes.
                header, sep, payload = bytes(blob).partition(b"\n")
                if not sep or not header:
                    await send_json({"type": "error", "message": "binary frame missing uuid"})
                    continue
                try:
                    registry.write_bytes(header.decode("utf-8"), thread_id, payload)
                except PortError as exc:
                    await send_json(
                        {"type": "error", "message": exc.message, "code": exc.code}
                    )
    except WebSocketDisconnect:
        pass
    finally:
        teardown()
