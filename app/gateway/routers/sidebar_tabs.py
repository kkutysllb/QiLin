"""Per-thread sidebar tab state — stored under ``threads_meta.metadata_json.sidebar_tabs``.

The whole state is one document keyed by thread_id; PUT replaces it. This
mirrors DSH's session-local tab persistence without introducing a new
Alembic table.
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.gateway.authz import require_permission

router = APIRouter(
    prefix="/api/threads/{thread_id}/sidebar-tabs", tags=["sidebar-tabs"]
)


class TabSpec(BaseModel):
    key: str = Field(min_length=1, max_length=256)
    panel: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=1, max_length=256)
    icon: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    pinned: bool = False
    created_at: float


class SidebarTabsState(BaseModel):
    tabs: list[TabSpec]
    active: str | None = None
    split: Literal["single", "vertical", "horizontal"] = "single"


# Module-level seam — tests patch this, prod wires from app.state.
def get_thread_store(request: Request):
    return request.app.state.thread_store


async def _load(thread_store, thread_id: str) -> SidebarTabsState:
    meta = await thread_store.get(thread_id)
    if meta is None:
        raise HTTPException(
            404, {"code": "thread_not_found", "message": "thread not found"}
        )
    # ThreadMetaRepository.get returns a dict; stored JSON lives under "metadata".
    raw = (meta.get("metadata") or {}).get("sidebar_tabs")
    if not raw:
        return SidebarTabsState(tabs=[], active=None, split="single")
    return SidebarTabsState.model_validate(raw)


@router.get("", response_model=SidebarTabsState)
@require_permission("threads", "read")
async def get_tabs(
    thread_id: str,
    request: Request,
    thread_store=Depends(get_thread_store),
) -> SidebarTabsState:
    return await _load(thread_store, thread_id)


@router.put("", response_model=SidebarTabsState)
@require_permission("threads", "write")
async def put_tabs(
    thread_id: str,
    state: SidebarTabsState,
    request: Request,
    thread_store=Depends(get_thread_store),
) -> SidebarTabsState:
    meta = await thread_store.get(thread_id)
    if meta is None:
        raise HTTPException(
            404, {"code": "thread_not_found", "message": "thread not found"}
        )
    merged = dict(meta.get("metadata") or {})
    merged["sidebar_tabs"] = state.model_dump()
    await thread_store.update_metadata(thread_id, merged)
    return state
