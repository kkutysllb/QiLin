"""Process-local goal activation (DSH GoalActivation alignment).

``armed``/``disarmed`` is deliberately *never* persisted: after a gateway
restart every goal starts disarmed and only an explicit human resume (UI
button) re-arms it — the safety red line from the refactor plan. The map
keys on ``(user_id, thread_id)`` because one process serves many users.
"""

from __future__ import annotations

GoalActivation = str  # 'armed' | 'disarmed'

_activation: dict[tuple[str, str], GoalActivation] = {}


def key(user_id: str, thread_id: str) -> tuple[str, str]:
    return (user_id, thread_id)


def get(user_id: str, thread_id: str) -> GoalActivation:
    """Absent entries read as disarmed — restart never auto-continues."""
    return _activation.get((user_id, thread_id), "disarmed")


def set_activation(user_id: str, thread_id: str, value: GoalActivation) -> None:
    _activation[(user_id, thread_id)] = value
