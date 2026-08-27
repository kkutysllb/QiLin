"""SQLAlchemy goal-domain storage: seven-verb CAS surface + fold.

Semantics ported from DSH ``@deepseek-ai/dsh-goal`` (index.ts service and
domain.ts vocabulary), adapted from live-agent session events to a
multi-user REST thread scope:

- ``GOAL_AGENT_NOT_LIVE`` has no REST equivalent — thread liveness/ownership
  is enforced by the router's owner_check; the code is kept in the
  documented vocabulary but never raised here.
- Snapshots are whole-value (post-change) so the fold is last-wins.
- Activation is process-local and lives at the gateway layer, never here.

Round accounting (``rounds_started``) is bumped only by the round driver's
admitted continuations (P6); verbs carry it through unchanged.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from qilin.persistence.goal.model import GoalChangeRow

GOAL_OPERATIONS: frozenset[str] = frozenset(
    {"create", "edit", "pause", "resume", "complete", "block", "clear"}
)
GOAL_PHASES: tuple[str, ...] = ("active", "paused", "blocked", "complete")
DEFAULT_MAX_GOAL_ROUNDS = 256


class GoalError(Exception):
    """Stable API-mappable failure codes (DSH GoalErrorCode vocabulary)."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


# ----------------------------------------------------------------------
# pure validation helpers (mirror resolveCreateGoal / resolveObjective /
# resolveMaxGoalRounds / resolveBlockReason in the reference)

def validate_objective(objective: str) -> str:
    if not isinstance(objective, str) or not objective.strip():
        raise GoalError(
            "GOAL_INVALID_OBJECTIVE", "goal objective must be a non-empty string"
        )
    return objective.strip()


def validate_max_goal_rounds(value: Any) -> int:
    if (
        isinstance(value, bool)
        or not isinstance(value, int)
        or value <= 0
        or value > 2**53 - 1
    ):
        raise GoalError(
            "GOAL_INVALID_MAX_ROUNDS",
            "maxGoalRounds must be a positive safe integer",
        )
    return int(value)


def validate_block_reason(reason: dict[str, Any]) -> dict[str, str]:
    code = reason.get("code") if isinstance(reason, dict) else None
    message = reason.get("message") if isinstance(reason, dict) else None
    if not isinstance(code, str) or not code.strip():
        raise GoalError(
            "GOAL_INVALID_BLOCK_REASON", "block reason needs a stable code"
        )
    if not isinstance(message, str) or not message.strip():
        raise GoalError(
            "GOAL_INVALID_BLOCK_REASON", "block reason needs a human message"
        )
    return {"code": code.strip(), "message": message.strip()}


def _snapshot_from_payload(payload: dict[str, Any]) -> dict[str, Any] | None:
    """Decode a change payload into its snapshot (None for clear tombstones)."""
    return payload.get("goal")


class GoalRepository:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._sf = session_factory

    # ------------------------------------------------------------------
    # read side — total fold of the append-only log

    @staticmethod
    def _head_to_projection(row: GoalChangeRow | None) -> dict[str, Any] | None:
        if row is None:
            return None
        base: dict[str, Any] = {
            "operation": row.operation,
            "rounds_started": row.rounds_started,
            "last_ref": (
                {
                    "id": row.payload["goal"]["id"],
                    "revision": row.revision,
                }
                if row.operation != "clear"
                else dict(row.payload.get("cleared") or {})
            ),
        }
        if row.operation == "clear":
            base["cleared"] = row.payload.get("cleared")
            base["cleared_at"] = row.created_at.isoformat() if row.created_at else None
            return base
        goal = _snapshot_from_payload(row.payload)
        if goal is None:
            return None
        base["goal"] = {
            "id": goal["id"],
            "revision": row.revision,
            "objective": goal["objective"],
            "phase": goal["phase"],
            **({"blocked_reason": goal["blocked_reason"]} if goal.get("blocked_reason") else {}),
            "max_goal_rounds": goal["max_goal_rounds"],
        }
        base["created_at"] = row.payload.get("created_at")
        base["updated_at"] = row.created_at.isoformat() if row.created_at else None
        return base

    @staticmethod
    def _snapshot_dict(row: GoalChangeRow) -> dict[str, Any]:
        snap = row.payload["goal"]
        return {
            "id": snap["id"],
            "revision": row.revision,
            "objective": snap["objective"],
            "phase": snap["phase"],
            **({"blocked_reason": snap["blocked_reason"]} if snap.get("blocked_reason") else {}),
            "max_goal_rounds": snap["max_goal_rounds"],
        }

    async def projection(self, thread_id: str) -> dict[str, Any] | None:
        """The folded head of the change log: full snapshot shape while a
        goal is current, a clear-tombstone shape (no ``goal`` key) after
        clear, and None only on threads that never created one."""
        async with self._sf() as session:
            row = await self._head(session, thread_id)
            return self._head_to_projection(row)

    async def history(self, thread_id: str, *, limit: int = 200) -> list[dict[str, Any]]:
        """Change log in append order (oldest first)."""
        async with self._sf() as session:
            rows = (
                (
                    await session.execute(
                        select(GoalChangeRow)
                        .where(GoalChangeRow.thread_id == thread_id)
                        .order_by(GoalChangeRow.id.desc())
                        .limit(limit)
                    )
                )
                .scalars()
                .all()
            )
            out: list[dict[str, Any]] = []
            for row in reversed(rows):
                item: dict[str, Any] = {
                    "operation": row.operation,
                    "rounds_started": row.rounds_started,
                    "created_at": row.created_at.isoformat() if row.created_at else None,
                }
                snap = self._snapshot_dict(row) if row.operation != "clear" else None
                if snap is not None:
                    item["ref"] = {"id": snap["id"], "revision": snap["revision"]}
                    item["goal"] = snap
                else:
                    item["cleared"] = row.payload.get("cleared")
                out.append(item)
            return out

    # ------------------------------------------------------------------
    # write side — CAS-guarded appends inside one short transaction

    async def _head(self, session: AsyncSession, thread_id: str) -> GoalChangeRow | None:
        res = await session.execute(
            select(GoalChangeRow)
            .where(GoalChangeRow.thread_id == thread_id)
            .order_by(GoalChangeRow.id.desc())
            .limit(1)
        )
        return res.scalars().first()

    async def _append(
        self,
        thread_id: str,
        *,
        user_id: str | None,
        operation: str,
        revision: int,
        payload: dict[str, Any],
        rounds_started: int,
        current_id: str | None,
    ) -> dict[str, Any]:
        """Append one change after re-checking the head inside the write
        transaction. ``current_id`` is the goal id the caller based its
        mutation on (None for clear, which anchors on the cleared ref)."""
        async with self._sf() as session:
            async with session.begin():
                head = await self._head(session, thread_id)
                expected_head_rev = revision - 1
                head_current_ref = (
                    None
                    if head is None or head.operation == "clear"
                    else head.payload["goal"]["id"]
                )
                if head is None:
                    stale = expected_head_rev != 0
                else:
                    # Clear resets the chain: the next create starts at
                    # revision 1 with no predecessor anchor.
                    if operation == "create":
                        stale = False  # create guard lives in its own tx
                    else:
                        stale = (
                            head.revision != expected_head_rev
                            or (head_current_ref or "") != (current_id or "")
                        )
                if stale:
                    raise GoalError("GOAL_STALE_REVISION", f"stale ref on {thread_id}")
                row = GoalChangeRow(
                    thread_id=thread_id,
                    user_id=user_id,
                    operation=operation,
                    revision=revision,
                    payload=payload,
                    rounds_started=rounds_started,
                )
                session.add(row)
            await session.refresh(row)
            return {
                "operation": operation,
                "revision": revision,
                "payload": payload,
                "rounds_started": rounds_started,
                "row_id": row.id,
            }

    # ------------------------------------------------------------------
    # seven verbs

    async def create(
        self,
        thread_id: str,
        *,
        objective: str,
        max_goal_rounds: int | None,
        user_id: str | None = None,
        default_max_rounds: int = DEFAULT_MAX_GOAL_ROUNDS,
    ) -> dict[str, Any]:
        obj = validate_objective(objective)
        cap = (
            validate_max_goal_rounds(max_goal_rounds)
            if max_goal_rounds is not None
            else default_max_rounds
        )
        async with self._sf() as session:
            async with session.begin():
                head = await self._head(session, thread_id)
                if (
                    head is not None
                    and head.operation != "clear"
                    and head.payload["goal"]["phase"] != "complete"
                ):
                    raise GoalError(
                        "GOAL_ALREADY_EXISTS",
                        f'thread "{thread_id}" already has a goal in phase '
                        f'"{head.payload["goal"]["phase"]}"',
                    )
                next_revision = 1
                goal_id = f"goal-{uuid.uuid4()}"
                from datetime import UTC, datetime

                created_iso = datetime.now(UTC).isoformat()
                row = GoalChangeRow(
                    thread_id=thread_id,
                    user_id=user_id,
                    operation="create",
                    revision=next_revision,
                    payload={
                        "goal": {
                            "id": goal_id,
                            "objective": obj,
                            "phase": "active",
                            "max_goal_rounds": cap,
                        },
                        "created_at": created_iso,
                    },
                    rounds_started=0,
                )
                session.add(row)
            await session.refresh(row)
            return self._result(row)

    async def edit(
        self,
        thread_id: str,
        *,
        ref: dict[str, int | str],
        objective: str | None,
        max_goal_rounds: int | None,
        user_id: str | None = None,
    ) -> dict[str, Any]:
        if objective is None and max_goal_rounds is None:
            raise GoalError(
                "GOAL_INVALID_EDIT", "goal edit requires objective and/or maxGoalRounds"
            )
        return await self._mutate_snapshot(
            thread_id,
            ref=ref,
            operation="edit",
            user_id=user_id,
            mutate=lambda snap: {
                **snap,
                **(
                    {"objective": validate_objective(objective)}
                    if objective is not None
                    else {}
                ),
                **(
                    {"max_goal_rounds": validate_max_goal_rounds(max_goal_rounds)}
                    if max_goal_rounds is not None
                    else {}
                ),
            },
        )

    async def pause(
        self, thread_id: str, *, ref: dict[str, int | str], user_id: str | None = None
    ) -> dict[str, Any]:
        return await self._transition(thread_id, ref, "pause", ["active"], "paused", user_id=user_id)

    async def resume(
        self, thread_id: str, *, ref: dict[str, int | str], user_id: str | None = None
    ) -> dict[str, Any]:
        head = await self._require_head(thread_id, ref)
        snap = self._snapshot_dict(head)
        resumable = ("active", "paused", "blocked")
        if snap["phase"] not in resumable:
            raise GoalError(
                "GOAL_INVALID_TRANSITION",
                f'cannot resume goal in phase "{snap["phase"]}"',
            )
        if snap["phase"] == "active":
            raise GoalError(
                "GOAL_INVALID_TRANSITION", 'goal is already active'
            )
        if head.rounds_started >= snap["max_goal_rounds"]:
            raise GoalError(
                "GOAL_INVALID_TRANSITION",
                f'round budget exhausted ({snap["max_goal_rounds"]}); '
                "increase maxGoalRounds first",
            )
        return await self._write_phase(
            thread_id,
            head=head,
            snap=snap,
            phase="active",
            operation="resume",
            user_id=user_id,
        )

    async def complete(
        self, thread_id: str, *, ref: dict[str, int | str], user_id: str | None = None
    ) -> dict[str, Any]:
        return await self._transition(
            thread_id, ref, "complete", ["active", "paused", "blocked"], "complete", user_id=user_id
        )

    async def block(
        self,
        thread_id: str,
        *,
        ref: dict[str, int | str],
        reason: dict[str, Any],
        user_id: str | None = None,
    ) -> dict[str, Any]:
        validated = validate_block_reason(reason)
        head = await self._require_head(thread_id, ref)
        snap = self._snapshot_dict(head)
        if snap["phase"] != "active":
            raise GoalError("GOAL_INVALID_TRANSITION", "only an active goal can block")
        new_snap = {
            **snap,
            "phase": "blocked",
            "blocked_reason": validated,
            "revision": snap["revision"] + 1,
        }
        return await self._append_snapshot(thread_id, head=head, operation="block", snap=new_snap, user_id=user_id)

    async def clear(
        self, thread_id: str, *, ref: dict[str, int | str], user_id: str | None = None
    ) -> dict[str, Any]:
        head = await self._require_head(thread_id, ref)
        tombstone = {
            "id": head.payload["goal"]["id"],
            "revision": head.revision + 1,
        }
        result = await self._append(
            thread_id,
            user_id=user_id,
            operation="clear",
            revision=tombstone["revision"],
            payload={"cleared": tombstone},
            rounds_started=head.rounds_started,
            # The change anchors on the cleared goal's identity.
            current_id=tombstone["id"],
        )
        result["view"] = self._head_to_projection(
            await self._head_row(thread_id)
        )
        return result

    async def _head_row(self, thread_id: str) -> GoalChangeRow | None:
        async with self._sf() as session:
            return await self._head(session, thread_id)

    # ------------------------------------------------------------------
    # shared internals

    async def _require_head(
        self, thread_id: str, ref: dict[str, int | str]
    ) -> GoalChangeRow:
        async with self._sf() as session:
            head = await self._head(session, thread_id)
        if head is None or head.operation == "clear":
            raise GoalError("GOAL_NOT_FOUND", f'no current goal on "{thread_id}"')
        expected_id = ref.get("id")
        expected_rev = ref.get("revision")
        if (
            head.payload["goal"]["id"] != expected_id
            or head.revision != expected_rev
        ):
            raise GoalError(
                "GOAL_STALE_REVISION",
                f'stale ref revision {expected_rev}; current is {head.revision}',
            )
        return head

    async def _mutate_snapshot(
        self,
        thread_id: str,
        *,
        ref: dict[str, int | str],
        operation: str,
        mutate,
        user_id: str | None,
    ) -> dict[str, Any]:
        head = await self._require_head(thread_id, ref)
        snap = self._snapshot_dict(head)
        # DSH edit has no phase restriction — any current goal may be edited.
        new_snap = mutate(snap)
        new_snap["revision"] = snap["revision"] + 1
        return await self._append_snapshot(
            thread_id, head=head, operation=operation, snap=new_snap, user_id=user_id
        )

    async def _transition(
        self,
        thread_id: str,
        ref: dict[str, int | str],
        operation: str,
        allowed_phases: tuple[str, ...],
        target_phase: str,
        *,
        user_id: str | None,
    ) -> dict[str, Any]:
        head = await self._require_head(thread_id, ref)
        snap = self._snapshot_dict(head)
        if snap["phase"] not in allowed_phases:
            raise GoalError(
                "GOAL_INVALID_TRANSITION",
                f'{operation} requires phase in {list(allowed_phases)}; got "{snap["phase"]}"',
            )
        new_snap = {k: v for k, v in snap.items() if k != "blocked_reason"}
        new_snap["phase"] = target_phase
        new_snap["revision"] = snap["revision"] + 1
        return await self._append_snapshot(
            thread_id, head=head, operation=operation, snap=new_snap, user_id=user_id
        )

    async def _write_phase(
        self,
        thread_id: str,
        *,
        head: GoalChangeRow,
        snap: dict[str, Any],
        phase: str,
        operation: str,
        user_id: str | None,
    ) -> dict[str, Any]:
        new_snap = {**snap, "phase": phase, "revision": snap["revision"] + 1}
        return await self._append_snapshot(
            thread_id, head=head, operation=operation, snap=new_snap, user_id=user_id
        )

    async def _append_snapshot(
        self,
        thread_id: str,
        *,
        head: GoalChangeRow,
        operation: str,
        snap: dict[str, Any],
        user_id: str | None,
    ) -> dict[str, Any]:
        result = await self._append(
            thread_id,
            user_id=user_id,
            operation=operation,
            revision=snap["revision"],
            payload={
                "goal": snap,
                "created_at": head.payload.get("created_at"),
            },
            rounds_started=head.rounds_started,
            current_id=head.payload["goal"]["id"],
        )
        result["view"] = self._projection_from_row_values(snap, result)
        return result

    def _projection_from_row_values(
        self, snap: dict[str, Any], appended: dict[str, Any]
    ) -> dict[str, Any]:
        return {
            "operation": appended["operation"],
            "rounds_started": appended["rounds_started"],
            "last_ref": {"id": snap["id"], "revision": snap["revision"]},
            "goal": {
                "id": snap["id"],
                "revision": snap["revision"],
                "objective": snap["objective"],
                "phase": snap["phase"],
                **({"blocked_reason": snap["blocked_reason"]} if snap.get("blocked_reason") else {}),
                "max_goal_rounds": snap["max_goal_rounds"],
            },
        }

    def _result(self, row: GoalChangeRow) -> dict[str, Any]:
        return {
            "operation": row.operation,
            "revision": row.revision,
            "payload": row.payload,
            "rounds_started": row.rounds_started,
            "row_id": row.id,
            "view": self._head_to_projection(row),
        }
