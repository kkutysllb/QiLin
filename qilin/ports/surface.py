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

from qilin.ports.protocol.events import SurfaceOpenEvent
from qilin.ports.protocol.surface import SurfaceKind, SurfaceOpenResult

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
    ) -> SurfaceOpenResult:
        """Open a surface for one session; returns the wire result.

        delivered=True when a live adapter received the event right away;
        delivered=False when it was queued for the next attach.
        """
        session = self._session(session_id)
        event = SurfaceOpenEvent(
            session_id=session_id, surface=surface, target=target, title=title
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
    "get_default_surface_registry",
    "set_default_surface_registry",
]
