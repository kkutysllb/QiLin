"""Tool post-execute event port (H5-b).

File-mutating tool calls are published here after execution; external
plugin hosts (the web-demo plugin server halves) poll the gateway port
and fan events out to subscribed plugins — the QiLin analogue of DSH's
in-process "tools/post-execute" emitter. Observability only: execution
has already happened when an event is published (no veto across processes).
"""
from __future__ import annotations

import threading
import time
from collections import deque
from dataclasses import dataclass

_RING_MAX = 512

_lock = threading.Lock()
_events: deque[dict] = deque(maxlen=_RING_MAX)
_seq = 0


@dataclass(frozen=True)
class ToolExecEvent:
    name: str
    call_id: str
    thread_id: str
    path: str | None = None
    ts: float = 0.0

    def to_dict(self) -> dict:
        return {
            "seq": self.__dict__.get("seq"),
            "name": self.name,
            "callId": self.call_id,
            "threadId": self.thread_id,
            "path": self.path,
            "ts": self.ts,
        }


def publish_tool_event(
    *,
    name: str,
    call_id: str,
    thread_id: str,
    path: str | None = None,
) -> dict:
    """Append one event; returns the stored dict (with its seq)."""
    global _seq
    with _lock:
        _seq += 1
        event = {
            "seq": _seq,
            "name": name,
            "callId": call_id,
            "threadId": thread_id,
            "path": path,
            "ts": time.time(),
        }
        _events.append(event)
        return event


def snapshot_after(cursor: int) -> tuple[list[dict], int]:
    """Events with seq > cursor, plus the current cursor head."""
    with _lock:
        events = [e for e in _events if e["seq"] > cursor]
        return events, _seq


def thread_id_from_path(path: str | None) -> str:
    """Extract the thread id from a resolved thread-workspace path.

    Handles both layouts: ``.qilin/threads/<tid>/…`` and the users-scoped
    ``.qilin/users/<user>/threads/<tid>/…``.
    """
    if not path:
        return "unknown"
    marker = "/threads/"
    i = path.rfind(marker)
    if i == -1:
        return "unknown"
    rest = path[i + len(marker) :]
    return rest.split("/", 1)[0] or "unknown"


def publish_file_mutation(name: str, path: str | None) -> None:
    """Best-effort publication for sandbox file-mutating tools (H5-b).

    Never raises: the event face must not affect tool execution. Tool
    bodies don't receive the langgraph call id, so callId is empty.
    """
    try:
        publish_tool_event(
            name=name,
            call_id="",
            thread_id=thread_id_from_path(path),
            path=path,
        )
    except Exception:
        pass
