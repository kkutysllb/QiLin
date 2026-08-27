"""SQLAlchemy-backed sandbox-mode event storage.

DSH semantics: the thread's sandbox mode is the *last* ``sandbox/mode``
event in log order (``permission-presets.applyKnobEvent`` keeps the latest
payload; the effective-preset read scans backwards for the first hit).
QiLin folds identically but persists the log in SQL so resolution survives
restarts. Execution-side enforcement is intentionally out of scope for
this slice (single-host full-access today).

The mode vocabulary is copied verbatim from DSH ``SandboxMode``:
``read-only`` | ``workspace-write`` | ``danger-full-access``. The default
for threads without any event preserves QiLin's current behaviour of an
unconfined single-host run.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from qilin.persistence.sandbox_mode.model import SandboxModeEventRow

SANDBOX_MODES: frozenset[str] = frozenset(
    {"read-only", "workspace-write", "danger-full-access"}
)
DEFAULT_SANDBOX_MODE = "danger-full-access"


class SandboxModeError(Exception):
    """Stable API-mappable failure codes."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class SandboxModeRepository:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._sf = session_factory

    @staticmethod
    def _to_dict(row: SandboxModeEventRow) -> dict[str, Any]:
        return {
            "id": row.id,
            "thread_id": row.thread_id,
            "mode": row.mode,
            "source": row.source,
            "user_id": row.user_id,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }

    async def append(
        self,
        *,
        thread_id: str,
        mode: str,
        user_id: str | None = None,
        source: str = "user",
    ) -> dict[str, Any]:
        """Append one knob event; returns the stored row as a dict."""
        if mode not in SANDBOX_MODES:
            raise SandboxModeError(
                "SANDBOX_MODE_INVALID",
                f"unknown sandbox mode {mode!r}; expected one of "
                + ", ".join(sorted(SANDBOX_MODES)),
            )
        async with self._sf() as session:
            row = SandboxModeEventRow(
                thread_id=thread_id, mode=mode, source=source, user_id=user_id
            )
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return self._to_dict(row)

    async def folded(self, thread_id: str) -> dict[str, Any] | None:
        """The last event in log order, or None when no event exists."""
        async with self._sf() as session:
            row = (
                (
                    await session.execute(
                        select(SandboxModeEventRow)
                        .where(SandboxModeEventRow.thread_id == thread_id)
                        .order_by(SandboxModeEventRow.id.desc())
                        .limit(1)
                    )
                )
                .scalars()
                .first()
            )
            return self._to_dict(row) if row is not None else None

    async def history(self, thread_id: str, *, limit: int = 200) -> list[dict[str, Any]]:
        """Events in append order (oldest first), newest bounded by limit."""
        async with self._sf() as session:
            rows = (
                (
                    await session.execute(
                        select(SandboxModeEventRow)
                        .where(SandboxModeEventRow.thread_id == thread_id)
                        .order_by(SandboxModeEventRow.id.desc())
                        .limit(limit)
                    )
                )
                .scalars()
                .all()
            )
            return [self._to_dict(r) for r in reversed(rows)]
