"""QiLinMem -- the default :class:`MemoryManager` backend (self-contained).

QiLinMem wraps the QiLin memory machinery (the five ``core/`` modules:
storage / queue / updater / prompt / message_processing) behind the
backend-neutral :class:`~qilin.agents.memory.manager.MemoryManager`
contract. QiLinMem owns its storage / queue / updater as ``PrivateAttr`` dependencies
(no module-level singletons): the factory passes ``backend_config`` to the
BaseModel field, and ``model_post_init`` parses it into a :class:`QiLinMemConfig`
and constructs the dependencies. Behaviour matches the pre-abstraction code: the same filter +
human/ai validation + correction/reinforcement detection feeds the same
debounced queue; the same ``format_memory_for_injection`` produces injection
text; the same CRUD backs the management endpoints.

QiLinMem-private concerns (filter/detect, the ``<memory>`` wrap, ``enabled``
gating, the facts model) deliberately stay OUT of the ABC -- they live here.
``warm`` / ``reload_memory`` / fact CRUD are tier-3 optional hooks ON the ABC
(with defaults: ``warm``=True, the rest raise ``NotImplementedError``); QiLinMem
overrides the ones it supports. Callers (gateway / client / tools) invoke them
directly and catch ``NotImplementedError`` for unsupported backends -- no more
``hasattr`` probing.
"""

from __future__ import annotations

import copy
import logging
import threading
from typing import Any, ClassVar, Literal

from pydantic import PrivateAttr

from qilin.agents.memory.manager import (
    MemoryConflictError,
    MemoryCorruptionError,
    MemoryManager,
)

from .qilinmem.config import QiLinMemConfig
from .qilinmem.core.lexical import fact_recency, rank_facts
from .qilinmem.core.llm import build_llm
from .qilinmem.core.message_processing import (
    SIGNAL_NAMES,
    detect_signals,
    filter_messages_for_memory,
    filter_trivial,
    load_patterns,
)
from .qilinmem.core.paths import DEFAULT_AGENT_BUCKET
from .qilinmem.core.prompt import (
    format_memory_for_injection,
    load_prompt,
    load_prompt_messages,
    warm_tiktoken_cache,
)
from .qilinmem.core.queue import MemoryUpdateQueue, QueueFull
from .qilinmem.core.storage import (
    MemoryRevisionConflict,
    MemoryStorageCorruption,
    create_storage,
)
from .qilinmem.core.updater import MemoryUpdater

logger = logging.getLogger(__name__)

# Reciprocal-rank-fusion constant (Cormack et al.): the classic k=60 dampens
# the influence of any single list's rank positions so a fact's consensus
# across BOTH retrieval paths -- not one path's raw score magnitude -- drives
# the fused order. Scale-free, so FTS5's unbounded BM25-based score and the
# normalized lexical score combine without calibration.
_RRF_K = 60


def _resolve_agent_name(agent_name: str | None) -> str:
    """Return QiLin's case-insensitive canonical agent identifier."""
    return agent_name.lower() if agent_name is not None else DEFAULT_AGENT_BUCKET


def _call_backend(operation):
    """Translate QiLinMem-private storage errors into the public manager contract."""
    try:
        return operation()
    except MemoryRevisionConflict as exc:
        raise MemoryConflictError(str(exc)) from exc
    except MemoryStorageCorruption as exc:
        raise MemoryCorruptionError(str(exc)) from exc


def _legacy_source_value(source: Any) -> str:
    """Project structured source metadata back to the legacy public string."""
    if isinstance(source, str):
        return source
    if not isinstance(source, dict):
        return "unknown"
    source_type = source.get("type")
    thread_id = source.get("threadId")
    if source_type == "conversation" and isinstance(thread_id, str) and thread_id:
        return thread_id
    if isinstance(source_type, str) and source_type:
        return source_type
    if isinstance(thread_id, str) and thread_id:
        return thread_id
    return "unknown"


def _compat_document(memory_data: dict[str, Any]) -> dict[str, Any]:
    """Return the historical Manager/API shape without changing persistence."""
    result = copy.deepcopy(memory_data)
    for fact in result.get("facts", []):
        if isinstance(fact, dict):
            fact["source"] = _legacy_source_value(fact.get("source"))
    return result


def _fuse_ranked_results(ranked_lists: list[list[dict[str, Any]]], *, top_k: int) -> list[dict[str, Any]]:
    """Fuse best-first ranked fact lists via reciprocal rank fusion (RRF).

    Each input list is already relevance-ordered (FTS5 BM25-based, lexical).
    ``fused(id) = Σ 1 / (_RRF_K + rank)`` over every list containing the fact,
    so a fact matched by both paths outranks a fact matched by one even at a
    better per-list position. The winning representation is the first list's
    copy (same fact id; fields only differ by the per-path score/matchType,
    which are overwritten with the fused score). Ties resolve by the stronger
    lexical score, then recency, then fact id -- deterministic across runs.
    """
    fused_facts: dict[str, dict[str, Any]] = {}
    fused_scores: dict[str, float] = {}
    best_lexical_scores: dict[str, float] = {}
    for ranked in ranked_lists:
        for rank, fact in enumerate(ranked):
            fact_id = str(fact.get("id") or "")
            if not fact_id:
                continue
            fused_scores[fact_id] = fused_scores.get(fact_id, 0.0) + 1.0 / (_RRF_K + rank)
            fused_facts.setdefault(fact_id, dict(fact))
            raw_score = fact.get("score")
            if isinstance(raw_score, (int, float)) and not isinstance(raw_score, bool):
                best_lexical_scores[fact_id] = max(best_lexical_scores.get(fact_id, 0.0), float(raw_score))
    selected = sorted(
        fused_facts.values(),
        key=lambda fact: (
            -fused_scores.get(str(fact.get("id") or ""), 0.0),
            -best_lexical_scores.get(str(fact.get("id") or ""), 0.0),
            -fact_recency(fact),
            str(fact.get("id") or ""),
        ),
    )[:top_k]
    for fact in selected:
        fact_id = str(fact.get("id") or "")
        fact["score"] = round(fused_scores.get(fact_id, 0.0), 6)
    return selected


class QiLinMem(MemoryManager):
    """Default memory backend: file-backed facts + debounced LLM extraction."""

    # Backend-private dependencies are PrivateAttr (not pydantic fields): they
    # are non-pydantic objects (storage / llm / queue) that must NOT participate
    # in validation / serialization. Built once in model_post_init from
    # self.backend_config -> QiLinMemConfig.
    _config: Any = PrivateAttr(default=None)
    _storage: Any = PrivateAttr(default=None)
    _llm: Any = PrivateAttr(default=None)
    _updater: Any = PrivateAttr(default=None)
    _queue: Any = PrivateAttr(default=None)
    _trivial_patterns: Any = PrivateAttr(default=None)

    # QiLinMem implements search() (hybrid FTS5 + lexical scoring over stored
    # facts), so it is valid for mode="tool" (the base invariant validator
    # requires this for tool mode). Backends without real search inherit the
    # False default and cannot be used with mode="tool".
    supports_search: ClassVar[bool] = True

    def model_post_init(self, __context: Any) -> None:
        """Construct QiLinMem's dependencies from ``self.backend_config``.

        Runs after pydantic's ``__init__`` validates the fields. Parses
        ``backend_config`` into a :class:`QiLinMemConfig` (defaults apply when
        empty/None) and wires storage / patterns / llm / updater / queue (DI).
        """
        self._config = QiLinMemConfig.from_backend_config(self.backend_config)
        self._storage = create_storage(self._config)
        # Signal-detection patterns (externalized YAML; ``patterns_dir`` override
        # or bundled defaults = pre-externalization behavior). Loaded once at
        # construction and reused by ``_prepare_update``'s detect_* calls.
        # Pre-load trivial + signal patterns at construction so a misconfigured
        # patterns_dir (missing / invalid yaml) surfaces at startup, not on the
        # first update. Compiled patterns are cached by load_patterns.
        self._trivial_patterns = load_patterns("trivial", patterns_dir=self._config.patterns_dir)
        for _signal_name in SIGNAL_NAMES:
            load_patterns(_signal_name, patterns_dir=self._config.patterns_dir)
        # host_llm (host-injected default model) takes precedence over build_llm(model)
        # so zero-config QiLinMem (empty `model`) still extracts via the app default,
        # mirroring pre-abstraction `model_name: null`. Standalone (no factory) -> None.
        self._llm = self._config.host_llm if self._config.host_llm is not None else build_llm(self._config.model)
        self._updater = MemoryUpdater(self._config, self._storage, self._llm, prompts_dir=self._config.prompts_dir, callbacks=self.callbacks)
        # Retrieval is derived data. The first search for a scope lazily
        # rebuilds it; Gateway warm-up performs the full rebuild off-loop.
        self._retrieval_lock = threading.RLock()
        self._retrieval_warmed_scopes: set[tuple[str | None, str | None]] = set()
        self._retrieval_fully_warmed = False
        # Validate the *global* explicit prompt templates at construction so a
        # misconfigured prompts_dir surfaces at startup rather than as a silent
        # dropped update. Per-agent overrides ({prompts_dir}/{agent}/*.yaml)
        # cannot be known here -- they are validated lazily at first use and
        # logged at ERROR by the updater's exception handler.
        # fact_extraction is dormant (not wired to any runtime caller); excluded.
        if self._config.prompts_dir is not None:
            _dummy_vars = {
                "current_memory": "{}",
                "conversation": "(validation)",
                "correction_hint": "",
                "staleness_review_section": "",
                "consolidation_section": "",
            }
            load_prompt("staleness_review", prompts_dir=self._config.prompts_dir).format(stale_facts="")
            load_prompt("consolidation", prompts_dir=self._config.prompts_dir).format(consolidation_groups="", max_groups=1)
            load_prompt_messages("memory_update", _dummy_vars, prompts_dir=self._config.prompts_dir)
        self._queue = MemoryUpdateQueue(self._config, self._updater)

    @classmethod
    def from_config(
        cls,
        backend_config: dict[str, Any] | None = None,
        *,
        mode: Literal["middleware", "tool"] = "middleware",
        **host_hooks: Any,
    ) -> QiLinMem:
        """Build a QiLinMem with dependencies wired, consuming host hooks.

        The factory passes host hooks (tracing, hidden-message filter,
        trace-context manager, a host-llm factory) as kwargs rather than
        injecting them into ``backend_config``; QiLinMem merges the ones it
        consumes (QiLinMemConfig fields) here, respecting explicit
        ``backend_config`` values. ``host_llm`` is built from the host factory
        only when no model is configured (host_llm takes precedence over
        ``build_llm(model)``; building an unused host default when a model
        exists would waste startup time). The actual dependency wiring runs in
        ``model_post_init`` (shared with direct construction).
        """
        config_dict = dict(backend_config or {})
        for key in ("should_keep_hidden_message", "trace_context_manager", "extraction_callback"):
            if key not in config_dict and key in host_hooks:
                config_dict[key] = host_hooks[key]
        if "host_llm" not in config_dict:
            model_cfg = config_dict.get("model")
            if not (isinstance(model_cfg, dict) and model_cfg.get("model")):
                host_llm_factory = host_hooks.get("host_llm_factory")
                if host_llm_factory is not None:
                    config_dict["host_llm"] = host_llm_factory()
        # callbacks is a base MemoryManager field (not QiLinMemConfig); pass through.
        # config_dict carries the host hooks merged above so model_post_init can
        # parse them into QiLinMemConfig (self._config, PrivateAttr). After wiring,
        # restore backend_config to the pure data the host passed (no injected
        # hooks) so the field stays serializable and matches the README contract
        # ("host hooks arrive as from_config kwargs, NOT in backend_config") --
        # the hooks live in self._config, not the backend_config field.
        instance = cls(backend_config=config_dict, mode=mode, callbacks=host_hooks.get("callbacks"))
        instance.backend_config = dict(backend_config or {})
        return instance

    # ── Write ────────────────────────────────────────────────────────────
    def add(
        self,
        thread_id: str,
        messages: list[Any],
        *,
        agent_name: str | None = None,
        user_id: str | None = None,
        trace_id: str | None = None,
    ) -> None:
        """Filter, validate, detect signals, then enqueue (debounced).

        Mirrors the preprocessing that lived in ``MemoryMiddleware.after_agent``
        before the abstraction. The ``enabled`` gate and
        ``thread_id``/``user_id``/``trace_id`` resolution stay at the call site.
        """
        prepared = self._prepare_update(messages)
        if prepared is None:
            return
        filtered, signals = prepared
        # QiLinMem owns the queue, so it owns the backpressure degradation: a
        # QueueFull here is logged + dropped so memory backpressure degrades to
        # "update skipped" rather than propagating into
        # MemoryMiddleware.after_agent and breaking the agent run (peer
        # middlewares self-guard the same way). The dropped update is re-fed
        # next turn (the middleware passes the full conversation each cycle, and
        # the watermark does not advance on a non-enqueued turn).
        try:
            self._queue.add(
                thread_id=thread_id,
                messages=filtered,
                agent_name=_resolve_agent_name(agent_name),
                user_id=user_id,
                trace_id=trace_id,
                signals=signals,
            )
        except QueueFull as e:
            logger.warning("Memory update rejected under backpressure (thread=%s): %s", thread_id, e)

    def add_nowait(
        self,
        thread_id: str,
        messages: list[Any],
        *,
        agent_name: str | None = None,
        user_id: str | None = None,
    ) -> None:
        """Filter, validate, detect signals, then enqueue for immediate flush.

        Mirrors the preprocessing that lived in ``memory_flush_hook`` before
        the abstraction. Used right before summarization removes messages.
        """
        prepared = self._prepare_update(messages)
        if prepared is None:
            return
        filtered, signals = prepared
        # Defense-in-depth: the emergency path always admits under backpressure
        # (see _enqueue_locked), so QueueFull is not expected here -- but the
        # emergency flush is invoked from summarization_hook, so a propagated
        # exception would break summarization. Catch + log to be safe.
        try:
            self._queue.add_nowait(
                thread_id=thread_id,
                messages=filtered,
                agent_name=_resolve_agent_name(agent_name),
                user_id=user_id,
                signals=signals,
            )
        except QueueFull as e:
            logger.warning("Memory emergency flush rejected under backpressure (thread=%s): %s", thread_id, e)

    def _prepare_update(
        self,
        messages: list[Any],
    ) -> tuple[list[Any], frozenset[str]] | None:
        """Filter to user+final-AI messages, require both, detect signals.

        Returns ``(filtered, signals)`` where ``signals`` is the set of signal
        classes detected in the recent turns, or ``None`` when there is no
        meaningful conversation (missing a user or an assistant turn, or every
        turn dropped as a trivial pure-acknowledgment).
        """
        filtered = filter_messages_for_memory(
            messages,
            should_keep_hidden_message=self._config.should_keep_hidden_message,
        )
        filtered = filter_trivial(filtered, patterns=self._trivial_patterns)
        user_messages = [m for m in filtered if getattr(m, "type", None) == "human"]
        assistant_messages = [m for m in filtered if getattr(m, "type", None) == "ai"]
        if not user_messages or not assistant_messages:
            return None
        signals = detect_signals(filtered, patterns_dir=self._config.patterns_dir)
        return filtered, frozenset(signals)

    # ── Read ─────────────────────────────────────────────────────────────
    def get_context(
        self,
        user_id: str | None,
        *,
        agent_name: str | None = None,
        thread_id: str | None = None,
    ) -> str:
        """Load memory and format it for injection (plain text, no wrap).

        Middleware mode injects the selected agent's facts together with the
        user-global summaries. Tool mode injects only those global summaries;
        facts stay behind ``memory_search`` so they are not duplicated in the
        prompt and a later retrieval result.

        Format parameters come from QiLinMem's own ``QiLinMemConfig`` (set at
        construction from ``backend_config``). The ``enabled``/
        ``injection_enabled`` gate and the ``<memory>`` wrapping stay at the
        call site (``_get_memory_context``); this returns only the body.
        """
        injection_agent = None if self.mode == "tool" else _resolve_agent_name(agent_name)
        memory_data = _call_backend(lambda: self._updater.get_memory_data(agent_name=injection_agent, user_id=user_id))
        return format_memory_for_injection(
            memory_data,
            max_tokens=self._config.max_injection_tokens,
            use_tiktoken=(self._config.token_counting == "tiktoken"),
            guaranteed_categories=self._config.guaranteed_categories,
            guaranteed_token_budget=self._config.guaranteed_token_budget,
        )

    def search(
        self,
        query: str,
        top_k: int = 5,
        *,
        user_id: str | None = None,
        agent_name: str | None = None,
        category: str | None = None,
    ) -> list[dict[str, Any]]:
        """Hybrid search: FTS5 BM25 + pure-Python lexical scoring, fused by RRF.

        Two independent ranked lists are produced for the requested scope:

        1. The FTS5 retrieval adapter (when configured) -- BM25 over the
           tokenized index with time-decay + confidence weighting.
        2. A lexical pass (:meth:`_lexical_search`) directly over the bucket's
           stored facts -- exact/substring containment plus case/diacritic-
           insensitive IDF-weighted token overlap with soft length
           normalization and recency tie-breaking.

        Fusing both (reciprocal rank fusion) keeps each path's blind spots from
        becoming the search's blind spots: partial-word substrings ("postgres"
        inside "PostgreSQL") that the tokenized FTS5 index misses still rank,
        and FTS5's CJK/jieba matches survive when the lexical pass is weak.
        Facts found by BOTH lists outrank facts found by one. Every returned
        fact carries a relevance ``score`` (the fused rank score) and a
        ``matchType``. Retrieval errors never make canonical memory
        unavailable: a failing path contributes an empty list, and with no
        adapter at all the lexical list is the complete result.
        """
        if not query or not query.strip() or top_k <= 0:
            return []
        resolved_agent_name = _resolve_agent_name(agent_name)
        fts5_ranked = self._fts5_search(query, top_k=top_k, user_id=user_id, agent_name=resolved_agent_name, category=category)
        lexical_ranked = self._lexical_search(query, top_k=top_k, user_id=user_id, agent_name=resolved_agent_name, category=category)
        return _fuse_ranked_results([fts5_ranked, lexical_ranked], top_k=top_k)

    def _fts5_search(
        self,
        query: str,
        *,
        top_k: int,
        user_id: str | None,
        agent_name: str | None,
        category: str | None,
    ) -> list[dict[str, Any]]:
        """Return adapter results in the public fact shape, keeping each score.

        With no retrieval adapter configured this returns ``[]`` up front:
        storage's internal substring fallback would be a strict subset of the
        lexical pass (and ranked only by confidence), so feeding it into the
        fusion could only distort the lexical ordering, never improve it.
        """
        agent_name = _resolve_agent_name(agent_name)
        status = getattr(self._storage, "retrieval_status", None)
        if callable(status) and not status().get("configured", False):
            return []
        search_facts = getattr(self._storage, "search_facts", None)
        scopes = [{"userId": user_id, "agentName": agent_name}]
        try:
            self._ensure_retrieval_scopes(scopes)
            indexed = (
                search_facts(
                    query,
                    scopes=scopes,
                    top_k=top_k,
                    mode="hybrid",
                    filters={"category": category} if category else None,
                )
                if callable(search_facts)
                else []
            )
        except Exception:
            logger.exception("Memory retrieval adapter failed; using lexical scoring only")
            indexed = []
        if not indexed:
            return []
        scored: list[dict[str, Any]] = []
        for result in indexed:
            fact = result.get("fact", result) if isinstance(result, dict) else result
            if not isinstance(fact, dict):
                continue
            fact = dict(fact)
            fact["score"] = float(result.get("score", 0.0) or 0.0) if isinstance(result, dict) else 0.0
            # The adapter labels its results ("fts5"); storage's own substring
            # fallback (used when no adapter is configured or a rebuild failed)
            # labels its "substring". Pass the label through instead of
            # misreporting every adapter-path result as indexed.
            fact["matchType"] = str(result.get("matchType") or "fts5") if isinstance(result, dict) else "fts5"
            scored.append(fact)
        return _compat_document({"facts": scored})["facts"]

    def _lexical_search(
        self,
        query: str,
        *,
        top_k: int,
        user_id: str | None,
        agent_name: str | None,
        category: str | None,
    ) -> list[dict[str, Any]]:
        """Hybrid lexical scoring directly over the bucket's stored facts.

        Replaces the historical case-insensitive substring fallback: substring
        containment is now one component (boosted above token overlap, below
        exact equality) of a scored ranking that also weighs IDF-weighted token
        overlap, document length, confidence, and recency. Because it reads the
        canonical facts (not the rebuildable index), it also serves as the
        complete result path when no retrieval adapter is configured.
        """
        memory_data = _call_backend(lambda: self._updater.get_memory_data(agent_name=agent_name, user_id=user_id))
        ranked = rank_facts(query, memory_data.get("facts", []), top_k=top_k, category=category)
        scored = []
        for fact, score, match_type in ranked:
            item = dict(fact)
            item["score"] = score
            item["matchType"] = match_type
            scored.append(item)
        return _compat_document({"facts": scored})["facts"]

    def _ensure_retrieval_scopes(self, scopes: list[dict[str, str | None]]) -> None:
        """Lazily rebuild every requested scope when warm-up was skipped."""
        if not hasattr(self, "_retrieval_lock"):
            self._retrieval_lock = threading.RLock()
        if not hasattr(self, "_retrieval_warmed_scopes"):
            self._retrieval_warmed_scopes = set()
        if not hasattr(self, "_retrieval_fully_warmed"):
            self._retrieval_fully_warmed = False
        rebuild = getattr(self._storage, "rebuild_index", None)
        if not callable(rebuild):
            return
        with self._retrieval_lock:
            if self._retrieval_fully_warmed:
                return
            status = getattr(self._storage, "retrieval_status", lambda: {"configured": True})()
            if not status.get("configured", True):
                self._retrieval_warmed_scopes.update((scope.get("userId"), scope.get("agentName")) for scope in scopes)
                return
            for scope in scopes:
                key = (scope.get("userId"), scope.get("agentName"))
                if key in self._retrieval_warmed_scopes:
                    continue
                try:
                    result = rebuild([scope])
                except Exception:
                    logger.exception("Failed to lazily rebuild memory retrieval index for scope %r", key)
                    continue
                if result.get("supported") and not result.get("fatal"):
                    self._retrieval_warmed_scopes.add(key)

    # ── Manage ───────────────────────────────────────────────────────────
    def get_memory(
        self,
        *,
        user_id: str | None = None,
        agent_name: str | None = None,
    ) -> dict[str, Any]:
        memory_data = _call_backend(lambda: self._updater.get_memory_data(agent_name=_resolve_agent_name(agent_name), user_id=user_id))
        return _compat_document(memory_data)

    # delete_memory / export_memory inherit the base tier-2 default (raise
    # NotImplementedError) -- they are dead contract (zero callers; /memory/export
    # routes via get_memory), so QiLinMem no longer repeats the raise.

    def clear_memory(
        self,
        *,
        user_id: str | None = None,
        agent_name: str | None = None,
    ) -> dict[str, Any]:
        if agent_name is None:
            memory_data = _call_backend(lambda: self._updater.clear_all_memory_data(user_id=user_id))
        else:
            memory_data = _call_backend(lambda: self._updater.clear_memory_data(agent_name=_resolve_agent_name(agent_name), user_id=user_id))
        return _compat_document(memory_data)

    def import_memory(
        self,
        memory_data: dict[str, Any],
        *,
        user_id: str | None = None,
        agent_name: str | None = None,
    ) -> dict[str, Any]:
        imported = _call_backend(
            lambda: self._updater.import_memory_data(
                memory_data,
                agent_name=_resolve_agent_name(agent_name),
                user_id=user_id,
            )
        )
        return _compat_document(imported)

    # ── Lifecycle ───────────────────────────────────────────────────────
    def shutdown_flush(self, timeout: float) -> bool:
        """Drain the debounce queue within ``timeout`` on graceful shutdown.

        Delegates to the queue's bounded synchronous flush, which joins an
        in-flight worker first (so contexts a debounce Timer already pulled out
        of the queue are not lost on exit) and otherwise drains the queue on a
        daemon thread with a real hard timeout (the memory-update LLM call is
        synchronous and cannot be interrupted). Returns ``True`` only when the
        drain genuinely finished within ``timeout``.
        """
        return self._queue.flush_sync(timeout)

    def close(self) -> None:
        """Close derived retrieval resources after pending updates drain."""
        self._storage.close()

    # ── Tier 3 hooks (override the base defaults; warm/reload/fact CRUD) ──
    def warm(self) -> bool:
        """Pre-warm QiLinMem's token-counting resources.

        Overrides the base tier-3 hook (default None = nothing to warm). The
        Gateway lifespan calls ``manager.warm()`` directly off the event loop;
        backends without heavy init inherit the None default (the host logs
        "skipping"). Returns True if the encoding loaded (or was already cached,
        or warming was unnecessary); False if tiktoken is unavailable or the
        download failed.
        """
        if self._config.token_counting == "char":
            logger.info("token_counting='char'; tiktoken not used, skipping warm-up")
            return True
        return warm_tiktoken_cache()

    def warm_retrieval(self) -> bool:
        """Rebuild the complete derived retrieval index before serving traffic."""
        rebuild = getattr(self._storage, "rebuild_index", None)
        if not callable(rebuild):
            return True
        try:
            result = rebuild()
            index_ok = not bool(result.get("fatal"))
            failed = int(result.get("failed") or 0)
            if failed and index_ok:
                logger.warning(
                    "Memory retrieval index rebuilt with %d fact(s) skipped",
                    failed,
                )
            if index_ok:
                with self._retrieval_lock:
                    self._retrieval_fully_warmed = True
                    self._retrieval_warmed_scopes.clear()
            return index_ok
        except Exception:
            logger.exception("Failed to rebuild memory retrieval index during warm-up")
            return False

    def reload_memory(
        self,
        *,
        user_id: str | None = None,
        agent_name: str | None = None,
    ) -> dict[str, Any]:
        """Drop the cached memory document and reload from disk."""
        memory_data = _call_backend(
            lambda: self._updater.reload_memory_data(
                agent_name=_resolve_agent_name(agent_name),
                user_id=user_id,
            )
        )
        return _compat_document(memory_data)

    def create_fact(
        self,
        content: str,
        category: str = "context",
        confidence: float = 0.5,
        *,
        agent_name: str | None = None,
        user_id: str | None = None,
    ) -> tuple[dict[str, Any], str | None]:
        memory_data, fact_id = _call_backend(
            lambda: self._updater.create_memory_fact(
                content,
                category=category,
                confidence=confidence,
                agent_name=_resolve_agent_name(agent_name),
                user_id=user_id,
            )
        )
        return _compat_document(memory_data), fact_id

    def delete_fact(
        self,
        fact_id: str,
        *,
        agent_name: str | None = None,
        user_id: str | None = None,
    ) -> dict[str, Any]:
        memory_data = _call_backend(
            lambda: self._updater.delete_memory_fact(
                fact_id,
                agent_name=_resolve_agent_name(agent_name),
                user_id=user_id,
            )
        )
        return _compat_document(memory_data)

    def update_fact(
        self,
        fact_id: str,
        content: str | None = None,
        category: str | None = None,
        confidence: float | None = None,
        *,
        agent_name: str | None = None,
        user_id: str | None = None,
    ) -> dict[str, Any]:
        memory_data = _call_backend(
            lambda: self._updater.update_memory_fact(
                fact_id,
                content=content,
                category=category,
                confidence=confidence,
                agent_name=_resolve_agent_name(agent_name),
                user_id=user_id,
            )
        )
        return _compat_document(memory_data)
