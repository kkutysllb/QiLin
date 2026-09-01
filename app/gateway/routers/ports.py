"""H5 port API — external plugin hosts register agent-runtime contributions.

Auth: internal token (X-QiLin-Internal-Token), same trust stance as the
channel workers; plugin hosts are gateway-adjacent infrastructure.
"""
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.gateway.internal_auth import (
    is_valid_internal_auth_token,
    matches_internal_secret,
)
from qilin.ports.system_prompt import (
    list_sections,
    register_section,
    unregister_section,
)
from qilin.ports.tool_events import snapshot_after as tool_events_snapshot

router = APIRouter(prefix="/api/ports", tags=["ports"])


class SectionRequest(BaseModel):
    name: str
    order: int = 100
    text: str
    source: str = "plugin"


def _authorized(request: Request) -> bool:
    token = request.headers.get("X-QiLin-Internal-Token")
    # Plugin hosts hold the raw shared secret; minted tokens also accepted.
    return is_valid_internal_auth_token(token) or matches_internal_secret(token)


def _forbidden() -> JSONResponse:
    return JSONResponse(
        status_code=403,
        content={"detail": "internal token required"},
    )


@router.post("/system-prompt/sections")
async def register_section_endpoint(request: Request, req: SectionRequest) -> Any:
    if not _authorized(request):
        return _forbidden()
    section = register_section(req.name, req.order, req.text, req.source)
    return {"ok": True, "name": section.name, "order": section.order}


@router.get("/system-prompt/sections")
async def list_sections_endpoint(request: Request) -> Any:
    if not _authorized(request):
        return _forbidden()
    return {
        "sections": [
            {"name": s.name, "order": s.order, "text": s.text, "source": s.source}
            for s in list_sections()
        ]
    }


@router.delete("/system-prompt/sections/{name}")
async def unregister_section_endpoint(request: Request, name: str) -> Any:
    if not _authorized(request):
        return _forbidden()
    return {"ok": True, "removed": unregister_section(name)}


@router.get("/tools/events")
async def tool_events_endpoint(request: Request, cursor: int = 0) -> Any:
    """Events with seq > cursor (long-poll friendly ring read)."""
    if not _authorized(request):
        return _forbidden()
    events, head = tool_events_snapshot(cursor)
    return {"events": events, "cursor": head}
