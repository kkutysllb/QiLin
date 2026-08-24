"""Persistence status and disk usage router.

Provides the data backing the 「数据与持久化」 dashboard:
- GET /api/persistence/status  — per-backend persisted? + record counts
- GET /api/persistence/usage   — per-directory disk usage for the data table

Reads config via get_app_config() and queries the SQLAlchemy session factory
for table counts. Directory sizes come from recursive file stat.

Note on paths: QiLin stores user-isolated thread workspaces under
``{base_dir}/users/{user_id}/...``, so the dashboard reports the ``users/``
subdirectory as the sandbox-data root rather than a non-existent flat
``threads/`` directory.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel
from sqlalchemy import text

from app.gateway.deps import require_admin_user
from qilin.config.app_config import get_app_config
from qilin.config.paths import Paths
from qilin.persistence.engine import get_session_factory

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/persistence", tags=["persistence"])

_ADMIN_REQUIRED_DETAIL = "Admin privileges required to view persistence status."


def compute_directory_usage(path: Path) -> int:
    """Recursively sum file sizes under path. Returns 0 for missing dirs."""
    if not path.exists():
        return 0
    total = 0
    for entry in path.rglob("*"):
        if entry.is_file():
            try:
                total += entry.stat().st_size
            except OSError:
                pass
    return total


def format_size_bytes(size: int) -> str:
    """Format bytes as human-readable string (B / KB / MB / GB)."""
    if size < 1024:
        return f"{size} B"
    if size < 1024 * 1024:
        return f"{size / 1024:.1f} KB"
    if size < 1024 * 1024 * 1024:
        return f"{size / (1024 * 1024):.1f} MB"
    return f"{size / (1024 * 1024 * 1024):.1f} GB"


def _get_paths() -> Paths:
    return Paths()


class DatabaseStatus(BaseModel):
    backend: str
    persisted: bool
    sqlite_dir: str | None = None
    thread_count: int = 0
    checkpoint_count: int = 0
    run_count: int = 0
    db_size_bytes: int = 0


class RunEventsStatus(BaseModel):
    backend: str
    persisted: bool
    event_count: int = 0
    hint: str | None = None


class MemoryStatus(BaseModel):
    enabled: bool
    persisted: bool
    memory_file: str | None = None
    file_size_bytes: int = 0


class SandboxDataStatus(BaseModel):
    threads_root: str
    total_size_bytes: int = 0
    thread_dir_count: int = 0


class PersistenceStatusResponse(BaseModel):
    database: DatabaseStatus
    run_events: RunEventsStatus
    memory: MemoryStatus
    sandbox_data: SandboxDataStatus


class DirectoryUsage(BaseModel):
    path: str
    label: str
    size_bytes: int


class PersistenceUsageResponse(BaseModel):
    directories: list[DirectoryUsage]
    total_size_bytes: int


async def _build_database_status(config: Any, paths: Paths) -> DatabaseStatus:
    backend = config.database.backend
    sqlite_dir = str(getattr(config.database, "sqlite_dir", "")) or None
    thread_count = checkpoint_count = run_count = 0
    db_size = 0
    session_factory = get_session_factory()
    if session_factory is not None and backend != "memory":
        try:
            async with session_factory() as session:
                thread_count = (
                    await session.execute(text("SELECT COUNT(*) FROM threads_meta"))
                ).scalar() or 0
                checkpoint_count = (
                    await session.execute(text("SELECT COUNT(*) FROM checkpoints"))
                ).scalar() or 0
                run_count = (
                    await session.execute(text("SELECT COUNT(*) FROM runs"))
                ).scalar() or 0
        except Exception:
            logger.debug("Could not count database rows", exc_info=True)
    if backend == "sqlite" and sqlite_dir:
        db_path = Path(sqlite_dir) / "qilin.db"
        if db_path.exists():
            db_size = db_path.stat().st_size
    return DatabaseStatus(
        backend=backend,
        persisted=backend != "memory",
        sqlite_dir=sqlite_dir,
        thread_count=thread_count,
        checkpoint_count=checkpoint_count,
        run_count=run_count,
        db_size_bytes=db_size,
    )


async def _build_run_events_status(config: Any) -> RunEventsStatus:
    backend = config.run_events.backend
    event_count = 0
    session_factory = get_session_factory()
    if session_factory is not None and backend == "db":
        try:
            async with session_factory() as session:
                event_count = (
                    await session.execute(text("SELECT COUNT(*) FROM run_events"))
                ).scalar() or 0
        except Exception:
            logger.debug("Could not count run_events rows", exc_info=True)
    hint = None
    if backend == "memory":
        hint = "运行事件未持久化，重启后历史 trace 丢失。建议改为 db 或 jsonl。"
    return RunEventsStatus(
        backend=backend,
        persisted=backend != "memory",
        event_count=event_count,
        hint=hint,
    )


def _build_memory_status(config: Any, paths: Paths) -> MemoryStatus:
    enabled = getattr(config.memory, "enabled", False)
    memory_file = paths.memory_file
    file_size = memory_file.stat().st_size if memory_file.exists() else 0
    return MemoryStatus(
        enabled=enabled,
        persisted=bool(enabled) and memory_file.exists(),
        memory_file=str(memory_file),
        file_size_bytes=file_size,
    )


def _build_sandbox_status(paths: Paths) -> SandboxDataStatus:
    users_dir = paths.base_dir / "users"
    thread_dir_count = 0
    if users_dir.exists():
        thread_dir_count = sum(1 for e in users_dir.rglob("*") if e.is_dir())
    return SandboxDataStatus(
        threads_root=str(users_dir),
        total_size_bytes=compute_directory_usage(users_dir),
        thread_dir_count=thread_dir_count,
    )


@router.get("/status", response_model=PersistenceStatusResponse)
async def get_persistence_status(request: Request) -> PersistenceStatusResponse:
    """Return persisted? status for database, run_events, memory, sandbox data."""
    await require_admin_user(request, detail=_ADMIN_REQUIRED_DETAIL)
    config = get_app_config()
    paths = _get_paths()
    database = await _build_database_status(config, paths)
    run_events = await _build_run_events_status(config)
    memory = _build_memory_status(config, paths)
    sandbox_data = _build_sandbox_status(paths)
    return PersistenceStatusResponse(
        database=database,
        run_events=run_events,
        memory=memory,
        sandbox_data=sandbox_data,
    )


@router.get("/usage", response_model=PersistenceUsageResponse)
async def get_persistence_usage(request: Request) -> PersistenceUsageResponse:
    """Return per-directory disk usage for the data management table."""
    await require_admin_user(request, detail=_ADMIN_REQUIRED_DETAIL)
    paths = _get_paths()
    home = paths.base_dir
    entries = [
        (home / "data", "SQLite 数据库 + checkpoint"),
        (home / "users", "用户工作区（线程上传/输出文件）"),
        (home / "agents", "自定义 Agent 配置 + 记忆"),
        (home / ".retrieval", "记忆 FTS5 全文索引"),
        (home / "skills", "技能包（builtin + custom）"),
        (home / "logs", "gateway / main / renderer 日志"),
    ]
    directories = [
        DirectoryUsage(path=str(p), label=label, size_bytes=compute_directory_usage(p))
        for p, label in entries
    ]
    total = sum(d.size_bytes for d in directories)
    return PersistenceUsageResponse(directories=directories, total_size_bytes=total)
