"""Fingerprint-keyed cache for the compiled orchestrator graph.

``orchestration.mode`` / ``orchestration.workers`` are graph-structure
inputs: they are baked into the compiled LangGraph at build time
(:func:`qilin.agents.lead_agent.agent._build_orchestrator_graph`). The
gateway builds graphs at run start (``run_agent`` ->
``make_lead_agent``), so a ``config.yaml`` edit — or a
``PUT /api/config/orchestration`` write, which ``get_app_config()``
picks up via mtime/signature hot reload on the next request — is applied
by the next run's build: **mode switching takes effect on the next run
without a gateway restart**.

This module adds the cheap config-version check on top: an unchanged
orchestration fingerprint reuses the already-compiled orchestrator graph
instead of rebuilding it, while any graph-shaping change (mode, worker
registry, concurrency) rebuilds exactly once under a lock so concurrent
run dispatch never double-rebuilds.

Two-layer staleness guard, mirroring the identity re-validation trick of
``app.gateway.services._state_accessor_graph``:

1. The ``AppConfig`` object id is part of the cache key and the compiled
   graph strongly holds the config (the executor-factory closure captures
   it), so a hot reload — which constructs a *fresh* ``AppConfig`` — can
   never serve a graph whose embedded factory still closes over the
   previous config, and id-reuse cannot produce a false hit.
2. The orchestration fingerprint (see
   :meth:`qilin.config.orchestration_config.OrchestrationConfig.graph_fingerprint`)
   additionally catches in-place mutation of ``app_config.orchestration``
   on an otherwise-identical config object.
"""

from __future__ import annotations

import threading
from collections.abc import Callable, Hashable

#: Upper bound on distinct cache entries. The realistic key space is tiny
#: (lead model x resolving user x live AppConfig); the bound only protects
#: against unbounded growth from pathological key churn, matching the
#: accessor-graph cache in ``app.gateway.services``.
_DEFAULT_MAX_ENTRIES = 8


class FingerprintedGraphCache[T]:
    """Small lock-guarded cache mapping keys to ``(fingerprint, graph)``.

    ``get_or_build`` is the single entry point: a cache hit requires the
    key to be present *and* its stored fingerprint to equal the current
    one; anything else rebuilds via *builder* while holding the lock, so
    concurrent dispatchers with the same key serialize onto one build and
    the losers then observe the winner's entry. The build runs inside the
    lock on purpose — that is the "lock around rebuild" contract; graph
    compilation is fast and happens at most once per config change.
    """

    def __init__(self, *, max_entries: int = _DEFAULT_MAX_ENTRIES) -> None:
        self._entries: dict[Hashable, tuple[str, T]] = {}
        self._lock = threading.RLock()
        self._max_entries = max_entries

    def get_or_build(self, key: Hashable, fingerprint: str, builder: Callable[[], T]) -> T:
        """Return the cached graph for *key*, rebuilding when stale.

        Args:
            key: Cache slot. Callers must fold every non-fingerprint input
                the builder bakes into the graph (model, user, live config
                identity) into the key.
            fingerprint: Digest of the config slice the graph was shaped
                by. Differing from the stored digest means "config version
                changed since this graph was built" -> rebuild.
            builder: Zero-argument callable producing a fresh graph.
                Invoked at most once per stale/missing entry, under the
                lock.
        """
        with self._lock:
            cached = self._entries.get(key)
            if cached is not None and cached[0] == fingerprint:
                return cached[1]
            graph = builder()
            if len(self._entries) >= self._max_entries:
                self._entries.clear()
            self._entries[key] = (fingerprint, graph)
            return graph

    def clear(self) -> None:
        """Drop all entries (test/isolation hook)."""
        with self._lock:
            self._entries.clear()

    def __len__(self) -> int:
        with self._lock:
            return len(self._entries)
