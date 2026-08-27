"""ORM models for the goal domain.

Column ``revision`` on the change log mirrors the snapshot revision it
carries (create=1, each mutation +1) so the CAS head check can read the
log index directly without decoding JSON.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from qilin.persistence.base import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class GoalChangeRow(Base):
    """One committed goal mutation: either a full-snapshot change or a
    clear tombstone (``operation='clear'`` with only the cleared ref)."""

    __tablename__ = "goal_changes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    thread_id: Mapped[str] = mapped_column(String(64), index=True)
    user_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    operation: Mapped[str] = mapped_column(String(16))
    revision: Mapped[int] = mapped_column(Integer)
    payload: Mapped[dict] = mapped_column(JSON)
    rounds_started: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
