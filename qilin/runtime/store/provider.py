"""Sync Store factory.

Provides a **sync singleton** and a **sync context manager** for CLI tools
and the embedded :class:`~qilin.client.QiLinClient`.

The deprecated ``checkpointer`` section takes precedence when present;
otherwise Store follows the unified ``database`` section. Supported backends:
memory, sqlite, postgres.

Usage::

    from qilin.runtime.store.provider import get_store, store_context

    # Singleton — reused across calls, closed on process exit
    store = get_store()

    # One-shot — fresh connection, closed on block exit
    with store_context() as store:
        store.put(("ns",), "key", {"value": 1})
"""

from __future__ import annotations

import contextlib
import logging
import threading
from collections.abc import Iterator

from langgraph.store.base import BaseStore

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
# Error message constants
# ---------------------------------------------------------------------------

SQLITE_STORE_INSTALL = "langgraph-checkpoint-sqlite is required for the SQLite store. Install it with: uv add langgraph-checkpoint-sqlite"
POSTGRES_STORE_INSTALL = (
    "langgraph-checkpoint-postgres is required for the PostgreSQL store. Install the package extra with: pip install 'qilin[postgres]' (or use: uv sync --all-packages --extra postgres when developing locally)"
)
POSTGRES_CONN_REQUIRED = "checkpointer.connection_string is required for the postgres backend"


_SYNC_STORE_SPEC = SyncBackendSpec(
    label="Store",
    logger=logger,
    memory_module="langgraph.store.memory",
    memory_class="InMemoryStore",
    sqlite_module="langgraph.store.sqlite",
    sqlite_class="SqliteStore",
    sqlite_install_hint=SQLITE_STORE_INSTALL,
    postgres_module="langgraph.store.postgres",
    postgres_class="PostgresStore",
    postgres_install_hint=POSTGRES_STORE_INSTALL,
    conn_required_message=POSTGRES_CONN_REQUIRED,
    unknown_backend_message="Unknown store backend type: {backend!r}",
)


def _resolve_store_config(app_config: AppConfig) -> CheckpointerConfig:
    """Resolve the Store backend from legacy or unified application config.

    The legacy ``checkpointer`` section remains authoritative when present so
    Store and Checkpointer continue to use the same backend. Otherwise the
    unified ``database`` section drives the Store as documented.
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


def _get_store_config() -> CheckpointerConfig:
    """Load Store config without holding the provider singleton lock."""
    ensure_config_loaded()

    # Preserve callers that initialise the legacy config singleton directly.
    legacy_config = get_checkpointer_config()
    if legacy_config is not None:
        return legacy_config
    try:
        app_config = get_app_config()
    except FileNotFoundError:
        return CheckpointerConfig(type="memory")
    return _resolve_store_config(app_config)


# ---------------------------------------------------------------------------
# Sync factory
# ---------------------------------------------------------------------------


def _sync_store_cm(config):
    """Context manager that creates and tears down a sync Store.

    The ``config`` argument is a
    :class:`~qilin.config.checkpointer_config.CheckpointerConfig` instance —
    the same object used by the checkpointer factory.

    The backend skeleton itself lives in the shared
    :func:`qilin.runtime._langgraph_backend.open_sync_langgraph_backend`.
    """
    return open_sync_langgraph_backend(
        _SYNC_STORE_SPEC, config.type, config.connection_string
    )


# ---------------------------------------------------------------------------
# Sync singleton
# ---------------------------------------------------------------------------

_store: BaseStore | None = None
_store_ctx = None  # open context manager keeping the connection alive
_store_lock = threading.Lock()


def get_store() -> BaseStore:
    """Return the global sync Store singleton, creating it on first call.

    The legacy ``checkpointer`` section takes precedence when configured;
    otherwise the unified ``database`` section selects the backend.

    Raises:
        ImportError: If the required package for the configured backend is not installed.
        ValueError: If the selected backend is missing its required connection value.
    """
    global _store, _store_ctx

    if _store is not None:
        return _store

    # Config loading can reset both persistence singletons. Resolve the full
    # config outside this provider lock to avoid lock-order inversion.
    config = _get_store_config()

    with _store_lock:
        if _store is not None:
            return _store

        store_ctx = _sync_store_cm(config)
        store = store_ctx.__enter__()
        _store_ctx = store_ctx
        _store = store
    return _store


def reset_store() -> None:
    """Reset the sync singleton, forcing recreation on the next call.

    Closes any open backend connections and clears the cached instance.
    Useful in tests or after a configuration change.
    """
    global _store, _store_ctx
    with _store_lock:
        if _store_ctx is not None:
            try:
                _store_ctx.__exit__(None, None, None)
            except Exception:
                logger.warning("Error during store cleanup", exc_info=True)
            _store_ctx = None
        _store = None


# ---------------------------------------------------------------------------
# Sync context manager
# ---------------------------------------------------------------------------


@contextlib.contextmanager
def store_context() -> Iterator[BaseStore]:
    """Sync context manager that yields a Store and cleans up on exit.

    Unlike :func:`get_store`, this does **not** cache the instance — each
    ``with`` block creates and destroys its own connection.  Use it in CLI
    scripts or tests where you want deterministic cleanup::

        with store_context() as store:
            store.put(("threads",), thread_id, {...})

    The legacy ``checkpointer`` section takes precedence when configured;
    otherwise the unified ``database`` section selects the backend.
    """
    config = _resolve_store_config(get_app_config())
    with _sync_store_cm(config) as store:
        yield store
