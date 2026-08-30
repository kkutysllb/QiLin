"""Shared LangGraph backend-opening skeleton for checkpointer and store.

Both the :mod:`qilin.runtime.checkpointer` and :mod:`qilin.runtime.store`
factory families implement the same "lazy import → ImportError install hint →
connection-string preparation → setup → yield" skeleton for the
memory/sqlite/postgres backends. This private sibling module hosts that
skeleton once, parameterized per factory, so the two families cannot drift.

Dependency direction: the checkpointer and store packages are siblings and
both may import this module (and the pre-existing shared
:mod:`qilin.runtime.store._sqlite_utils` helpers); nothing here imports them.
"""

from __future__ import annotations

import contextlib
import importlib
import logging
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from typing import Any

__all__ = [
    "SyncBackendSpec",
    "import_backend_class",
    "open_sync_langgraph_backend",
    "prepare_sqlite_conn_string",
]


def import_backend_class(module: str, name: str, install_hint: str | None) -> Any:
    """Perform ``from module import name`` lazily.

    When *install_hint* is given, any ``ImportError`` raised by the import is
    re-raised as ``ImportError(install_hint)`` — mirroring the per-backend
    hint wrapping the provider factories historically inlined. When it is
    ``None`` the raw ``ImportError`` propagates unchanged (memory backends).
    """
    if install_hint is None:
        return getattr(importlib.import_module(module), name)
    try:
        mod = importlib.import_module(module)
    except ImportError as exc:
        raise ImportError(install_hint) from exc
    try:
        return getattr(mod, name)
    except AttributeError as exc:
        # ``from M import C`` raises ImportError when C is missing from M.
        raise ImportError(install_hint) from exc


def prepare_sqlite_conn_string(raw: str) -> str:
    """Resolve a raw SQLite path/URI and ensure its parent directory exists.

    The ``_sqlite_utils`` import is deferred: importing it eagerly from here
    would re-enter the ``qilin.runtime.store`` package initialisation and
    create a circular import between the sibling provider packages.
    """
    from qilin.runtime.store._sqlite_utils import (
        ensure_sqlite_parent_dir,
        resolve_sqlite_conn_str,
    )

    conn_str = resolve_sqlite_conn_str(raw)
    ensure_sqlite_parent_dir(conn_str)
    return conn_str


@dataclass(frozen=True)
class SyncBackendSpec:
    """Per-factory parameters for :func:`open_sync_langgraph_backend`.

    ``unknown_backend_message`` is a template formatted with ``backend`` so
    each family keeps its own wording (e.g. ``"Unknown checkpointer type:
    {backend!r}"`` vs ``"Unknown store backend type: {backend!r}"``).
    """

    label: str
    logger: logging.Logger
    memory_module: str
    memory_class: str
    sqlite_module: str
    sqlite_class: str
    sqlite_install_hint: str
    postgres_module: str
    postgres_class: str
    postgres_install_hint: str
    conn_required_message: str
    unknown_backend_message: str


@contextlib.contextmanager
def open_sync_langgraph_backend(
    spec: SyncBackendSpec,
    backend: str,
    connection_string: str | None,
    prepare_sqlite_conn: Callable[[str], str] = prepare_sqlite_conn_string,
) -> Iterator[Any]:
    """Open a sync memory/sqlite/postgres backend and yield it inside a CM.

    Mirrors the historically duplicated skeleton exactly: bare memory import,
    hint-wrapped lazy imports, SQLite connection-string preparation, eager
    ``setup()`` on enter, and the family-specific unknown-backend error.
    """
    if backend == "memory":
        memory_cls = import_backend_class(spec.memory_module, spec.memory_class, None)
        spec.logger.info(
            "%s: using %s (in-process, not persistent)", spec.label, spec.memory_class
        )
        yield memory_cls()
        return

    if backend == "sqlite":
        sqlite_cls = import_backend_class(
            spec.sqlite_module, spec.sqlite_class, spec.sqlite_install_hint
        )
        conn_str = prepare_sqlite_conn(connection_string or "store.db")
        with sqlite_cls.from_conn_string(conn_str) as saver:
            saver.setup()
            spec.logger.info("%s: using %s (%s)", spec.label, spec.sqlite_class, conn_str)
            yield saver
        return

    if backend == "postgres":
        postgres_cls = import_backend_class(
            spec.postgres_module, spec.postgres_class, spec.postgres_install_hint
        )
        if not connection_string:
            raise ValueError(spec.conn_required_message)
        with postgres_cls.from_conn_string(connection_string) as saver:
            saver.setup()
            spec.logger.info("%s: using %s", spec.label, spec.postgres_class)
            yield saver
        return

    raise ValueError(spec.unknown_backend_message.format(backend=backend))
