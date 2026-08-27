"""First-run workspace backfill (plan §4 M2).

Existing conversations predate the registry: their real ``cwd`` lives on
the thread row while ``workspace_*`` tables are empty. The first time a
user's UI asks for its workspace tree we derive the initial grouping from
those cwd values — one registry entry per distinct path, its owning
threads attached — never inventing a workspace for NULL cwds (they render
under Ungrouped untouched). A per-user ``initialized`` marker short-circuits
every later call, so the migration is exactly-once and additive: nothing
about the conversation data itself moves.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


async def ensure_user_backfilled(
    *,
    threads_store: Any,
    workspace_store: Any,
    user_id: str,
) -> int:
    """Register legacy cwd-grouped workspaces once; return linked-thread count.

    Idempotent by the per-user marker and by workspace-create dedupe;
    failures leave the marker unset so the next attempt retries.
    """
    if user_id in (None, "", "null"):
        return 0
    if await workspace_store.is_initialized(user_id=user_id):
        return 0

    linked = 0
    seen_cwd_to_workspace: dict[str, str] = {}
    try:
        rows = await threads_store.search(limit=1000, user_id=user_id)
        for row in rows:
            cwd = row.get("cwd") or (row.get("metadata") or {}).get("cwd")
            thread_id = row.get("thread_id")
            if not cwd or not thread_id:
                continue
            ws_id = seen_cwd_to_workspace.get(cwd)
            if ws_id is None:
                created = await workspace_store.create(
                    user_id=user_id, canonical_path=cwd
                )
                ws_id = created["id"]
                seen_cwd_to_workspace[cwd] = ws_id
            await workspace_store.attach_thread(
                ws_id, thread_id, user_id=user_id, thread_cwd=cwd
            )
            linked += 1
    except Exception:
        logger.exception("workspace backfill failed for %s", user_id)
        raise

    await workspace_store.mark_initialized(user_id=user_id)
    return linked
