"""In-process fan-out of goal change events (DSH ``goal/changed`` analog).

Subscribers are per-thread asyncio queues; the writer thread enqueues the
whole-snapshot payload after the durable append commits. SSE consumption
lives in the goals router; the round driver (P6) subscribes through the
same app.state singleton. Payloads mirror DSH ``GoalChanged``:
``{operation, ref, goal?}`` with ``cleared`` replacing ``goal`` on clear.
"""

from __future__ import annotations

import asyncio
from typing import Any


class GoalChangeBroker:
    def __init__(self) -> None:
        self._subs: dict[tuple[str, str], set[asyncio.Queue[Any]]] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, user_id: str, thread_id: str) -> asyncio.Queue[Any]:
        queue: asyncio.Queue[Any] = asyncio.Queue(maxsize=64)
        async with self._lock:
            self._subs.setdefault((user_id, thread_id), set()).add(queue)
        return queue

    async def unsubscribe(self, user_id: str, thread_id: str, queue: asyncio.Queue[Any]) -> None:
        async with self._lock:
            queues = self._subs.get((user_id, thread_id))
            if queues is not None:
                queues.discard(queue)
                if not queues:
                    self._subs.pop((user_id, thread_id), None)

    def publish(self, user_id: str, thread_id: str, payload: dict[str, Any]) -> int:
        """Synchronous post-commit fan-out; returns dropped-subscriber count.
        Overflowing a slow subscriber drops its oldest event (whole-snapshot
        payloads make that safe — the next event re-states all state)."""
        targets = self._subs.get((user_id, thread_id), set())
        dropped = 0
        for queue in targets:
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                try:
                    queue.get_nowait()
                    queue.put_nowait(payload)
                except (asyncio.QueueEmpty, asyncio.QueueFull):
                    dropped += 1
        return dropped
