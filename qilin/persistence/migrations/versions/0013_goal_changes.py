"""goal_changes event log table.

Revision ID: 0013_goal_changes
Revises: 0012_sandbox_mode_events
Create Date: 2026-08-27

Append-only goal domain log (DSH dsh-goal alignment). Every accepted verb
appends one whole-snapshot row or a clear tombstone; the projection is the
last row folded last-wins and CAS guards compare against this head inside
the append transaction.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013_goal_changes"
down_revision: str | Sequence[str] | None = "0012_sandbox_mode_events"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Column shapes mirror GoalChangeRow exactly (Python-side defaults, no
    # server_default) so create_all and this migration are byte-identical.
    op.create_table(
        "goal_changes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("thread_id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=True),
        sa.Column("operation", sa.String(length=16), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("rounds_started", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("goal_changes", schema=None) as batch_op:
        batch_op.create_index("ix_goal_changes_thread_id", ["thread_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("goal_changes", schema=None) as batch_op:
        batch_op.drop_index("ix_goal_changes_thread_id")
    op.drop_table("goal_changes")
