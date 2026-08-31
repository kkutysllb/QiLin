"""Gateway router for the surface port: programmatic sidebar_open.

POST /api/threads/{thread_id}/surfaces  {target, title?} -> SurfaceOpenResult

The LangChain sidebar_open tool stays the model-facing path; this REST
counterpart drives the SAME shared resolution policy
(qilin.ports.surface.open_surface) so UI adapters and tests can open
surfaces without going through an agent run. Ownership scope is the
thread_id from the path, never a client payload.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.gateway.authz import require_permission
from app.gateway.routers.ports_terminal import _http_status
from qilin.ports.errors import PortError
from qilin.ports.protocol.surface import SurfaceOpenResult
from qilin.ports.surface import (
    SurfaceRegistry,
    get_default_surface_registry,
    open_surface,
)

router = APIRouter(prefix="/api/threads/{thread_id}/surfaces", tags=["ports-surface"])


class SurfaceOpenBody(BaseModel):
    target: str = Field(min_length=1, max_length=4096)
    title: str = Field(default="", max_length=256)


# Module-level seam - tests override app.state.surface_registry; prod falls
# back to the process-wide singleton shared with the LangChain tools.
def get_surface_registry(request: Request) -> SurfaceRegistry:
    registry = getattr(request.app.state, "surface_registry", None)
    if registry is None:
        return get_default_surface_registry()
    return registry


@router.post("", response_model=SurfaceOpenResult)
@require_permission("threads", "write")
async def open_surface_route(
    thread_id: str,
    body: SurfaceOpenBody,
    registry: SurfaceRegistry = Depends(get_surface_registry),
) -> SurfaceOpenResult:
    try:
        return await open_surface(thread_id, body.target, body.title, registry=registry)
    except PortError as exc:
        raise HTTPException(_http_status(exc), exc.message) from exc
