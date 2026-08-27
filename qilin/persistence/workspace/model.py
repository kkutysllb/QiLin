"""ORM models for the workspace registry.

QiLin is multi-user (unlike single-process DSH): every registry structure
is scoped to its owning ``user_id`` resolved from the auth contextvar.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from qilin.persistence.base import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class WorkspaceRow(Base):
    """One registered directory for one user. ``id`` is a generated uuid —
    never the path: path normalization rewrites paths (symlinks, trailing
    slashes) while a reference anchor must stay stable. ``canonical_path``
    is the realpath taken at create time and never rewritten afterwards."""

    __tablename__ = "workspaces"
    __table_args__ = (
        UniqueConstraint("user_id", "canonical_path", name="uq_workspaces_user_path"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    canonical_path: Mapped[str] = mapped_column(String(1024))
    title: Mapped[str] = mapped_column(String(256), default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class WorkspaceOrderRow(Base):
    """Durable workspace display order. Lower ``position`` renders first;
    registration prepends by assigning the lowest position (renumbering on
    write keeps integers dense within the owning user's set — scoping rides
    on the workspace ownership join, never on this table alone). One row per
    workspace."""

    __tablename__ = "workspace_order"

    workspace_id: Mapped[str] = mapped_column(
        String(64), primary_key=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)


class WorkspaceSessionRow(Base):
    """Per-workspace thread account with manually owned order (new threads
    prepend at position 0; explicit moves renumber). Membership also requires
    the thread header cwd to equal the workspace canonical path — validated
    at attach, filtered at read; this table alone is only the candidate
    account."""

    __tablename__ = "workspace_sessions"

    workspace_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    thread_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class WorkspaceMetaRow(Base):
    """Registry-scoped scalars, per owning user: the bootstrap
    ``initialized`` marker and the global ``archived_thread_ids`` JSON array
    (registry-wide set layered over every workspace account; slots are
    retained so unarchive restores position)."""

    __tablename__ = "workspace_meta"

    user_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict | list | str | None] = mapped_column(JSON, nullable=True)
