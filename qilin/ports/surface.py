"""Surface port: opens file/folder/url surfaces into attached UIs.

The DSH-parity contract lives in qilin.ports.protocol.surface; this module
is the runtime side: a per-session registry that routes open requests to
whatever UI adapter is currently attached to the calling session.

Delivery semantics (mirroring DSH sidebar_open):

- An attached session (a live WS subscriber) receives surface.open events
  immediately; the tool result reports delivered=True.
- A detached session QUEUES opens (bounded; oldest dropped) and they are
  delivered on the next attach; the result reports delivered=False.

Ownership matches the terminal port: the session id is the scope, resolved
server-side by the caller (gateway resolves it from the path, tools from
the runtime context) and never trusted from client payloads.
"""

import asyncio
from collections import deque
from pathlib import Path
from urllib.parse import urlparse

from qilin.ports.errors import PortError
from qilin.ports.protocol.events import SurfaceOpenEvent
from qilin.ports.protocol.surface import (
    SurfaceKind,
    SurfaceOpenResult,
    classify_target_kind,
)

#: Upper bound of queued opens for a detached session (oldest dropped).
SURFACE_QUEUE_LIMIT = 8


class _SurfaceSession:
    """Per-session delivery state."""

    def __init__(self) -> None:
        self.attached = False
        self.subscribers: set[asyncio.Queue] = set()
        self.pending: deque[SurfaceOpenEvent] = deque()


class SurfaceRegistry:
    """Routes surface-open requests to attached UI adapters."""

    def __init__(self, queue_limit: int = SURFACE_QUEUE_LIMIT) -> None:
        self._queue_limit = queue_limit
        self._sessions: dict[str, _SurfaceSession] = {}

    def _session(self, session_id: str) -> _SurfaceSession:
        session = self._sessions.get(session_id)
        if session is None:
            session = _SurfaceSession()
            self._sessions[session_id] = session
        return session

    async def open(
        self,
        session_id: str,
        surface: SurfaceKind,
        target: str,
        title: str,
        read_path: str | None = None,
    ) -> SurfaceOpenResult:
        """Open a surface for one session; returns the wire result.

        delivered=True when a live adapter received the event right away;
        delivered=False when it was queued for the next attach.
        ``read_path`` is the QiLin event extension (workspace-relative
        path for filesystem targets); it rides the event only and never
        changes the DSH-parity tool result.
        """
        session = self._session(session_id)
        event = SurfaceOpenEvent(
            session_id=session_id,
            surface=surface,
            target=target,
            title=title,
            read_path=read_path,
        )
        if session.attached and session.subscribers:
            for queue in tuple(session.subscribers):
                try:
                    queue.put_nowait(("surface", event))
                except asyncio.QueueFull:
                    pass  # slow adapter; the queue path still holds the open
            delivered = True
        else:
            session.pending.append(event)
            while len(session.pending) > self._queue_limit:
                session.pending.popleft()
            delivered = False
        return SurfaceOpenResult(
            kind=surface, target=target, title=title, delivered=delivered
        )

    def subscribe(self, session_id: str) -> asyncio.Queue:
        """Attach one adapter socket; drains queued opens into its queue."""
        session = self._session(session_id)
        queue: asyncio.Queue = asyncio.Queue(maxsize=64)
        session.subscribers.add(queue)
        session.attached = True
        while session.pending:
            event = session.pending.popleft()
            try:
                queue.put_nowait(("surface", event))
            except asyncio.QueueFull:  # pragma: no cover - tiny queue bound
                break
        return queue

    def unsubscribe(self, session_id: str, queue: asyncio.Queue) -> None:
        session = self._sessions.get(session_id)
        if session is not None:
            session.subscribers.discard(queue)
            if not session.subscribers:
                session.attached = False

    def pending_count(self, session_id: str) -> int:
        session = self._sessions.get(session_id)
        return len(session.pending) if session is not None else 0


# ---------------------------------------------------------------------------
# Shared resolution policy (LangChain tool + gateway REST route)
# ---------------------------------------------------------------------------


def _workspace_dir(thread_id: str) -> Path | None:
    """Thread workspace root, when the config layer can provide one."""
    try:
        from qilin.config.paths import get_paths

        return get_paths().user_workspace_dir(thread_id)
    except Exception:
        return None


def default_surface_title(kind: str, target: str) -> str:
    """DSH parity: basename for filesystem targets, hostname for URLs."""
    if kind == "url":
        return urlparse(target).hostname or target
    return Path(target).name or target


async def open_surface(
    thread_id: str,
    target: str,
    title: str = "",
    *,
    registry: SurfaceRegistry | None = None,
) -> SurfaceOpenResult:
    """Resolve a sidebar_open-style target and publish it to the session.

    Shared resolution policy: URLs classify without touching the disk;
    filesystem targets resolve relative to the thread workspace first,
    then the process cwd, and must exist. When the resolved target lives
    inside the thread workspace the event additionally carries readPath
    (workspace-relative) for adapter content fetches.

    Raises PortError("bad-request") for nonexistent filesystem targets.
    """
    reg = registry if registry is not None else get_default_surface_registry()
    kind = classify_target_kind(target)
    resolved = target
    read_path: str | None = None
    if kind is None:
        candidates = [Path(target)]
        if not Path(target).is_absolute():
            ws = _workspace_dir(thread_id)
            if ws is not None:
                candidates.insert(0, ws / target)
        existing = next((c for c in candidates if c.exists()), None)
        if existing is None:
            raise PortError("bad-request", f"target does not exist: {target}")
        resolved = str(existing.resolve())
        kind = "folder" if existing.is_dir() else "file"
        ws = _workspace_dir(thread_id)
        if ws is not None:
            try:
                read_path = existing.resolve().relative_to(ws.resolve()).as_posix()
            except ValueError:
                read_path = None
    final_title = title.strip() if title else default_surface_title(kind, resolved)
    return await reg.open(thread_id, kind, resolved, final_title, read_path=read_path)


# ---------------------------------------------------------------------------
# Process-wide singleton (gateway + LangChain tools share one instance)
# ---------------------------------------------------------------------------

_default_registry: SurfaceRegistry | None = None


def get_default_surface_registry() -> SurfaceRegistry:
    global _default_registry
    if _default_registry is None:
        _default_registry = SurfaceRegistry()
    return _default_registry


def set_default_surface_registry(registry: SurfaceRegistry | None) -> None:
    global _default_registry
    _default_registry = registry


__all__ = [
    "SURFACE_QUEUE_LIMIT",
    "SurfaceRegistry",
    "default_surface_title",
    "get_default_surface_registry",
    "open_surface",
    "set_default_surface_registry",
]
