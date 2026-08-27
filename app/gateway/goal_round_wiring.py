"""Gateway wiring for the goal round driver (P6b).

Idle-edge anchor: the run worker already invokes ``ctx.on_run_completed``
after every terminal transition, so the driver rides that existing hook
instead of adding a second completion surface. The single hook slot is
composed: the scheduled-task observer keeps its behaviour, then the goal
driver observer gets one pass — mirroring DSH where a quiescent agent
status edge triggers ``drive`` and everything else ignores it.

Injection channel: ``launch_scheduled_thread_run`` (the internal-caller
run path) delivers the verbatim `<goal_round>` prompt with attribution
metadata under ``metadata["goal_round"]``, so audit trails can tell
driver turns from human ones. Round counting stays durable in
``goal_changes`` via ``GoalRepository.admit_round``.

The whole feature is flag-gated by ``QILIN_GOAL_ROUND_DRIVER=1`` and off
by default until P7 flips the docs; with the flag unset this module is an
observational no-op.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Awaitable, Callable
from typing import Any

from app.gateway import goal_activation
from app.gateway.goal_round_driver import DriveOutcome, drive
from qilin.runtime.runs.manager import RunRecord

logger = logging.getLogger(__name__)

FLAG_ENV = "QILIN_GOAL_ROUND_DRIVER"

RunCompletedHook = Callable[[RunRecord], Awaitable[None]]
ObserverFactory = Callable[[Any], RunCompletedHook]


def driver_flag_enabled(app: Any) -> bool:
    return str(os.environ.get(FLAG_ENV, "")).strip().lower() in {"1", "true", "yes", "on"}


def compose_run_completed(
    base: RunCompletedHook | None,
    extra: RunCompletedHook | None,
) -> RunCompletedHook | None:
    """Chain the single worker completion slot without losing either party.

    Each leg is isolated: one hook failing cannot starve the other.
    """
    if base is None:
        return extra
    if extra is None:
        return base

    async def chained(record: RunRecord) -> None:
        for hook in (base, extra):
            try:
                await hook(record)
            except Exception:
                logger.exception("goal-round-driver: completion-hook leg failed for %s", record.run_id)

    return chained


def make_goal_driver_observer(app: Any) -> RunCompletedHook:
    """Build the completion-hook observer that drives armed goals.

    Failure containment: every branch catches its own errors so a driver
    hiccup can never fail the underlying run's completion path.
    """

    async def observer(record: RunRecord) -> None:
        try:
            await _observe(app, record)
        except Exception:
            logger.exception("goal-round-driver: observer failed for %s", record.run_id)

    return observer


async def _observe(app: Any, record: RunRecord) -> None:
    from app.gateway.services import launch_scheduled_thread_run  # late import: cycle

    if not driver_flag_enabled(app):
        return
    thread_id = record.thread_id
    user_id = getattr(record, "user_id", None) or ""
    store = getattr(app.state, "goal_store", None)
    if store is None:
        return
    projection = await store.projection(thread_id)
    activation = goal_activation.get(user_id, thread_id)
    assistant_id = getattr(record, "assistant_id", None)

    async def inject(prompt_text: str, round_number: int) -> None:
        await launch_scheduled_thread_run(
            app=app,
            thread_id=thread_id,
            assistant_id=assistant_id,
            prompt=prompt_text,
            owner_user_id=user_id or None,
            metadata={
                "goal_round": {
                    "kind": "goal",
                    "round": round_number,
                    **(projection.get("last_ref") or {}),
                }
            },
        )

    outcome: DriveOutcome = await drive(store, thread_id, projection, activation, inject=inject)
    broker = getattr(app.state, "goal_broker", None)
    if broker is not None and outcome.status == "injected":
        broker.publish(user_id, thread_id, {
            "operation": "round",
            "ref": outcome.ref,
            "round": outcome.round,
        })
