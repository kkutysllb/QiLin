"""Goal-domain REST surface (DSH dsh-goal seven-verb alignment).

One goal per thread; every mutation is compare-and-set on the caller's
expected ``ref`` and appends a whole-snapshot change so SSE consumers can
fold last-wins without patch semantics. Activation (armed/disarmed) stays
process-local: create/resume arm, everything else disarms, and a gateway
restart disarms everything until a human resumes.

Error mapping keeps DSH's stable codes in ``detail.code``:
- 404 GOAL_NOT_FOUND (and thread-level owner denials)
- 409 GOAL_ALREADY_EXISTS / GOAL_STALE_REVISION / GOAL_INVALID_TRANSITION
- 400 GOAL_INVALID_OBJECTIVE / _MAX_ROUNDS / _BLOCK_REASON / _EDIT

``GET .../goals/stream`` is the SSE whole-snapshot broadcast channel.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.gateway import goal_activation
from app.gateway.authz import require_permission
from app.gateway.deps import get_current_user
from qilin.persistence.goal.sql import GoalError, GoalRepository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/threads/{thread_id}/goals", tags=["threads"])


class GoalRefModel(BaseModel):
    id: str = Field(min_length=1)
    revision: int


class GoalCreateRequest(BaseModel):
    objective: str = Field(min_length=1)
    max_goal_rounds: int | None = None


class GoalEditRequest(BaseModel):
    ref: GoalRefModel
    objective: str | None = None
    max_goal_rounds: int | None = None


class GoalBlockRequest(BaseModel):
    ref: GoalRefModel
    reason: dict[str, str]


class GoalRefRequest(BaseModel):
    ref: GoalRefModel


def _require_store(request: Request) -> GoalRepository:
    store = getattr(request.app.state, "goal_store", None)
    if store is None:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "GOAL_STORE_UNAVAILABLE",
                "message": "Goal domain requires SQL storage",
            },
        )
    return store


def _map_error(exc: GoalError) -> HTTPException:
    status_by_code = {
        "GOAL_NOT_FOUND": 404,
        "GOAL_ALREADY_EXISTS": 409,
        "GOAL_STALE_REVISION": 409,
        "GOAL_INVALID_TRANSITION": 409,
        "GOAL_AGENT_NOT_LIVE": 503,
    }
    other = [c for c in (
        "GOAL_INVALID_OBJECTIVE",
        "GOAL_INVALID_MAX_ROUNDS",
        "GOAL_INVALID_BLOCK_REASON",
        "GOAL_INVALID_EDIT",
    ) if c == exc.code]
    if not other and exc.code not in status_by_code:
        return HTTPException(status_code=400, detail={"code": exc.code, "message": str(exc)})
    return HTTPException(
        status_code=status_by_code.get(exc.code, 400),
        detail={"code": exc.code, "message": str(exc)},
    )


async def _user(request: Request) -> str:
    return await get_current_user(request)


def _view(
    projection: dict[str, Any] | None,
    user_id: str,
    thread_id: str,
) -> dict[str, Any]:
    """Projection → wire view with process-local activation attached."""
    if projection is None or projection.get("operation") == "clear":
        cleared = projection.get("cleared") if projection else None
        base_ref = (projection or {}).get("last_ref")
        return {
            "goal": None,
            "rounds_started": (projection or {}).get("rounds_started", 0),
            "created_at": None,
            "updated_at": (projection or {}).get("cleared_at"),
            "last_ref": base_ref,
            "cleared": cleared,
            "activation": goal_activation.get(user_id, thread_id),
        }
    goal = projection["goal"]
    return {
        "goal": goal,
        "rounds_started": projection.get("rounds_started", 0),
        "created_at": projection.get("created_at"),
        "updated_at": projection.get("updated_at"),
        "last_ref": projection.get("last_ref"),
        "cleared": None,
        "activation": goal_activation.get(user_id, thread_id),
    }


def _changed_payload(
    operation: str,
    projection: dict[str, Any],
    user_id: str,
    thread_id: str,
) -> dict[str, Any]:
    """Wire shape mirrors DSH ``GoalChanged``: whole post-change state under
    ``goal`` as a snake_case GoalView (durable snapshot + rounds_started +
    activation), or the clear tombstone under ``cleared``."""
    view = _view(projection, user_id, thread_id)
    ref = view.get("last_ref") or {}
    if operation == "clear":
        return {"operation": "clear", "ref": ref, "cleared": view.get("cleared")}
    snapshot = view.get("goal") or {}
    goal_view = {
        **snapshot,
        "rounds_started": view.get("rounds_started", 0),
        "created_at": view.get("created_at"),
        "updated_at": view.get("updated_at"),
        "activation": view.get("activation"),
    }
    return {"operation": operation, "ref": ref, "goal": goal_view}


def _publish_and_return(
    request: Request,
    operation: str,
    user_id: str,
    thread_id: str,
    status_snapshot: dict[str, Any] | None,
) -> dict[str, Any]:
    """Publish the post-change whole snapshot once the append has committed."""
    broker = getattr(request.app.state, "goal_broker", None)
    if broker is not None:
        broker.publish(
            user_id,
            thread_id,
            _changed_payload(operation, status_snapshot or {}, user_id, thread_id),
        )
    return _view(status_snapshot, user_id, thread_id)


@router.get("")
@require_permission("threads", "read", owner_check=True)
async def get_goal(thread_id: str, request: Request) -> dict[str, Any]:
    user_id = await _user(request)
    try:
        return _view(await _require_store(request).projection(thread_id), user_id, thread_id)
    except GoalError as exc:
        raise _map_error(exc) from exc


@router.post("")
@require_permission("threads", "write", owner_check=True, require_existing=True)
async def create_goal(body: GoalCreateRequest, thread_id: str, request: Request) -> dict[str, Any]:
    user_id = await _user(request)
    try:
        _ = await _require_store(request).create(
            thread_id, objective=body.objective, max_goal_rounds=body.max_goal_rounds, user_id=user_id
        )
    except GoalError as exc:
        raise _map_error(exc) from exc
    goal_activation.set_activation(user_id, thread_id, "armed")
    fresh = await _require_store(request).projection(thread_id)
    return _publish_and_return(request, "create", user_id, thread_id, fresh)


@router.patch("")
@require_permission("threads", "write", owner_check=True, require_existing=True)
async def edit_goal(body: GoalEditRequest, thread_id: str, request: Request) -> dict[str, Any]:
    user_id = await _user(request)
    try:
        _ = await _require_store(request).edit(
            thread_id,
            ref=body.ref.model_dump(),
            objective=body.objective,
            max_goal_rounds=body.max_goal_rounds,
            user_id=user_id,
        )
    except GoalError as exc:
        raise _map_error(exc) from exc
    fresh = await _require_store(request).projection(thread_id)
    return _publish_and_return(request, "edit", user_id, thread_id, fresh)


async def _simple_verb(
    request: Request,
    thread_id: str,
    body: GoalRefRequest | None,
    verb: str,
    *,
    reason: dict[str, str] | None = None,
) -> dict[str, Any]:
    user_id = await _user(request)
    store = _require_store(request)
    ref = body.ref.model_dump() if body is not None else {}
    kwargs: dict[str, Any] = {"ref": ref, "user_id": user_id}
    if reason is not None:
        kwargs["reason"] = reason
    try:
        await getattr(store, verb)(thread_id, **kwargs)
    except GoalError as exc:
        raise _map_error(exc) from exc
    goal_activation.set_activation(
        user_id, thread_id, "armed" if verb == "resume" else "disarmed"
    )
    fresh = await store.projection(thread_id)
    return _publish_and_return(request, verb, user_id, thread_id, fresh)


@router.post("/pause")
@require_permission("threads", "write", owner_check=True, require_existing=True)
async def pause_goal(body: GoalRefRequest, thread_id: str, request: Request) -> dict[str, Any]:
    return await _simple_verb(request, thread_id, body, "pause")


@router.post("/resume")
@require_permission("threads", "write", owner_check=True, require_existing=True)
async def resume_goal(body: GoalRefRequest, thread_id: str, request: Request) -> dict[str, Any]:
    return await _simple_verb(request, thread_id, body, "resume")


@router.post("/complete")
@require_permission("threads", "write", owner_check=True, require_existing=True)
async def complete_goal(body: GoalRefRequest, thread_id: str, request: Request) -> dict[str, Any]:
    return await _simple_verb(request, thread_id, body, "complete")


@router.post("/block")
@require_permission("threads", "write", owner_check=True, require_existing=True)
async def block_goal(body: GoalBlockRequest, thread_id: str, request: Request) -> dict[str, Any]:
    return await _simple_verb(request, thread_id, body, "block", reason=body.reason)


@router.delete("")
@require_permission("threads", "write", owner_check=True, require_existing=True)
async def clear_goal(body: GoalRefRequest, thread_id: str, request: Request) -> dict[str, Any]:
    return await _simple_verb(request, thread_id, body, "clear")


@router.get("/events")
@require_permission("threads", "read", owner_check=True)
async def list_goal_events(thread_id: str, request: Request, limit: int = 200) -> list[dict[str, Any]]:
    await _user(request)
    limit = max(1, min(limit, 1000))
    return await _require_store(request).history(thread_id, limit=limit)


@router.get("/stream")
@require_permission("threads", "read", owner_check=True)
async def stream_goal_changes(thread_id: str, request: Request) -> StreamingResponse:
    """SSE channel emitting ``goal/changed`` payloads after each commit."""
    user_id = await _user(request)
    broker = getattr(request.app.state, "goal_broker", None)
    if broker is None:
        raise HTTPException(status_code=503, detail="Goal event stream unavailable")

    async def gen():
        queue = await broker.subscribe(user_id, thread_id)
        try:
            yield ": connected\n\n"
            while True:
                if await request.is_disconnected():
                    break
                payload = await queue.get()
                yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
        finally:
            await broker.unsubscribe(user_id, thread_id, queue)

    return StreamingResponse(gen(), media_type="text/event-stream")
