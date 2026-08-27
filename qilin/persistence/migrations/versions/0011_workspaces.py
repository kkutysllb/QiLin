"""workspace registry tables + immutable thread cwd.

Revision ID: 0011_workspaces
Revises: 0010_run_cancel_request
Create Date: 2026-08-27

QiLin is multi-user: all four registry tables carry a ``user_id`` scope
(unlike single-process DSH where the registry is process-global).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011_workspaces"
down_revision: str | Sequence[str] | None = "0010_run_cancel_request"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _create_workspaces() -> None:
    # Column shapes mirror WorkspaceRow exactly (Python-side defaults, no
    # server_default) so create_all and this migration are byte-identical.
    op.create_table(
        "workspaces",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("canonical_path", sa.String(length=1024), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "canonical_path", name="uq_workspaces_user_path"),
    )
    with op.batch_alter_table("workspaces", schema=None) as batch_op:
        batch_op.create_index("ix_workspaces_user_id", ["user_id"], unique=False)


def _create_workspace_order() -> None:
    op.create_table(
        "workspace_order",
        sa.Column("workspace_id", sa.String(length=64), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("workspace_id"),
    )


def _create_workspace_sessions() -> None:
    op.create_table(
        "workspace_sessions",
        sa.Column("workspace_id", sa.String(length=64), nullable=False),
        sa.Column("thread_id", sa.String(length=64), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("workspace_id", "thread_id"),
    )
    with op.batch_alter_table("workspace_sessions", schema=None) as batch_op:
        batch_op.create_index(
            "ix_workspace_sessions_thread_id", ["thread_id"], unique=False
        )


def _create_workspace_meta() -> None:
    op.create_table(
        "workspace_meta",
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("value", sa.JSON(), nullable=True),
        sa.PrimaryKeyConstraint("user_id", "key"),
    )


_TABLE_CREATORS = (
    ("workspaces", _create_workspaces),
    ("workspace_order", _create_workspace_order),
    ("workspace_sessions", _create_workspace_sessions),
    ("workspace_meta", _create_workspace_meta),
)

_DROPPED_INDEXES = {
    # table -> index names created in upgrade (dropped child-first)
    "workspaces": ("ix_workspaces_user_id",),
    "workspace_sessions": ("ix_workspace_sessions_thread_id",),
}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    for table_name, creator in _TABLE_CREATORS:
        if inspector.has_table(table_name):
            # Idempotent: a DB whose full-metadata create_all already
            # provisioned the table must not have it re-created here.
            continue
        creator()

    from qilin.persistence.migrations._helpers import safe_add_column

    # Thread creation-time working directory, immutable once written.
    # NULL means "never assigned" → the thread renders under Ungrouped.
    safe_add_column(
        "threads_meta",
        sa.Column("cwd", sa.String(length=1024), nullable=True),
    )


def downgrade() -> None:
    from qilin.persistence.migrations._helpers import safe_drop_column

    safe_drop_column("threads_meta", "cwd")

    for table_name, _creator in reversed(_TABLE_CREATORS):
        for index_name in _DROPPED_INDEXES.get(table_name, ()):
            with op.batch_alter_table(table_name, schema=None) as batch_op:
                batch_op.drop_index(index_name)
        op.drop_table(table_name)
