"""Async checkpointer factory.

Provides an **async context manager** for long-running async servers that need
proper resource cleanup.

Supported backends: memory, sqlite, postgres.

Usage (e.g. FastAPI lifespan)::

    from qilin.runtime.checkpointer.async_provider import make_checkpointer

    async with make_checkpointer() as checkpointer:
        app.state.checkpointer = checkpointer  # InMemorySaver if not configured

For sync usage see :mod:`qilin.runtime.checkpointer.provider`.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator, Awaitable, Callable

from langgraph.types import Checkpointer

from qilin.config.app_config import AppConfig, get_app_config
from qilin.runtime._langgraph_backend import (
    import_backend_class,
    prepare_sqlite_conn_string,
)
from qilin.runtime.checkpointer.provider import (
    POSTGRES_CONN_REQUIRED,
    POSTGRES_INSTALL,
    SQLITE_INSTALL,
)
from qilin.runtime.store._sqlite_utils import ensure_sqlite_parent_dir

logger = logging.getLogger(__name__)


def _prepare_sqlite_checkpointer_path(raw: str) -> str:
    return prepare_sqlite_conn_string(raw)


def _prepare_database_sqlite_checkpointer_path(db_config) -> str:
    conn_str = db_config.checkpointer_sqlite_path
    ensure_sqlite_parent_dir(conn_str)
    return conn_str


def _build_postgres_pool(conn_string: str):
    """Build an AsyncConnectionPool with TCP keepalive and connection checking."""
    from psycopg.rows import dict_row
    from psycopg_pool import AsyncConnectionPool

    return AsyncConnectionPool(
        conn_string,
        kwargs={
            "autocommit": True,
            "prepare_threshold": 0,
            "row_factory": dict_row,
            "keepalives": 1,
            "keepalives_idle": 60,
            "keepalives_interval": 10,
            "keepalives_count": 6,
        },
        check=AsyncConnectionPool.check_connection,
    )


def _ensure_postgres_imports():
    """Import and return (AsyncPostgresSaver, AsyncConnectionPool), raising ImportError on failure."""
    try:
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
    except ImportError as exc:
        raise ImportError(POSTGRES_INSTALL) from exc

    try:
        from psycopg_pool import AsyncConnectionPool
    except ImportError as exc:
        raise ImportError(POSTGRES_INSTALL) from exc

    return AsyncPostgresSaver, AsyncConnectionPool


# ---------------------------------------------------------------------------
# Async factory
# ---------------------------------------------------------------------------


@contextlib.asynccontextmanager
async def _open_async_checkpointer(
    *,
    backend: str,
    sqlite_conn: Callable[[], Awaitable[str]],
    postgres_dsn: str | None,
    postgres_dsn_missing: str,
    unknown_backend_message: str,
) -> AsyncIterator[Checkpointer]:
    """Async checkpointer backend skeleton shared by the config and database adapters.

    ``sqlite_conn`` is the injected SQLite path-preparation step: the legacy
    ``checkpointer:`` config resolves ``connection_string`` through
    :func:`_prepare_sqlite_checkpointer_path`, while the unified
    ``database:`` config derives the path via
    :func:`_prepare_database_sqlite_checkpointer_path`.
    """
    if backend == "memory":
        from langgraph.checkpoint.memory import InMemorySaver

        yield InMemorySaver()
        return

    if backend == "sqlite":
        AsyncSqliteSaver = import_backend_class(
            "langgraph.checkpoint.sqlite.aio", "AsyncSqliteSaver", SQLITE_INSTALL
        )

        conn_str = await sqlite_conn()
        async with AsyncSqliteSaver.from_conn_string(conn_str) as saver:
            await saver.setup()
            yield saver
        return

    if backend == "postgres":
        if not postgres_dsn:
            raise ValueError(postgres_dsn_missing)

        AsyncPostgresSaver, _ = _ensure_postgres_imports()
        pool = _build_postgres_pool(postgres_dsn)
        async with pool:
            saver = AsyncPostgresSaver(conn=pool)
            await saver.setup()
            yield saver
        return

    raise ValueError(unknown_backend_message)


@contextlib.asynccontextmanager
async def _async_checkpointer(config) -> AsyncIterator[Checkpointer]:
    """Async context manager that constructs and tears down a checkpointer."""
    async with _open_async_checkpointer(
        backend=config.type,
        sqlite_conn=lambda: asyncio.to_thread(
            _prepare_sqlite_checkpointer_path, config.connection_string or "store.db"
        ),
        postgres_dsn=config.connection_string,
        postgres_dsn_missing=POSTGRES_CONN_REQUIRED,
        unknown_backend_message=f"Unknown checkpointer type: {config.type!r}",
    ) as saver:
        yield saver


@contextlib.asynccontextmanager
async def _async_checkpointer_from_database(db_config) -> AsyncIterator[Checkpointer]:
    """Async context manager that constructs a checkpointer from unified DatabaseConfig."""
    async with _open_async_checkpointer(
        backend=db_config.backend,
        sqlite_conn=lambda: asyncio.to_thread(
            _prepare_database_sqlite_checkpointer_path, db_config
        ),
        postgres_dsn=db_config.postgres_url,
        postgres_dsn_missing="database.postgres_url is required for the postgres backend",
        unknown_backend_message=f"Unknown database backend: {db_config.backend!r}",
    ) as saver:
        yield saver


@contextlib.asynccontextmanager
async def make_checkpointer(app_config: AppConfig | None = None) -> AsyncIterator[Checkpointer]:
    """Async context manager that yields a checkpointer for the caller's lifetime.
    Resources are opened on enter and closed on exit -- no global state::

        async with make_checkpointer(app_config) as checkpointer:
            app.state.checkpointer = checkpointer

    Yields an ``InMemorySaver`` when no checkpointer is configured in *config.yaml*.

    Priority:
    1. Legacy ``checkpointer:`` config section (backward compatible)
    2. Unified ``database:`` config section
    3. Default InMemorySaver
    """

    if app_config is None:
        app_config = get_app_config()

    # Legacy: standalone checkpointer config takes precedence
    if app_config.checkpointer is not None:
        async with _async_checkpointer(app_config.checkpointer) as saver:
            yield saver
            return

    # Unified database config
    db_config = getattr(app_config, "database", None)
    if db_config is not None and db_config.backend != "memory":
        async with _async_checkpointer_from_database(db_config) as saver:
            yield saver
            return

    # Default: in-memory
    from langgraph.checkpoint.memory import InMemorySaver

    yield InMemorySaver()
