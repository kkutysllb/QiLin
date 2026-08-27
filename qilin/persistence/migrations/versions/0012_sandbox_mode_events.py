"""sandbox-mode event log table.

Revision ID: 0012_sandbox_mode_events
Revises: 0011_workspaces
Create Date: 2026-08-27

Append-only knob log (DSH ``sandbox/mode`` alignment). Insertion order is
the fold order, carried by the autoincrement ``id`` — timestamps are
informational only.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012_sandbox_mode_events"
down_revision: str | Sequence[str] | None = "0011_workspaces"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Column shapes mirror SandboxModeEventRow exactly (Python-side defaults,
    # no server_default) so create_all and this migration are byte-identical.
    op.create_table(
        "sandbox_mode_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("thread_id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=True),
        sa.Column("mode", sa.String(length=32), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("sandbox_mode_events", schema=None) as batch_op:
        batch_op.create_index(
            "ix_sandbox_mode_events_thread_id", ["thread_id"], unique=False
        )


def downgrade() -> None:
    with op.batch_alter_table("sandbox_mode_events", schema=None) as batch_op:
        batch_op.drop_index("ix_sandbox_mode_events_thread_id")
    op.drop_table("sandbox_mode_events")
