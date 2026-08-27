"""ORM models for the sandbox-mode event log.

Unlike the workspace registry these rows are append-only facts, not mutable
entities: the current mode of a thread is *defined* as its latest event
(DSH permission-presets folds session events in log order and keeps the
last seen ``sandbox/mode`` payload). Insertion order therefore matters and
is carried by the autoincrement primary key rather than timestamps alone.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from qilin.persistence.base import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class SandboxModeEventRow(Base):
    """One committed ``sandbox/mode`` knob event for one thread."""

    __tablename__ = "sandbox_mode_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    thread_id: Mapped[str] = mapped_column(String(64), index=True)
    user_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    mode: Mapped[str] = mapped_column(String(32))
    source: Mapped[str] = mapped_column(String(32), default="user")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
