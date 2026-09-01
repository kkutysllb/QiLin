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
