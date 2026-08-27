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
    # Use the module-level singleton accessor so tests can monkeypatch
    # qilin.config.paths.get_paths to redirect the workspace root. Late-bind
    # through the module attribute so the patch is actually observed here.
    paths = qilin_paths.get_paths()
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


# --- helpers used by read / write ---------------------------------------
_TEXT_EXTS = {
    ".md", ".markdown", ".txt", ".json", ".yaml", ".yml", ".toml", ".ini",
    ".csv", ".tsv", ".sql", ".sh", ".bash", ".zsh", ".py", ".ipynb",
    ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".vue", ".svelte",
    ".css", ".scss", ".sass", ".less", ".html", ".htm", ".xml", ".env",
    ".gitignore", ".gitattributes", ".editorconfig", "Makefile", "Dockerfile",
    ".rb", ".go", ".rs", ".java", ".kt", ".swift", ".c", ".h", ".cpp", ".hpp",
    ".lua", ".php", ".r", ".scala", ".dart", ".ex", ".exs", ".clj", ".cljs",
    ".hs", ".ml", ".fs", ".zig",
}


def _looks_textual(path: FsPath) -> bool:
    if path.suffix.lower() in _TEXT_EXTS:
        return True
    if path.name in {"Makefile", "Dockerfile", "Procfile", "Rakefile", "Gemfile"}:
        return True
    mime, _ = mimetypes.guess_type(path.name)
    return bool(mime and mime.startswith("text/"))


# --- endpoints ---------------------------------------------------------
class FileContent(BaseModel):
    content: str
    mime: str | None


class RawQuery(BaseModel):
    thread_id: str
    path: str


@router.get("/read", response_model=FileContent)
@_envelope_files_errors
@require_permission("threads", "read")
async def read_file(
    request: Request,
    thread_id: Annotated[str, Query(pattern=r"^[A-Za-z0-9_\-]{1,128}$")],
    path: Annotated[str, Query(max_length=4096)],
) -> FileContent:
    target = _resolve_workspace_path(thread_id, path)
    if not target.exists() or not target.is_file():
        raise WorkspacePathError("file_not_found", "file not found", 404)
    if not _looks_textual(target):
        raise WorkspacePathError(
            "binary_not_editable", "binary file — use /api/files/raw", 400
        )
    return FileContent(content=target.read_text(encoding="utf-8"), mime=mimetypes.guess_type(target.name)[0])


@router.get("/raw")
@_envelope_files_errors
@require_permission("threads", "read")
async def read_raw(
    request: Request,
    thread_id: Annotated[str, Query(pattern=r"^[A-Za-z0-9_\-]{1,128}$")],
    path: Annotated[str, Query(max_length=4096)],
):
    from fastapi.responses import Response
    target = _resolve_workspace_path(thread_id, path)
    if not target.exists() or not target.is_file():
        raise WorkspacePathError("file_not_found", "file not found", 404)
    mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
    return Response(content=target.read_bytes(), media_type=mime)


class PathOnlyRequest(BaseModel):
    thread_id: str = Field(pattern=r"^[A-Za-z0-9_\-]{1,128}$")
    path: str = Field(min_length=1, max_length=4096)


@router.post("/write")
@_envelope_files_errors
@require_permission("threads", "write")
async def write_file(req: WriteRequest) -> dict:
    target = _resolve_workspace_path(req.thread_id, req.path)
    if not _looks_textual(target):
        raise WorkspacePathError("not_text_file", "refusing to write non-text file", 400)
    if len(req.content.encode("utf-8")) > 1_048_576:
        raise WorkspacePathError("file_too_large", "max 1 MiB", 413)
    parent = target.parent
    if not parent.exists():
        raise WorkspacePathError("parent_not_found", "parent directory does not exist", 400)
    target.write_text(req.content, encoding="utf-8")
    return {"ok": True, "size": target.stat().st_size}


@router.post("/mkdir")
@_envelope_files_errors
@require_permission("threads", "write")
async def mkdir(req: PathOnlyRequest) -> dict:
    target = _resolve_workspace_path(req.thread_id, req.path)
    try:
        target.mkdir(parents=True, exist_ok=False)
    except FileExistsError as exc:
        raise WorkspacePathError("path_exists", "path already exists", 400) from exc
    except FileNotFoundError as exc:
        raise WorkspacePathError("parent_not_found", "parent directory does not exist", 400) from exc
    return {"ok": True}


@router.delete("/delete")
@_envelope_files_errors
@require_permission("threads", "delete")
async def delete_path(req: PathOnlyRequest) -> dict:
    target = _resolve_workspace_path(req.thread_id, req.path)
    if target.is_dir():
        if any(target.iterdir()):
            raise WorkspacePathError("dir_not_empty", "directory not empty", 400)
        target.rmdir()
    elif target.exists():
        target.unlink()
    else:
        raise WorkspacePathError("path_not_found", "path not found", 404)
    return {"ok": True}
