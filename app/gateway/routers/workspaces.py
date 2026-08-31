"""Workspace registry REST router (DSH dsh-workspace alignment).

One router owning the registry verb surface: creation with realpath
canonicalization, durable-order listing, rename/reorder, thread attach &
manual reorder, the global archive set, and deletion. Also serves the
sidebar projection endpoint (``GET /api/workspaces/tree``) that groups a
caller's threads under workspaces/Ungrouped in one read.

Realpath canonicalization happens here — the repository layer trusts its
callers to hand over an already-canonical path, mirroring DSH where
``fs.realpath`` runs at the entity-creation boundary.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.gateway.authz import require_permission
from app.gateway.deps import get_current_user, get_workspace_store
from qilin.persistence.workspace.sql import WorkspaceError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])


class WorkspaceCreateRequest(BaseModel):
    path: str = Field(min_length=1, max_length=1024)
    title: str | None = Field(default=None, max_length=256)


class WorkspaceRenameRequest(BaseModel):
    title: str = Field(min_length=1, max_length=256)


class WorkspaceReorderRequest(BaseModel):
    """DOM-insertBefore semantics: omit ``before_id`` to move to the end."""

    before_id: str | None = None


class ThreadReorderRequest(BaseModel):
    before_thread_id: str | None = None


class ThreadAttachRequest(BaseModel):
    thread_id: str = Field(min_length=1)


class ArchiveRequest(BaseModel):
    thread_ids: list[str] = Field(min_length=1)


def _map_error(exc: WorkspaceError) -> HTTPException:
    status = 404 if exc.code in ("WORKSPACE_NOT_FOUND", "THREAD_NOT_ACCOUNTED") else 400
    return HTTPException(status_code=status, detail={"code": exc.code, "message": str(exc)})


def _require_store(request: Request):
    store = get_workspace_store(request)
    if store is None:
        raise HTTPException(
            status_code=503,
            detail={"code": "WORKSPACE_STORE_UNAVAILABLE",
                    "message": "Workspace registry requires SQL storage"},
        )
    return store


@router.get("")
@require_permission("threads", "read")
async def list_workspaces(request: Request) -> list[dict[str, Any]]:
    """The caller's workspaces in durable display order.

    The first call for a user also performs the one-shot M2 backfill:
    legacy threads with a real cwd are grouped into derived registry
    entries; NULL-cwd threads stay Ungrouped. Marker-guarded, so later
    lists skip straight through.
    """
    user_id = await get_current_user(request)
    store = _require_store(request)

    from app.gateway.workspace_backfill import ensure_user_backfilled

    thread_store = getattr(request.app.state, "thread_store", None)
    if thread_store is not None:
        try:
            await ensure_user_backfilled(
                threads_store=thread_store,
                workspace_store=store,
                user_id=str(user_id),
            )
        except Exception:
            logger.exception(
                "workspace backfill skipped for %s (listing continues)", user_id
            )

    return await store.list_for_user(user_id=user_id)


@router.post("", status_code=201)
@require_permission("threads", "write")
async def create_workspace(
    body: WorkspaceCreateRequest, request: Request
) -> dict[str, Any]:
    """Register one directory. The given path is realpath-canonicalized and
    must exist; re-registering the same canonical path returns the existing
    record unchanged."""
    user_id = await get_current_user(request)
    store = _require_store(request)
    try:
        # realpath canonicalization is intentionally sync: cheap stat + OSError contract below
        canonical = os.path.realpath(body.path)  # noqa: ASYNC240
    except OSError as exc:
        raise HTTPException(status_code=400, detail=f"invalid path: {exc}") from exc
    if not os.path.isdir(canonical):  # noqa: ASYNC240 -- same rationale
        raise HTTPException(status_code=400, detail="path is not an existing directory")
    return await store.create(
        user_id=user_id, canonical_path=canonical, title=body.title
    )


@router.put("/archive")
@require_permission("threads", "write")
async def archive_threads(body: ArchiveRequest, request: Request) -> dict[str, Any]:
    """Add thread ids to the caller's registry-global archive set. Non-
    destructive: session logs and accounting slots are retained so unarchive
    restores position."""
    user_id = await get_current_user(request)
    store = _require_store(request)
    for thread_id in body.thread_ids:
        await store.archive_thread(thread_id, user_id=user_id)
    return {"archived": len(body.thread_ids)}


@router.delete("/archive")
@require_permission("threads", "write")
async def unarchive_threads(body: ArchiveRequest, request: Request) -> dict[str, Any]:
    """Remove thread ids from the archive set, restoring their retained
    accounting slots."""
    user_id = await get_current_user(request)
    store = _require_store(request)
    for thread_id in body.thread_ids:
        await store.unarchive_thread(thread_id, user_id=user_id)
    return {"unarchived": len(body.thread_ids)}


@router.get("/tree")
@require_permission("threads", "read")
async def workspace_tree(request: Request) -> dict[str, Any]:
    """Sidebar projection: the caller's workspaces in durable order with
    accounted live thread ids (only *missing* headers pruned — path checks
    are deliberately absent: the registry is authoritative), plus Ungrouped
    (owned, visible, unclaimed by any group) and the archived set. Consumers
    merge these id lists with their own thread summaries."""
    user_id = await get_current_user(request)
    store = _require_store(request)

    from app.gateway.deps import get_thread_store

    thread_store = get_thread_store(request)
    # Row dicts carry every mapped column via to_dict(), cwd included.
    live_by_id: dict[str, dict[str, Any]] = {}
    offset = 0
    while True:
        page = await thread_store.search(user_id=user_id, limit=100, offset=offset) or []
        for t in page:
            live_by_id[t["thread_id"]] = {"cwd": t.get("cwd")}
        if len(page) < 100:
            break
        offset += 100

    archived = set(await store.archived_thread_ids(user_id=user_id))
    workspaces = await store.list_for_user(user_id=user_id)

    grouped: list[dict[str, Any]] = []
    accounted: set[str] = set()
    for ws in workspaces:
        members = [
            tid
            for tid in ws["session_ids"]
            if tid in live_by_id and tid not in archived
        ]
        accounted.update(members)
        grouped.append({
            "id": ws["id"],
            "path": ws["path"],
            "title": ws["title"],
            "created_at": ws["created_at"],
            "updated_at": ws["updated_at"],
            "position": ws.get("position"),
            "thread_ids": members,
        })

    # Everything owned and visible that no group claimed: cwd NULL (never
    # captured), explicitly detached, or attached-then-deleted registrations
    # — DSH's Ungrouped bucket.
    ungrouped = [
        tid
        for tid in live_by_id
        if tid not in accounted and tid not in archived
    ]

    return {
        "workspaces": grouped,
        "ungrouped_thread_ids": ungrouped,
        "archived_thread_ids": sorted(archived),
    }


@router.patch("/{workspace_id}")
@require_permission("threads", "write")
async def rename_workspace(
    workspace_id: str, body: WorkspaceRenameRequest, request: Request
) -> dict[str, Any]:
    user_id = await get_current_user(request)
    store = _require_store(request)
    try:
        return await store.set_title(workspace_id, body.title, user_id=user_id)
    except WorkspaceError as exc:
        raise _map_error(exc) from exc


@router.post("/{workspace_id}/reorder")
@require_permission("threads", "write")
async def reorder_workspace(
    workspace_id: str, body: WorkspaceReorderRequest, request: Request
) -> dict[str, Any]:
    """Move one workspace within the caller's durable order."""
    user_id = await get_current_user(request)
    store = _require_store(request)
    try:
        await store.insert_before(workspace_id, body.before_id, user_id=user_id)
    except WorkspaceError as exc:
        raise _map_error(exc) from exc
    return {"ok": True}


@router.delete("/{workspace_id}")
@require_permission("threads", "delete")
async def delete_workspace(workspace_id: str, request: Request) -> dict[str, Any]:
    """Registration-only delete: directories, files, and thread data are
    never touched — owned threads render under Ungrouped afterwards."""
    user_id = await get_current_user(request)
    store = _require_store(request)
    deleted = await store.delete(workspace_id, user_id=user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="workspace not found")
    return {"ok": True}


@router.get("/{workspace_id}/threads")
@require_permission("threads", "read")
async def list_workspace_threads(
    workspace_id: str, request: Request
) -> dict[str, Any]:
    """Accounted thread ids in manual order (candidate account)."""
    user_id = await get_current_user(request)
    store = _require_store(request)
    try:
        ids = await store.session_account(workspace_id, user_id=user_id)
    except WorkspaceError as exc:
        raise _map_error(exc) from exc
    return {"thread_ids": ids}


@router.post("/{workspace_id}/threads", status_code=201)
@require_permission("threads", "write")
async def attach_workspace_thread(
    workspace_id: str, body: ThreadAttachRequest, request: Request
) -> dict[str, Any]:
    """Explicitly group an existing thread under this workspace — the remedy
    for legacy NULL-cwd sessions (plan §6: 人工 GUI 归组). The registry is
    authoritative; the thread's stored cwd is never re-checked nor changed."""
    user_id = await get_current_user(request)
    store = _require_store(request)
    try:
        await store.attach_thread(workspace_id, body.thread_id, user_id=user_id)
    except WorkspaceError as exc:
        raise _map_error(exc) from exc
    return {"ok": True}


@router.delete("/{workspace_id}/threads/{thread_id}")
@require_permission("threads", "delete")
async def detach_workspace_thread(
    workspace_id: str, thread_id: str, request: Request
) -> dict[str, Any]:
    """Remove one thread from the account (idempotent); session data and its
    immutable cwd are untouched — it renders under Ungrouped again."""
    user_id = await get_current_user(request)
    store = _require_store(request)
    try:
        await store.detach_thread(workspace_id, thread_id, user_id=user_id)
    except WorkspaceError as exc:
        raise _map_error(exc) from exc
    return {"ok": True}


@router.post("/{workspace_id}/threads/{thread_id}/reorder")
@require_permission("threads", "write")
async def reorder_workspace_thread(
    workspace_id: str,
    thread_id: str,
    body: ThreadReorderRequest,
    request: Request,
) -> dict[str, Any]:
    """Manual account reorder for one accounted thread."""
    user_id = await get_current_user(request)
    store = _require_store(request)
    try:
        await store.move_thread_before(
            workspace_id, thread_id, body.before_thread_id, user_id=user_id
        )
    except WorkspaceError as exc:
        raise _map_error(exc) from exc
    return {"ok": True}





