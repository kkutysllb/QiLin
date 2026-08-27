"""Per-thread sandbox-mode REST surface (DSH ``sandbox/mode`` alignment).

Read = fold of the append-only event log (last event wins; threads without
events resolve to ``DEFAULT_SANDBOX_MODE``, preserving the current
single-host full-access behaviour). Write appends one knob event — no
update-in-place, mirroring how DSH permission presets "write through" to
the session log. Execution-side enforcement is a later slice.

Ownership mirrors thread_runs conventions: GET is owner-checked but
tolerates untracked legacy threads; POST requires an existing row owned by
the caller (anti-enumeration on the mutating path).
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.gateway.authz import require_permission
from app.gateway.deps import (
    get_current_user,
    get_sandbox_mode_store,
)
from qilin.persistence.sandbox_mode.sql import (
    DEFAULT_SANDBOX_MODE,
    SandboxModeError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/threads/{thread_id}/sandbox-mode", tags=["threads"])


class SandboxModeSetRequest(BaseModel):
    mode: str = Field(min_length=1, max_length=32)
    source: str = Field(default="user", min_length=1, max_length=32)


def _require_store(request: Request):
    store = get_sandbox_mode_store(request)
    if store is None:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "SANDBOX_MODE_STORE_UNAVAILABLE",
                "message": "Sandbox-mode events require SQL storage",
            },
        )
    return store


@router.get("")
@require_permission("threads", "read", owner_check=True)
async def get_sandbox_mode(thread_id: str, request: Request) -> dict[str, Any]:
    """The thread's folded sandbox mode. Absence of any event resolves to
    the default rather than erroring — resolution must be total."""
    store = _require_store(request)
    folded = await store.folded(thread_id)
    if folded is None:
        return {
            "thread_id": thread_id,
            "mode": DEFAULT_SANDBOX_MODE,
            "source": None,
            "updated_at": None,
            "defaulted": True,
        }
    return {
        "thread_id": thread_id,
        "mode": folded["mode"],
        "source": folded["source"],
        "updated_at": folded["created_at"],
        "defaulted": False,
    }


@router.get("/events")
@require_permission("threads", "read", owner_check=True)
async def list_sandbox_mode_events(
    thread_id: str, request: Request, limit: int = 200
) -> list[dict[str, Any]]:
    """Raw knob log in append order (oldest first)."""
    store = _require_store(request)
    limit = max(1, min(limit, 1000))
    return await store.history(thread_id, limit=limit)


@router.post("", status_code=200)
@require_permission("threads", "write", owner_check=True, require_existing=True)
async def set_sandbox_mode(
    body: SandboxModeSetRequest, thread_id: str, request: Request
) -> dict[str, Any]:
    """Append one sandbox/mode event; the response echoes the stored row."""
    user_id = await get_current_user(request)
    store = _require_store(request)
    try:
        event = await store.append(
            thread_id=thread_id,
            mode=body.mode,
            user_id=user_id,
            source=body.source,
        )
    except SandboxModeError as exc:
        raise HTTPException(
            status_code=400,
            detail={"code": exc.code, "message": str(exc)},
        ) from exc
    logger.info(
        "sandbox mode set thread=%s mode=%s source=%s",
        thread_id,
        body.mode,
        body.source,
    )
    return event
