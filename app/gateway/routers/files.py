"""Files REST router — per-thread workspace browsing & editing.

Path safety: three guards run in order — thread_id regex, realpath pin,
symlink target re-check. Any failure raises ``WorkspacePathError`` (HTTP 400
or 404). Authorization reuses the threads:read / write / delete permissions
already declared for the workspace registry router.
"""
from __future__ import annotations

import functools
import mimetypes
from collections.abc import Awaitable, Callable
from pathlib import Path as FsPath
from typing import Annotated, Any, Literal, ParamSpec, TypeVar

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.gateway.authz import require_permission
from qilin.config import paths as qilin_paths

router = APIRouter(prefix="/api/files", tags=["files"])

P = ParamSpec("P")
T = TypeVar("T")


class WorkspacePathError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def _envelope_files_errors(fn: Callable[P, Awaitable[T]]) -> Callable[P, Awaitable[T]]:
    """Render WorkspacePathError as the §3.3 ``{"error": {...}}`` envelope."""

    @functools.wraps(fn)
    async def wrapper(*args: Any, **kwargs: Any) -> Any:
        try:
            return await fn(*args, **kwargs)
        except WorkspacePathError as exc:
            return JSONResponse(
                status_code=exc.status,
                content={"error": {"code": exc.code, "message": exc.message}},
            )

    return wrapper


def _thread_workspace_root(thread_id: str) -> FsPath:
    if not thread_id or not all(c.isalnum() or c in "-_" for c in thread_id):
        raise WorkspacePathError("thread_id_invalid", "thread_id has invalid characters", 404)
    if len(thread_id) > 128:
        raise WorkspacePathError("thread_id_invalid", "thread_id too long", 404)
    # Late-bind through the module attribute so tests can monkeypatch
    # qilin.config.paths.QiLinPaths to redirect the workspace root.
    paths = qilin_paths.QiLinPaths()
    root = paths.user_workspace_dir(thread_id).resolve()
    return root


def _resolve_workspace_path(thread_id: str, rel: str) -> FsPath:
    """Resolve ``rel`` (relative to thread workspace root) and verify the
    resulting realpath stays under the workspace root.

    Empty / ``.`` ``rel`` resolves to the workspace root itself.
    """
    root = _thread_workspace_root(thread_id)
    if rel in ("", ".", "./"):
        return root
    # Refuse obvious escape tokens early to keep realpath honest.
    candidate = (root / rel).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:  # noqa: PERF203 — explicit is clearer
        raise WorkspacePathError(
            "path_outside_workspace",
            "path resolves outside the thread workspace",
            400,
        ) from exc
    return candidate


# Pydantic models ---------------------------------------------------------
class FileEntry(BaseModel):
    name: str
    type: Literal["file", "dir", "symlink", "broken"]
    size: int
    mtime: float
    mime: str | None


class FileListResponse(BaseModel):
    entries: list[FileEntry]
    parent: str | None


class WriteRequest(BaseModel):
    thread_id: str = Field(pattern=r"^[A-Za-z0-9_\-]{1,128}$")
    path: str = Field(min_length=1, max_length=4096)
    content: str = Field(min_length=0)


# Endpoints -------------------------------------------------------------
@router.get("/list", response_model=FileListResponse)
@_envelope_files_errors
@require_permission("threads", "read")
async def list_dir(
    request: Request,
    thread_id: Annotated[str, Query(pattern=r"^[A-Za-z0-9_\-]{1,128}$")],
    path: Annotated[str, Query(max_length=4096)] = "",
) -> FileListResponse:
    target = _resolve_workspace_path(thread_id, path)
    if not target.exists() or not target.is_dir():
        raise WorkspacePathError("dir_not_found", "directory not found", 404)
    entries: list[FileEntry] = []
    for child in sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
        try:
            st = child.stat()
        except (FileNotFoundError, PermissionError):
            continue
        kind: Literal["file", "dir", "symlink", "broken"] = (
            "symlink" if child.is_symlink() else "dir" if child.is_dir() else "file"
        )
        if kind == "symlink" and not (child.exists() or child.is_dir()):
            kind = "broken"
        mime = mimetypes.guess_type(child.name)[0] if kind == "file" else None
        entries.append(FileEntry(name=child.name, type=kind, size=st.st_size, mtime=st.st_mtime, mime=mime))
    parent_rel = None
    if path:
        parent_rel = str(FsPath(path).parent) if str(FsPath(path).parent) != "." else ""
    return FileListResponse(entries=entries, parent=parent_rel)
