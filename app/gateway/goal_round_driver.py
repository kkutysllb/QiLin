"""Goal round driver (DSH ``goal-round-driver`` alignment).

Pure decision core for gateway-side automatic continuation:

- The model-visible prompt is rendered **verbatim** from DSH
  ``goal-round-driver/src/prompt.ts`` — the `<goal_round>` wrapper plus its
  fixed instruction paragraph are copied character-for-character so session
  histories stay portable between the two runtimes.
- ``drive`` implements the reference decision at quiescence: only an
  active, armed goal with remaining budget may continue; exhausting the
  budget auto-blocks with the same ``round-limit`` code and message;
  delivering the prompt is delegated to an injected async callable (the
  gateway's chat-completion channel) and a successful hand-off is recorded
  via ``GoalRepository.admit_round`` — the storage twin of DSH's fold over
  attributed user messages.

The idle-edge wiring (calling ``drive`` when a thread's last run settles)
lands as a thin consumer of this module; keeping it here lets the trigger
points evolve without touching the guarantees.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from qilin.persistence.goal.sql import GoalError, GoalRepository

logger = logging.getLogger(__name__)

_FIXED_GOAL_ROUND_BODY = (
    "Continue working toward the objective in this same session. Treat the current workspace, "
    "tool results, and durable session state as authoritative; inspect them instead of assuming "
    "earlier narration is still current. Make concrete progress and verify the result. Before "
    "claiming completion, gather evidence that the whole objective is achieved, read the current "
    "goal, and mark it complete. If work remains, leave the goal active for the next round. Follow "
    "the configured goal-tool policy before reporting a blocker."
)


def render_goal_round_prompt(objective: str, round_number: int, max_goal_rounds: int) -> str:
    """Verbatim port of ``renderGoalRoundPrompt`` from prompt.ts."""
    return (
        "<goal_round>\n"
        f"Objective: {json.dumps(objective, ensure_ascii=False)}\n"
        f"Round: {round_number}/{max_goal_rounds}\n\n"
        + _FIXED_GOAL_ROUND_BODY
        + "\n"
        + "</goal_round>"
    )


def consecutive_blocked_streak(history: list[dict[str, Any]]) -> int:
    """Count the latest uninterrupted streak of same-reason blocks.

    Mirrors the reference "same-condition blocked >= N rounds" safety
    valve: a streak is broken by any non-block operation (resume, edit,
    …), and consecutive blocks only count together when their reason code
    matches — different blockers mean progress between stalls.
    """
    code: str | None = None
    streak = 0
    for item in reversed(history):
        if item.get("operation") != "block":
            break
        reason = (item.get("payload") or {}).get("goal", {}).get("blocked_reason")
        item_code = (reason or {}).get("code") if isinstance(reason, dict) else None
        if code is None:
            code = item_code
            streak = 1
        elif item_code == code:
            streak += 1
        else:
            break
    return streak


@dataclass
class DriveOutcome:
    """What one quiescent drive pass decided (for logs/tests/SSE)."""

    status: str  # 'dropped' | 'blocked-limit' | 'injected'
    reason: str | None = None
    ref: dict[str, Any] | None = None
    round: int | None = None


async def drive(
    repo: GoalRepository,
    thread_id: str,
    projection: dict[str, Any] | None,
    activation: str,
    *,
    inject: Callable[[str, int], Awaitable[None]],
    history: list[dict[str, Any]] | None = None,
    blocked_streak_limit: int = 0,
) -> DriveOutcome:
    """Evaluate the quiescence gate and maybe inject the next round.

    ``inject(prompt_text, round_number)`` must deliver the rendered
    `<goal_round>` message through the normal chat-completion channel with
    the goal attribution metadata; it raises on delivery failure.
    Admission into the durable counter happens only after a successful
    injection, mirroring the reference where counting rides on the
    committed session message.

    ``history``/``blocked_streak_limit`` carry the safety-valve hook
    (§1.4 "same-condition blocked ≥ N rounds"): when the limit is > 0 and
    the change log already ends in that many same-reason blocks, driving
    stops even though resume semantics would allow it. The model-side
    self-report channel is not wired yet, so with no block rows this is a
    structural no-op today.
    """
    if projection is None or projection.get("operation") == "clear":
        return DriveOutcome(status="dropped", reason="no-current-goal")
    goal = projection.get("goal")
    if goal is None or goal.get("phase") != "active":
        return DriveOutcome(
            status="dropped",
            reason=f"phase={goal.get('phase') if goal else 'none'}",
        )
    if activation != "armed":
        return DriveOutcome(status="dropped", reason="disarmed")

    ref = {"id": goal["id"], "revision": goal["revision"]}

    rounds = projection.get("rounds_started", 0)
    cap = goal["max_goal_rounds"]
    if rounds >= cap:
        try:
            await repo.block(
                thread_id=thread_id,
                ref=ref,
                reason={
                    "code": "round-limit",
                    "message": f"Goal reached its configured limit of {cap} rounds.",
                },
            )
        except GoalError as exc:
            logger.warning("goal-round-driver: limit block failed: %s", exc.code)
            return DriveOutcome(status="dropped", reason=f"block-failed:{exc.code}", ref=ref)
        return DriveOutcome(status="blocked-limit", ref=ref)

    if blocked_streak_limit > 0 and history is not None:
        streak = consecutive_blocked_streak(history)
        if streak >= blocked_streak_limit:
            return DriveOutcome(
                status="dropped",
                reason=f"blocked-streak>={streak}",
                ref=ref,
            )

    round_number = rounds + 1
    prompt = render_goal_round_prompt(goal["objective"], round_number, cap)
    try:
        await inject(prompt, round_number)
    except Exception as exc:
        logger.warning("goal-round-driver: injection failed for round %s: %s", round_number, exc)
        return DriveOutcome(status="dropped", reason="inject-failed", ref=ref, round=round_number)
    try:
        admitted = await repo.admit_round(thread_id=thread_id, ref=ref, round=round_number)
    except GoalError as exc:
        logger.warning("goal-round-driver: admission failed for round %s: %s", round_number, exc.code)
        return DriveOutcome(status="dropped", reason=f"admit-failed:{exc.code}", ref=ref, round=round_number)
    return DriveOutcome(status="injected", ref=ref, round=round_number, reason=f"rounds_started={admitted['rounds_started']}")
