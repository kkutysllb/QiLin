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
BLOCK_STREAK_ENV = "GOAL_BLOCK_AFTER_ROUNDS"

#: Run outcomes that may hand control to the driver. ``interrupted`` (and
#: user cancels) must never re-arm a run the human walked away from —
#: the armed goal is parked to paused instead. ``error``/``timeout`` drop
#: too, so a failing loop cannot spin rounds; the goal stays armed and
#: waits for a later successful completion edge.
_DRIVEABLE_STATUSES = {"success"}
_PARK_ON_STATUS = {"interrupted"}

RunCompletedHook = Callable[[RunRecord], Awaitable[None]]
ObserverFactory = Callable[[Any], RunCompletedHook]


def driver_flag_enabled(app: Any) -> bool:
    return str(os.environ.get(FLAG_ENV, "")).strip().lower() in {"1", "true", "yes", "on"}


def blocked_streak_limit() -> int:
    """Safety valve: consecutive same-reason blocks tolerated.

    Configured via ``GOAL_BLOCK_AFTER_ROUNDS``; defaults to 3 per the
    plan, values < 1 disable the valve entirely.
    """
    try:
        value = int(str(os.environ.get(BLOCK_STREAK_ENV, "3")).strip())
    except ValueError:
        return 3
    return max(0, value)


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

    status = str(getattr(getattr(record, "status", None), "value", getattr(record, "status", None)))
    projection = await store.projection(thread_id)
    broker = getattr(app.state, "goal_broker", None)

    if status in _PARK_ON_STATUS:
        goal = (projection or {}).get("goal")
        if goal is not None and goal.get("phase") == "active":
            # Cancel/interrupt with an armed goal: park it so it cannot
            # auto-resurrect on some later idle edge without its human.
            try:
                await store.pause(thread_id, ref=projection["last_ref"], user_id=user_id or None)
                if broker is not None:
                    broker.publish(user_id, thread_id, {
                        "operation": "pause",
                        "ref": projection.get("last_ref"),
                        "goal": projection.get("goal"),
                    })
            except Exception:
                logger.exception(
                    "goal-round-driver: parking armed goal after %s failed for %s",
                    status,
                    thread_id,
                )
        return
    if status not in _DRIVEABLE_STATUSES:
        return

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

    history = await store.history(thread_id, limit=50)
    outcome: DriveOutcome = await drive(
        store,
        thread_id,
        projection,
        activation,
        inject=inject,
        history=history,
        blocked_streak_limit=blocked_streak_limit(),
    )
    if broker is None:
        return
    if outcome.status == "injected":
        broker.publish(user_id, thread_id, {
            "operation": "round",
            "ref": outcome.ref,
            "round": outcome.round,
        })
    elif outcome.status == "blocked-limit":
        # The auto-block bypassed the REST layer, so it must broadcast here
        # or UIs would keep showing an active goal that can no longer run.
        after = await store.projection(thread_id)
        broker.publish(user_id, thread_id, {
            "operation": "block",
            "ref": outcome.ref,
            "goal": (after or {}).get("goal"),
        })
