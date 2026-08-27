"""SQLAlchemy-backed workspace registry storage.

Implements the DSH ``dsh-workspace`` verb surface, scoped per user:
canonical-path creation idempotency, durable display order, per-workspace
thread accounts with manual ordering, the registry-global archive set, and
the bootstrap initialized marker. Each method acquires its own short-lived
session (mirrors FeedbackRepository).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from qilin.persistence.workspace.model import (
    WorkspaceMetaRow,
    WorkspaceOrderRow,
    WorkspaceRow,
    WorkspaceSessionRow,
)


class WorkspaceError(Exception):
    """Stable API-mappable failure codes for the workspace registry."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class WorkspaceRepository:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._sf = session_factory

    # ------------------------------------------------------------------
    # row mappers

    @staticmethod
    def _ws_to_dict(row: WorkspaceRow, position: int | None = None,
                    session_ids: list[str] | None = None) -> dict:
        d = {
            "id": row.id,
            "user_id": row.user_id,
            "path": row.canonical_path,
            "title": row.title,
            "created_at": _iso(row.created_at),
            "updated_at": _iso(row.updated_at),
            "session_ids": session_ids or [],
        }
        if position is not None:
            d["position"] = position
        return d

    # ------------------------------------------------------------------
    # creation / lookup

    async def create(
        self,
        *,
        user_id: str,
        canonical_path: str,
        title: str | None = None,
    ) -> dict:
        """Register one directory. Repeated calls for the same canonical path
        return the existing record unchanged (idempotent; title is not
        rewritten). New records prepend to the user's durable order."""
        resolved_title = title if title else basename_of(canonical_path)
        async with self._sf() as session:
            existing = (
                await session.execute(
                    select(WorkspaceRow).where(
                        WorkspaceRow.user_id == user_id,
                        WorkspaceRow.canonical_path == canonical_path,
                    )
                )
            ).scalar_one_or_none()
            if existing is not None:
                pos = await self._position_of(session, existing.id)
                return self._ws_to_dict(existing, position=pos)

            row = WorkspaceRow(
                id=str(uuid.uuid4()),
                user_id=user_id,
                canonical_path=canonical_path,
                title=resolved_title,
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
            session.add(row)

            # Prepend to durable order: shift every existing row down by one.
            for order_row in (
                await session.execute(
                    select(WorkspaceOrderRow)
                    .where(order_user_filter(user_id))
                    .order_by(WorkspaceOrderRow.position)
                )
            ).scalars():
                order_row.position += 1
            session.add(WorkspaceOrderRow(workspace_id=row.id, position=0))
            await session.commit()
            await session.refresh(row)
            return self._ws_to_dict(row, position=0)

    async def get(self, workspace_id: str, *, user_id: str) -> dict | None:
        async with self._sf() as session:
            row = await self._owned(session, workspace_id, user_id)
            if row is None:
                return None
            return self._ws_to_dict(row)

    # ------------------------------------------------------------------
    # ordered listing

    async def list_for_user(self, *, user_id: str) -> list[dict]:
        """All of a user's workspaces in durable order. Order rows missing
        their workspace (corruption) sort last and never abort the read."""
        async with self._sf() as session:
            rows = (
                (
                    await session.execute(
                        select(WorkspaceRow)
                        .where(WorkspaceRow.user_id == user_id)
                        .order_by(WorkspaceRow.created_at)
                    )
                )
                .scalars()
                .all()
            )
            if not rows:
                return []
            positions = {
                r.workspace_id: r.position
                for r in (
                    await session.execute(select(WorkspaceOrderRow))
                ).scalars()
            }
            out = [
                self._ws_to_dict(r, position=positions.get(r.id, 1 << 30))
                for r in rows
            ]
            out.sort(key=lambda w: (w["position"], w["created_at"]))
            return out

    # ------------------------------------------------------------------
    # reordering & rename

    async def insert_before(
        self, workspace_id: str, before_workspace_id: str | None, *,
        user_id: str,
    ) -> None:
        """DOM-insertBefore semantics: with an anchor the workspace lands
        directly before it; without one it moves to the end. A self-move or
        move-to-current-position resolves without writing."""
        async with self._sf() as session:
            target = await self._owned(session, workspace_id, user_id)
            if target is None:
                raise WorkspaceError("WORKSPACE_NOT_FOUND", f"unknown workspace {workspace_id}")
            anchor_position: int | None = None
            if before_workspace_id is not None:
                if before_workspace_id == workspace_id:
                    return
                anchor = await self._owned(session, before_workspace_id, user_id)
                if anchor is None:
                    raise WorkspaceError("WORKSPACE_NOT_FOUND", f"unknown anchor {before_workspace_id}")
                anchor_position = await self._position_of(session, anchor.id)
            current = await self._position_of(session, workspace_id)
            if anchor_position == current:
                return
            orders = (
                (
                    await session.execute(
                        select(WorkspaceOrderRow)
                        .where(order_user_filter(user_id))
                        .order_by(WorkspaceOrderRow.position)
                    )
                )
                .scalars()
                .all()
            )
            ids_in_order = [r.workspace_id for r in orders]
            ids_in_order.remove(workspace_id)
            if anchor_position is None:
                ids_in_order.append(workspace_id)
            else:
                ids_in_order.insert(ids_in_order.index(before_workspace_id), workspace_id)
            for new_pos, ws_id in enumerate(ids_in_order):
                next((r for r in orders if r.workspace_id == ws_id)).position = new_pos
            await session.commit()

    async def set_title(self, workspace_id: str, title: str, *, user_id: str) -> dict:
        async with self._sf() as session:
            row = await self._owned(session, workspace_id, user_id)
            if row is None:
                raise WorkspaceError("WORKSPACE_NOT_FOUND", f"unknown workspace {workspace_id}")
            row.title = title
            row.updated_at = datetime.now(UTC)
            await session.commit()
            await session.refresh(row)
            return self._ws_to_dict(row)

    # ------------------------------------------------------------------
    # thread account (manual order)

    async def attach_thread(
        self, workspace_id: str, thread_id: str, *,
        user_id: str, thread_cwd: str | None,
    ) -> None:
        """Prepend a thread to the account. The caller passes the thread's
        stored cwd so membership validates against the workspace path —
        mismatches reject without writing (DSH header-validation alignment).
        Already-accounted threads resolve without writing."""
        ws = await self.get(workspace_id, user_id=user_id)
        if ws is None:
            raise WorkspaceError("WORKSPACE_NOT_FOUND", f"unknown workspace {workspace_id}")
        if thread_cwd != ws["path"]:
            raise WorkspaceError(
                "WORKSPACE_CWD_MISMATCH",
                f"thread {thread_id} cwd {thread_cwd!r} does not match workspace path",
            )
        async with self._sf() as session:
            existing = (
                await session.execute(
                    select(WorkspaceSessionRow).where(
                        WorkspaceSessionRow.workspace_id == workspace_id,
                        WorkspaceSessionRow.thread_id == thread_id,
                    )
                )
            ).scalar_one_or_none()
            if existing is not None:
                return
            for row in (
                await session.execute(
                    select(WorkspaceSessionRow)
                    .where(WorkspaceSessionRow.workspace_id == workspace_id)
                    .order_by(WorkspaceSessionRow.position)
                )
            ).scalars():
                row.position += 1
            session.add(
                WorkspaceSessionRow(
                    workspace_id=workspace_id, thread_id=thread_id, position=0
                )
            )
            await session.commit()

    async def move_thread_before(
        self, workspace_id: str, thread_id: str, before_thread_id: str | None,
        *, user_id: str,
    ) -> None:
        """insertBefore on the manual account order. Absent members reject;
        a move resolving to the current order writes nothing (computed-order
        equality). Every accepted mutation renumbers densely."""
        async with self._sf() as session:
            ws_row = await self._owned(session, workspace_id, user_id)
            if ws_row is None:
                raise WorkspaceError("WORKSPACE_NOT_FOUND", f"unknown workspace {workspace_id}")
            rows = (
                (
                    await session.execute(
                        select(WorkspaceSessionRow)
                        .where(WorkspaceSessionRow.workspace_id == workspace_id)
                        .order_by(WorkspaceSessionRow.position)
                    )
                )
                .scalars()
                .all()
            )
            ids = [r.thread_id for r in rows]
            if thread_id not in ids:
                raise WorkspaceError("THREAD_NOT_ACCOUNTED", f"thread {thread_id} not in workspace")
            if before_thread_id is not None and before_thread_id not in ids:
                raise WorkspaceError("THREAD_NOT_ACCOUNTED", f"anchor {before_thread_id} not in workspace")
            next_ids = [i for i in ids if i != thread_id]
            if before_thread_id is None:
                next_ids.append(thread_id)
            else:
                next_ids.insert(next_ids.index(before_thread_id), thread_id)
            if next_ids == ids:
                # A move to the current position resolves without writing.
                return
            by_id = {r.thread_id: r for r in rows}
            for new_pos, tid in enumerate(next_ids):
                by_id[tid].position = new_pos
            await session.commit()

    # (delete path mirrors detach above but for whole-table sweeps)
    async def _prune_account(self, workspace_id: str, live_thread_ids: set[str], *,
                             user_id: str) -> None:
        """Drop accounted ids whose thread header vanished (filtered-candidate
        prune, DSH alignment: every accepted workspace mutation prunes)."""
        ws = await self.get(workspace_id, user_id=user_id)
        if ws is None:
            raise WorkspaceError("WORKSPACE_NOT_FOUND", f"unknown workspace {workspace_id}")
        accounted = await self.session_account(workspace_id, user_id=user_id)
        stale = [tid for tid in accounted if tid not in live_thread_ids]
        if not stale:
            return
        async with self._sf() as session:
            await session.execute(
                delete(WorkspaceSessionRow).where(
                    WorkspaceSessionRow.workspace_id == workspace_id,
                    WorkspaceSessionRow.thread_id.in_(stale),
                )
            )
            await session.commit()

    async def detach_thread(self, workspace_id: str, thread_id: str, *, user_id: str) -> None:
        """Idempotent removal from the account; never touches thread data."""
        async with self._sf() as session:
            await session.execute(
                delete(WorkspaceSessionRow).where(
                    WorkspaceSessionRow.workspace_id == workspace_id,
                    WorkspaceSessionRow.thread_id == thread_id,
                )
            )
            await session.commit()

    async def session_account(self, workspace_id: str, *, user_id: str) -> list[str]:
        """Accounted thread ids in manual order (candidate projection; callers
        filter against live thread headers)."""
        async with self._sf() as session:
            ws_row = await self._owned(session, workspace_id, user_id)
            if ws_row is None:
                raise WorkspaceError("WORKSPACE_NOT_FOUND", f"unknown workspace {workspace_id}")
            return list(
                (
                    await session.execute(
                        select(WorkspaceSessionRow.thread_id)
                        .where(WorkspaceSessionRow.workspace_id == workspace_id)
                        .order_by(WorkspaceSessionRow.position)
                    )
                )
                .scalars()
            )

    # ------------------------------------------------------------------
    # archive set (registry-global, retained slots)

    async def archived_thread_ids(self, *, user_id: str) -> list[str]:
        meta = await self._meta(user_id, "archived_thread_ids")
        value = meta or []
        return [str(v) for v in value]

    async def archive_thread(self, thread_id: str, *, user_id: str) -> None:
        async with self._sf() as session:
            row = await session.get(WorkspaceMetaRow, (user_id, "archived_thread_ids"))
            current: list[str] = list(row.value) if row and isinstance(row.value, list) else []
            if thread_id not in current:
                current.append(thread_id)
                await _upsert_meta(session, user_id, "archived_thread_ids", current)
                await session.commit()

    async def unarchive_thread(self, thread_id: str, *, user_id: str) -> None:
        async with self._sf() as session:
            row = await session.get(WorkspaceMetaRow, (user_id, "archived_thread_ids"))
            if row and isinstance(row.value, list) and thread_id in row.value:
                row.value = [v for v in row.value if v != thread_id]
                await session.commit()

    # ------------------------------------------------------------------
    # bootstrap marker

    async def is_initialized(self, *, user_id: str) -> bool:
        return bool(await self._meta(user_id, "initialized"))

    async def mark_initialized(self, *, user_id: str) -> None:
        async with self._sf() as session:
            await _upsert_meta(session, user_id, "initialized", True)
            await session.commit()

    # ------------------------------------------------------------------
    # deletion

    async def delete(self, workspace_id: str, *, user_id: str) -> bool:
        """Remove only the registration, its order entry, and the thread
        account. Directory files and thread logs are never touched → owned
        threads render under Ungrouped afterwards. Unknown ids return False."""
        async with self._sf() as session:
            row = await self._owned(session, workspace_id, user_id)
            if row is None:
                return False
            await session.delete(row)
            order_row = await session.get(WorkspaceOrderRow, workspace_id)
            if order_row is not None:
                await session.delete(order_row)
            await session.execute(
                delete(WorkspaceSessionRow).where(
                    WorkspaceSessionRow.workspace_id == workspace_id
                )
            )
            await session.commit()
            return True

    # ------------------------------------------------------------------
    # helpers

    async def _owned(self, session: AsyncSession, workspace_id: str, user_id: str) -> WorkspaceRow | None:
        return (
            await session.execute(
                select(WorkspaceRow).where(
                    WorkspaceRow.id == workspace_id,
                    WorkspaceRow.user_id == user_id,
                )
            )
        ).scalar_one_or_none()

    async def _position_of(self, session: AsyncSession, workspace_id: str) -> int | None:
        row = await session.get(WorkspaceOrderRow, workspace_id)
        return row.position if row else None

    async def _meta(self, user_id: str, key: str):
        async with self._sf() as session:
            row = await session.get(WorkspaceMetaRow, (user_id, key))
            return row.value if row else None


# ----------------------------------------------------------------------
# module-level pure helpers (no captured state)

def _iso(value: datetime) -> str:
    if value.tzinfo is None:
        return value.isoformat() + "+00:00"
    return value.isoformat()


def basename_of(path: str) -> str:
    trimmed = path.rstrip("/\\")
    for sep in ("/", "\\"):
        idx = trimmed.rfind(sep)
        if idx >= 0:
            candidate = trimmed[idx + 1:]
            if candidate:
                return candidate
    return trimmed


def order_user_filter(user_id: str):
    """Scope order rows through workspace ownership."""
    return WorkspaceOrderRow.workspace_id.in_(
        select(WorkspaceRow.id).where(WorkspaceRow.user_id == user_id)
    )


async def _upsert_meta(
    session: AsyncSession, user_id: str, key: str, value: object
) -> None:
    row = await session.get(WorkspaceMetaRow, (user_id, key))
    if row is None:
        session.add(WorkspaceMetaRow(user_id=user_id, key=key, value=value))
    else:
        row.value = value
