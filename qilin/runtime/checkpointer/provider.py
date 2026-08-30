"""Sync checkpointer factory.

Provides a **sync singleton** and a **sync context manager** for LangGraph
graph compilation and CLI tools.

Supported backends: memory, sqlite, postgres.

Usage::

    from qilin.runtime.checkpointer.provider import get_checkpointer, checkpointer_context

    # Singleton — reused across calls, closed on process exit
    cp = get_checkpointer()

    # One-shot — fresh connection, closed on block exit
    with checkpointer_context() as cp:
        graph.invoke(input, config={"configurable": {"thread_id": "1"}})
"""

from __future__ import annotations

import contextlib
import logging
import threading
from collections.abc import Iterator

from langgraph.types import Checkpointer

from qilin.config.app_config import AppConfig, get_app_config
from qilin.config.checkpointer_config import (
    CheckpointerConfig,
    ensure_config_loaded,
    get_checkpointer_config,
)
from qilin.runtime._langgraph_backend import (
    SyncBackendSpec,
    open_sync_langgraph_backend,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Error message constants — imported by aio.provider too
# ---------------------------------------------------------------------------

SQLITE_INSTALL = "langgraph-checkpoint-sqlite is required for the SQLite checkpointer. Install it with: uv add langgraph-checkpoint-sqlite"
POSTGRES_INSTALL = (
    "langgraph-checkpoint-postgres is required for the PostgreSQL checkpointer. Install the package extra with: pip install 'qilin[postgres]' (or use: uv sync --all-packages --extra postgres when developing locally)"
)
POSTGRES_CONN_REQUIRED = "checkpointer.connection_string is required for the postgres backend"


_SYNC_CHECKPOINTER_SPEC = SyncBackendSpec(
    label="Checkpointer",
    logger=logger,
    memory_module="langgraph.checkpoint.memory",
    memory_class="InMemorySaver",
    sqlite_module="langgraph.checkpoint.sqlite",
    sqlite_class="SqliteSaver",
    sqlite_install_hint=SQLITE_INSTALL,
    postgres_module="langgraph.checkpoint.postgres",
    postgres_class="PostgresSaver",
    postgres_install_hint=POSTGRES_INSTALL,
    conn_required_message=POSTGRES_CONN_REQUIRED,
    unknown_backend_message="Unknown checkpointer type: {backend!r}",
)


# ---------------------------------------------------------------------------
# Config resolution
# ---------------------------------------------------------------------------


def _resolve_checkpointer_config(app_config: AppConfig) -> CheckpointerConfig:
    """Resolve the checkpointer backend from legacy or unified application config.

    The legacy ``checkpointer`` section remains authoritative when present so
    Checkpointer and Store keep using the same backend. Otherwise the unified
    ``database`` section drives the checkpointer, matching the async
    :func:`~qilin.runtime.checkpointer.async_provider.make_checkpointer`
    factory and the sync Store provider's ``_resolve_store_config``.
    """
    if app_config.checkpointer is not None:
        return app_config.checkpointer

    database = app_config.database
    if database is None or database.backend == "memory":
        return CheckpointerConfig(type="memory")
    if database.backend == "sqlite":
        return CheckpointerConfig(type="sqlite", connection_string=database.checkpointer_sqlite_path)
    if database.backend == "postgres":
        if not database.postgres_url:
            raise ValueError("database.postgres_url is required for the postgres backend")
        return CheckpointerConfig(type="postgres", connection_string=database.postgres_url)
    raise ValueError(f"Unknown database backend: {database.backend!r}")


def _get_checkpointer_config() -> CheckpointerConfig:
    """Load checkpointer config without holding the provider singleton lock."""
    ensure_config_loaded()

    # Preserve callers that initialise the legacy config singleton directly.
    legacy_config = get_checkpointer_config()
    if legacy_config is not None:
        return legacy_config
    try:
        app_config = get_app_config()
    except FileNotFoundError:
        return CheckpointerConfig(type="memory")
    return _resolve_checkpointer_config(app_config)


# ---------------------------------------------------------------------------
# Sync factory
# ---------------------------------------------------------------------------


def _sync_checkpointer_cm(config: CheckpointerConfig):
    """Context manager that creates and tears down a sync checkpointer.

    Returns a configured ``Checkpointer`` instance. Resource cleanup for any
    underlying connections or pools is handled by higher-level helpers in
    this module (such as the singleton factory or context manager); this
    function does not return a separate cleanup callback.

    The backend skeleton itself lives in the shared
    :func:`qilin.runtime._langgraph_backend.open_sync_langgraph_backend`.
    """
    return open_sync_langgraph_backend(
        _SYNC_CHECKPOINTER_SPEC, config.type, config.connection_string
    )


# ---------------------------------------------------------------------------
# Sync singleton
# ---------------------------------------------------------------------------

_checkpointer: Checkpointer | None = None
_checkpointer_ctx = None  # open context manager keeping the connection alive
_checkpointer_lock = threading.Lock()


def get_checkpointer() -> Checkpointer:
    """Return the global sync checkpointer singleton, creating it on first call.

    The legacy ``checkpointer`` section takes precedence when configured;
    otherwise the unified ``database`` section selects the backend. Returns an
    ``InMemorySaver`` when neither selects a persistent backend.

    Raises:
        ImportError: If the required package for the configured backend is not installed.
        ValueError: If ``connection_string`` is missing for a backend that requires it.
    """
    global _checkpointer, _checkpointer_ctx

    if _checkpointer is not None:
        return _checkpointer

    # Config loading can reset both persistence singletons. Resolve the full
    # config outside this provider lock to avoid cross-provider lock-order inversion.
    config = _get_checkpointer_config()

    with _checkpointer_lock:
        if _checkpointer is not None:
            return _checkpointer

        checkpointer_ctx = _sync_checkpointer_cm(config)
        checkpointer = checkpointer_ctx.__enter__()
        _checkpointer_ctx = checkpointer_ctx
        _checkpointer = checkpointer

    return _checkpointer


def reset_checkpointer() -> None:
    """Reset the sync singleton, forcing recreation on the next call.

    Closes any open backend connections and clears the cached instance.
    Useful in tests or after a configuration change.
    """
    global _checkpointer, _checkpointer_ctx
    with _checkpointer_lock:
        if _checkpointer_ctx is not None:
            try:
                _checkpointer_ctx.__exit__(None, None, None)
            except Exception:
                logger.warning("Error during checkpointer cleanup", exc_info=True)
            _checkpointer_ctx = None
        _checkpointer = None


# ---------------------------------------------------------------------------
# Sync context manager
# ---------------------------------------------------------------------------


@contextlib.contextmanager
def checkpointer_context() -> Iterator[Checkpointer]:
    """Sync context manager that yields a checkpointer and cleans up on exit.

    Unlike :func:`get_checkpointer`, this does **not** cache the instance —
    each ``with`` block creates and destroys its own connection.  Use it in
    CLI scripts or tests where you want deterministic cleanup::

        with checkpointer_context() as cp:
            graph.invoke(input, config={"configurable": {"thread_id": "1"}})

    The legacy ``checkpointer`` section takes precedence when configured;
    otherwise the unified ``database`` section selects the backend. Yields an
    ``InMemorySaver`` when neither selects a persistent backend.
    """

    config = _resolve_checkpointer_config(get_app_config())
    with _sync_checkpointer_cm(config) as saver:
        yield saver
