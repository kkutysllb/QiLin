"""Middleware to detect and break repetitive tool call loops.

P0 safety: prevents the agent from calling the same tool with the same
arguments indefinitely until the recursion limit kills the run.

Detection strategy (two layers):

  1. **Chain-based** (Layer 1): the canonical identity of the WHOLE
     tool-call set of each AI response — name plus full canonical arguments,
     volatile free-text fields (``description``) excluded, line ranges
     participating exactly (no range folding). Each thread tracks one
     *consecutive* chain: the same identity repeating increments its run
     length; any different tracked call starts a new chain, so progressive
     reading of one file region (lines 401-600, then 528-585) never
     accumulates toward the thresholds. Escalating reminders fire at
     ``reminder_thresholds`` (default 3/5/8): a gentle nudge at the first
     tier, a detailed reminder quoting the canonical arguments at later
     tiers. At ``hard_limit`` (default 12) all tool_calls are stripped so
     the agent is forced to produce a final text answer.

  2. **Frequency-based** (Layer 2): catches the same *tool type* being
     called many times with varying arguments (e.g. ``read_file`` on 40
     different files) — the shape Layer 1 deliberately tolerates.

A newer human message resets the chain: repetition across a user turn is
not a loop. Reminders are advice — the model keeps the freedom to choose
its next action; the hard stop is the last-resort backstop, and Layer 2's
per-tool hard limit independently caps varied-argument loops.

File-version awareness is delegated, not duplicated: the read-before-write
gate (``ReadBeforeWriteMiddleware``, issue #3857) already refuses writes to
files changed since their last read and forces the re-read, so this
middleware does not track file state. What it adds on top is a *denial-aware
early break*: when the previous identical attempt's tool results signalled
failure (gate rejection, permission denial, tool error), repeating the call
unchanged is already a loop at the second attempt — a dedicated reminder
fires immediately (and on every further failed repeat) instead of waiting
for the reminder ladder.

Why the warning is injected at ``wrap_model_call`` instead of
``after_model``:

  ``after_model`` fires immediately after the model emits an
  ``AIMessage`` that may carry ``tool_calls``. The tools node has not
  run yet, so no matching ``ToolMessage`` exists in the history. Any
  message we add here lands *between* the assistant's tool_calls and
  their responses. OpenAI/Moonshot reject the next request with
  ``"tool_call_ids did not have response messages"`` because their
  validators require the assistant's tool_calls to be followed
  immediately by tool messages. Anthropic also disallows mid-stream
  ``SystemMessage``. By deferring the warning to ``wrap_model_call``,
  every prior ToolMessage is already present in the request's message
  list and the warning is appended at the end — pairing intact, no
  ``AIMessage`` semantics are mutated.

Queued warnings are intentionally transient. If a run ends before the
next model request drains a queued warning, ``after_agent`` drops it
instead of carrying it into a later invocation for the same thread. The
hard-stop path still forces termination when the configured safety limit
is reached.

Stop-reason surfacing (#3875 Phase 2):
  Like the token-budget guard, the loop hard stop does NOT raise — it
  strips ``tool_calls`` so the agent loop terminates naturally with a
  final answer. To let the caller (the subagent executor) distinguish a
  loop-capped completion from a clean one, the run that triggered the hard
  stop is recorded in ``_stop_reason`` and exposed via
  :meth:`consume_stop_reason`. The executor collects that reason alongside
  the token-budget guard's so a loop-capped run surfaces as
  ``completed + loop_capped`` and the lead/ledger can tell it was capped
  without parsing result text.
"""

from __future__ import annotations

import json
import logging
import threading
from collections import Counter, OrderedDict, defaultdict, deque
from collections.abc import Awaitable, Callable
from copy import deepcopy
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, override

from langchain.agents import AgentState
from langchain.agents.middleware import AgentMiddleware
from langchain.agents.middleware.types import (
    ModelCallResult,
    ModelRequest,
    ModelResponse,
)
from langchain_core.messages import HumanMessage
from langgraph.runtime import Runtime

from qilin.agents.middlewares._bounded_dict import BoundedDict

if TYPE_CHECKING:
    from qilin.config.loop_detection_config import LoopDetectionConfig

logger = logging.getLogger(__name__)

# Defaults — can be overridden via constructor
_DEFAULT_REMINDER_THRESHOLDS = (3, 5, 8)  # escalating reminder tiers (consecutive repeats)
_DEFAULT_HARD_LIMIT = 12  # force-stop after this many consecutive identical sets
_DEFAULT_WINDOW_SIZE = 20  # legacy Layer 1 window; now only a floor for the Layer 2 window
_DEFAULT_MAX_TRACKED_THREADS = 100  # LRU eviction limit
_DEFAULT_TOOL_FREQ_WARN = 30  # warn after 30 calls to the same tool type
_DEFAULT_TOOL_FREQ_HARD_LIMIT = 50  # force-stop after 50 calls to the same tool type
_DEFAULT_ARGUMENTS_PREVIEW_CHARS = 400  # cap on args quoted in a detailed reminder
_MAX_PENDING_WARNINGS_PER_RUN = 4

# Free-text justification fields that vary per call while the operation is
# identical (``read_file``'s ``description``). Excluded from call identity;
# everything else — including line ranges — participates exactly.
_VOLATILE_ARGUMENT_FIELDS = frozenset({"description"})


def _normalize_tool_call_args(raw_args: object) -> tuple[dict, str | None]:
    """Normalize tool call args to a dict plus an optional fallback key.

    Some providers serialize ``args`` as a JSON string instead of a dict.
    We defensively parse those cases so loop detection does not crash while
    still preserving a stable fallback key for non-dict payloads.
    """
    if isinstance(raw_args, dict):
        return raw_args, None

    if isinstance(raw_args, str):
        try:
            parsed = json.loads(raw_args)
        except (TypeError, ValueError, json.JSONDecodeError):
            return {}, raw_args

        if isinstance(parsed, dict):
            return parsed, None
        return {}, json.dumps(parsed, sort_keys=True, default=str)

    if raw_args is None:
        return {}, None

    return {}, json.dumps(raw_args, sort_keys=True, default=str)


def _prune_volatile_fields(value: object) -> object:
    """Deep-copy a JSON-domain value, dropping volatile fields at every level."""
    if isinstance(value, dict):
        return {
            key: _prune_volatile_fields(item)
            for key, item in sorted(value.items())
            if key not in _VOLATILE_ARGUMENT_FIELDS
        }
    if isinstance(value, list):
        return [_prune_volatile_fields(item) for item in value]
    return value


def _canonical_tool_arguments(args: dict) -> str:
    """Canonical string form of one call's arguments.

    Volatile free-text fields are pruned, then the remaining value is deep
    key-sorted and JSON-serialized, so two argument objects that differ only
    in property order (or only in a ``description``) canonicalize identically,
    and two calls differing in any operational field — line ranges included —
    canonicalize differently.
    """
    return json.dumps(_prune_volatile_fields(args), sort_keys=True, ensure_ascii=False, default=str)


def _canonical_call_set_key(tool_calls: list[dict]) -> str:
    """Stable identity for one AI response's set of tool calls.

    Per call: ``name:canonical-args``; the per-call strings are sorted so
    permutations of the same multiset of calls yield the same key. The result
    is a readable multi-line string (also quoted in detailed reminders and
    logged truncated) rather than a digest, for observability.
    """
    parts: list[str] = []
    for tc in tool_calls:
        name = tc.get("name", "")
        args, fallback_key = _normalize_tool_call_args(tc.get("args", {}))
        if fallback_key is not None:
            parts.append(f"{name}:{fallback_key}")
        else:
            parts.append(f"{name}:{_canonical_tool_arguments(args)}")
    parts.sort()
    return "\n".join(parts)


def _nearest_turn_marker(messages: list[Any]) -> str | None:
    """Identity of the nearest preceding human message — the current turn's marker.

    Scans backwards past tool results and earlier assistant steps; the first
    human message found is the user turn the current response belongs to.
    Returns the message id when present, else None — a None on either side of
    the comparison means "unknown", and callers must skip reset detection
    rather than guess.
    """
    for message in reversed(messages):
        if getattr(message, "type", None) == "human":
            marker = getattr(message, "id", None)
            return str(marker) if marker else None
    return None


def _previous_attempt_failed(messages: list[Any]) -> bool:
    """Whether the previous identical response's tool results signalled failure.

    Scans the ToolMessage results sitting between the previous AI response and
    the current trailing one. Any ``status="error"`` result — the
    read-before-write gate's rejection, permission denials, tool errors — or
    any ``"Error: ..."`` content string counts as failure. Content that is not
    a plain string (content blocks) is judged by ``status`` alone.
    """
    failed_seen = False
    for message in reversed(messages[:-1]):
        mtype = getattr(message, "type", None)
        if mtype == "tool":
            if failed_seen:
                continue
            if getattr(message, "status", None) == "error":
                failed_seen = True
                continue
            content = getattr(message, "content", "")
            if isinstance(content, str) and content.startswith("Error:"):
                failed_seen = True
        elif mtype in ("ai", "human"):
            break
    return failed_seen


_GENTLE_REMINDER = (
    "[REPEATED TOOL CALLS] You are repeating the exact same set of tool calls. "
    "Analyze the previous results carefully before repeating them: if the task is not "
    "complete, try a different approach or different arguments; if you were verifying "
    "an edit, trust the edit tool's success or error output instead of re-reading the file."
)

_DENIED_REPEAT_REMINDER = (
    "[REPEATED FAILED CALL] The previous identical tool call failed, and you are repeating "
    "it unchanged. Retrying identically will not change the outcome: if a file changed, "
    "re-read it first; if the call was denied, do not retry it — use a different approach "
    "or different arguments, or report the blocker to the user."
)


def _detailed_reminder(call_key: str, count: int, preview_chars: int) -> str:
    """Later-tier reminder: names the repeated set, the run length, and the arguments."""
    preview = call_key
    if len(preview) > preview_chars:
        preview = f"{preview[:preview_chars]}… (+{len(call_key) - preview_chars} more chars)"
    return (
        "[REPEATED TOOL CALLS] The identical tool-call set has now repeated "
        f"{count} consecutive times without making progress:\n"
        f"{preview}\n"
        "Do not issue these exact calls again. Inspect the latest results and choose a "
        "different action, different arguments, or finish if enough evidence has been "
        "gathered. If you were verifying an edit, trust the edit tool's success or error "
        "output instead of re-reading the file."
    )


def _hard_stop_message(count: int) -> str:
    return (
        "[FORCED STOP] The identical tool-call set repeated "
        f"{count} consecutive times without progress. Tool calls are disabled for this "
        "response — produce your final answer from the evidence collected so far."
    )


_TOOL_FREQ_WARNING_MSG = (
    "[LOOP DETECTED] You have called {tool_name} {count} times without producing a final answer. Stop calling tools and produce your final answer now. If you cannot complete the task, summarize what you accomplished so far."
)

_TOOL_FREQ_HARD_STOP_MSG = "[FORCED STOP] Tool {tool_name} called {count} times — exceeded the per-tool safety limit. Producing final answer with results collected so far."


@dataclass
class _RepeatChain:
    """One thread's consecutive-repeat chain (Layer 1 state).

    ``turn_marker`` pins the human message this chain started under; a
    different marker on a later response means the user reframed the work and
    the chain restarts. ``reminded_tiers`` remembers which escalation tiers
    already fired for the current chain so each reminds at most once.
    ``failed_repeats`` counts consecutive repeats whose previous attempt
    failed — the denial-aware early break escalates on these immediately.
    """

    key: str
    count: int
    turn_marker: str | None
    reminded_tiers: set[int] = field(default_factory=set)
    failed_repeats: int = 0


class LoopDetectionMiddleware(AgentMiddleware[AgentState]):
    """Detects and breaks repetitive tool call loops.

    Args:
        reminder_thresholds: Consecutive identical tool-call counts that
            inject an escalating reminder. The first tier sends a gentle
            nudge; later tiers send a detailed reminder quoting the canonical
            arguments. Default: ``(3, 5, 8)``.
        hard_limit: Consecutive identical tool-call count at which
            tool_calls are stripped and a final answer is forced. Must be
            >= ``max(reminder_thresholds)``. Default: 12.
        window_size: Legacy Layer 1 sliding-window size, retained only as
            the floor for the Layer 2 frequency window. Default: 20.
        max_tracked_threads: Maximum number of thread chain states to keep
            before evicting the least recently used. Default: 100.
        tool_freq_warn: Maximum number of same-tool-type calls within a
            sliding window of ``_tool_freq_window`` before injecting a
            frequency warning. Catches cross-file read loops that
            chain-based detection misses. Default: 30 (within a window
            of 50).
        tool_freq_hard_limit: Maximum number of same-tool-type calls within
            a sliding window of ``_tool_freq_window`` before forcing a
            stop. Default: 50 (within a window of 50).
        tool_freq_overrides: Per-tool overrides for frequency thresholds,
            keyed by tool name. Each value is a ``(warn, hard_limit)`` tuple
            that replaces ``tool_freq_warn`` / ``tool_freq_hard_limit`` for
            that specific tool. Tools not listed here fall back to the global
            thresholds. Useful for raising limits on intentionally
            high-frequency tools (e.g. ``bash`` in batch pipelines) without
            weakening protection on all other tools. Default: ``None``
            (no overrides).
        arguments_preview_chars: Cap on canonical-argument characters quoted
            inside a detailed reminder. Detection always compares full
            canonical arguments; this bounds only the model-visible preview.
            Default: 400.

    Threshold parameters are validated upstream by :class:`LoopDetectionConfig`;
    construct via :meth:`from_config` to ensure values pass Pydantic validation.
    The constructor re-validates and fails loud — a misconfigured threshold
    never silently falls back.
    """

    def __init__(
        self,
        reminder_thresholds: int | list[int] | tuple[int, ...] | None = None,
        hard_limit: int = _DEFAULT_HARD_LIMIT,
        window_size: int = _DEFAULT_WINDOW_SIZE,
        max_tracked_threads: int = _DEFAULT_MAX_TRACKED_THREADS,
        tool_freq_warn: int = _DEFAULT_TOOL_FREQ_WARN,
        tool_freq_hard_limit: int = _DEFAULT_TOOL_FREQ_HARD_LIMIT,
        tool_freq_overrides: dict[str, tuple[int, int]] | None = None,
        arguments_preview_chars: int = _DEFAULT_ARGUMENTS_PREVIEW_CHARS,
    ):
        super().__init__()
        if reminder_thresholds is None:
            thresholds: list[int] = list(_DEFAULT_REMINDER_THRESHOLDS)
        elif isinstance(reminder_thresholds, int):
            thresholds = [reminder_thresholds]
        else:
            thresholds = list(reminder_thresholds)
        if not thresholds:
            raise ValueError("reminder_thresholds must not be empty")
        if any(not isinstance(t, int) or t < 2 for t in thresholds):
            raise ValueError("every reminder threshold must be an integer >= 2")
        if len(set(thresholds)) != len(thresholds):
            raise ValueError("reminder_thresholds must not contain duplicates")
        self.reminder_thresholds = sorted(thresholds)
        self._reminder_threshold_set = frozenset(self.reminder_thresholds)
        self._first_reminder_threshold = self.reminder_thresholds[0]
        if hard_limit < self.reminder_thresholds[-1]:
            raise ValueError("hard_limit must be >= max(reminder_thresholds)")
        if not isinstance(arguments_preview_chars, int) or arguments_preview_chars < 1:
            raise ValueError("arguments_preview_chars must be an integer >= 1")
        self.hard_limit = hard_limit
        self.window_size = window_size
        self.max_tracked_threads = max_tracked_threads
        self.tool_freq_warn = tool_freq_warn
        self.tool_freq_hard_limit = tool_freq_hard_limit
        self.arguments_preview_chars = arguments_preview_chars
        self._tool_freq_overrides: dict[str, tuple[int, int]] = tool_freq_overrides or {}
        # Layer 2's windowed frequency count can never exceed the deque length,
        # so the deque MUST be at least as long as the largest hard limit it is
        # compared against — otherwise the hard-stop branch is dead code. Do NOT
        # reuse Layer 1's legacy ``window_size`` (which is unrelated and defaults
        # below the freq thresholds, e.g. 20 < hard 50); size the frequency
        # window to the largest hard limit in play (global + every per-tool
        # override) so a tight burst can actually reach it while spread-out
        # calls still decay out of the window. Warn thresholds are intentionally
        # excluded: a sane config enforces warn <= hard (covered by sizing to
        # hard), and a misconfig with warn > hard would hard-stop first anyway,
        # so an unreachable warn is harmless and must not inflate the window.
        self._tool_freq_window = max(
            self.window_size,
            self.tool_freq_hard_limit,
            *(hard for _, hard in self._tool_freq_overrides.values()),
        )
        self._lock = threading.Lock()
        self._chains: OrderedDict[str, _RepeatChain] = OrderedDict()
        # Windowed per-tool-type frequency: recent tool names per thread,
        # trimmed to ``window_size`` so the count decays instead of growing
        # monotonically (replaces the old monotonic ``_tool_freq`` integer).
        self._tool_name_history: defaultdict[str, deque[str]] = defaultdict(deque)
        # Per-thread Counter mirroring the deque so freq_count is O(1) instead
        # of scanning the whole window on every tool call. A single high
        # per-tool override (e.g. bash: {hard_limit: 1000}) inflates the window
        # globally, so the scan would cost 1000 per call for every tool; Counter
        # increments on append and decrements on popleft.
        self._tool_name_counter: defaultdict[str, Counter[str]] = defaultdict(Counter)
        # Per-thread set of tool names already warned about in Layer 2, so a
        # frequency warning is enqueued once rather than on every subsequent
        # call. Cleared per name when the windowed count decays back below the
        # warn threshold, mirroring the chain-layer tier bookkeeping.
        self._tool_freq_warned: dict[str, set[str]] = defaultdict(set)
        # Per-thread/run queue of warnings to inject at the next model call.
        # Populated by ``after_model`` (detection) and drained by
        # ``wrap_model_call`` (injection); see module docstring.
        self._pending_warnings: dict[tuple[str, str], list[str]] = defaultdict(list)
        self._pending_warning_touch_order: OrderedDict[tuple[str, str], None] = OrderedDict()
        self._max_pending_warning_keys = max(1, self.max_tracked_threads * 2)
        # Stop reason set when a hard-stop fires (#3875 Phase 2). Keyed by run_id
        # (matching ``TokenBudgetMiddleware``) and bounded — the lead agent's
        # middleware instance is long-lived across many runs, so without a cap
        # an entry would accumulate for every looped lead run. Intentionally NOT
        # cleared by ``after_agent``/``_clear_current_run_pending_warnings`` so
        # the subagent executor can consume it after the run returns; ``reset()``
        # still drops it.
        self._stop_reason: BoundedDict[str, str] = BoundedDict(1000)

    @classmethod
    def from_config(cls, config: LoopDetectionConfig) -> LoopDetectionMiddleware:
        """Construct from a Pydantic-validated config, trusting its validation."""
        return cls(
            reminder_thresholds=config.reminder_thresholds,
            hard_limit=config.hard_limit,
            window_size=config.window_size,
            max_tracked_threads=config.max_tracked_threads,
            tool_freq_warn=config.tool_freq_warn,
            tool_freq_hard_limit=config.tool_freq_hard_limit,
            tool_freq_overrides={name: (o.warn, o.hard_limit) for name, o in config.tool_freq_overrides.items()},
            arguments_preview_chars=config.arguments_preview_chars,
        )

    def _get_thread_id(self, runtime: Runtime) -> str:
        """Extract thread_id from runtime context for per-thread tracking."""
        thread_id = runtime.context.get("thread_id") if runtime.context else None
        if thread_id:
            return str(thread_id)
        return "default"

    def _get_run_id(self, runtime: Runtime) -> str:
        """Extract run_id from runtime context for per-run warning scoping.

        Keyed by presence, not truthiness: ``SubagentExecutor`` sets
        ``context["run_id"] = self.run_id`` unconditionally (no truthiness
        guard), so an embedded/TUI-dispatched subagent — whose ``run_id`` is
        never assigned per ``AGENTS.md``'s description of the embedded
        ``QiLinClient`` — runs with a context that legitimately carries
        ``run_id=None`` (the key is *present*, not absent). The executor
        later reads the stop reason back with the raw attribute,
        ``consume_stop_reason(self.run_id)``, so this must return exactly
        that value (``None`` included) when the key is present, rather than
        collapsing it to a shared fallback indistinguishable from an absent
        key. A truthiness check (``if run_id:``) previously conflated
        "present but None/falsy" with "absent", both mapping to the same
        literal ``"default"`` — so a genuine ``run_id=None`` hard-stop was
        recorded under ``"default"`` here but looked up under ``None`` by
        the executor, silently losing the ``loop_capped`` stop reason.
        Mirrors ``TokenBudgetMiddleware._get_run_id``.
        """
        ctx = getattr(runtime, "context", None)
        if isinstance(ctx, dict) and "run_id" in ctx:
            return ctx["run_id"]
        # Fallback to runtime object ID to prevent collisions across embedded client runs
        return str(id(runtime))

    def consume_stop_reason(self, run_id: str | None) -> str | None:
        """Pop and return the stop reason the hard-stop set for this run.

        Returns ``"loop_capped"`` when a repeated tool-call loop tripped the hard
        stop during the run — the run still completed with a forced final answer
        (the hard stop strips ``tool_calls`` rather than raising). The subagent
        executor calls this after the run returns so a loop-capped completion
        carries ``stop_reason=loop_capped`` to the lead instead of looking like
        a clean ``completed``. Mirrors ``TokenBudgetMiddleware.consume_stop_reason``;
        popping keeps the dict from accumulating on a reused instance.
        """
        with self._lock:
            return self._stop_reason.pop(run_id, None)

    def _pending_key(self, runtime: Runtime) -> tuple[str, str]:
        """Return the pending-warning key for the current thread/run."""
        return self._get_thread_id(runtime), self._get_run_id(runtime)

    def _evict_if_needed(self) -> None:
        """Evict least recently used threads if over the limit.

        Must be called while holding self._lock.
        """
        while len(self._chains) > self.max_tracked_threads:
            evicted_id, _ = self._chains.popitem(last=False)
            self._tool_name_history.pop(evicted_id, None)
            self._tool_name_counter.pop(evicted_id, None)
            self._tool_freq_warned.pop(evicted_id, None)
            for key in list(self._pending_warnings):
                if key[0] == evicted_id:
                    self._drop_pending_warning_key_locked(key)
            logger.debug("Evicted loop tracking for thread %s (LRU)", evicted_id)

    def _drop_pending_warning_key_locked(self, key: tuple[str, str]) -> None:
        """Drop all pending-warning bookkeeping for one thread/run key.

        Must be called while holding self._lock.
        """
        self._pending_warnings.pop(key, None)
        self._pending_warning_touch_order.pop(key, None)

    def _touch_pending_warning_key_locked(self, key: tuple[str, str]) -> None:
        """Mark a pending-warning key as recently used.

        Must be called while holding self._lock.
        """
        self._pending_warning_touch_order[key] = None
        self._pending_warning_touch_order.move_to_end(key)

    def _prune_pending_warning_state_locked(self, protected_key: tuple[str, str]) -> None:
        """Cap pending-warning state across abnormal or concurrent runs.

        Must be called while holding self._lock.
        """
        overflow = len(self._pending_warning_touch_order) - self._max_pending_warning_keys
        if overflow <= 0:
            return

        candidates = [key for key in self._pending_warning_touch_order if key != protected_key]
        for key in candidates[:overflow]:
            self._drop_pending_warning_key_locked(key)

    def _queue_pending_warning(self, runtime: Runtime, warning: str) -> None:
        """Queue one transient warning for the current thread/run with caps."""
        pending_key = self._pending_key(runtime)
        with self._lock:
            warnings = self._pending_warnings[pending_key]
            if warning not in warnings:
                warnings.append(warning)
            if len(warnings) > _MAX_PENDING_WARNINGS_PER_RUN:
                del warnings[: len(warnings) - _MAX_PENDING_WARNINGS_PER_RUN]
            self._touch_pending_warning_key_locked(pending_key)
            self._prune_pending_warning_state_locked(protected_key=pending_key)

    def _track_and_check(self, state: AgentState, runtime: Runtime) -> tuple[str | None, bool]:
        """Track tool calls and check for loops.

        Two detection layers:
          1. **Chain-based** (Layer 1): catches *consecutive* identical
             tool-call sets — the canonical identity repeats back-to-back.
          2. **Frequency-based** (Layer 2): catches the same *tool type*
             being called many times with varying arguments (e.g.
             ``read_file`` on 40 different files).

        Returns:
            (warning_message_or_none, should_hard_stop)
        """
        messages = state.get("messages", [])
        if not messages:
            return None, False

        last_msg = messages[-1]
        if getattr(last_msg, "type", None) != "ai":
            return None, False

        tool_calls = getattr(last_msg, "tool_calls", None)
        if not tool_calls:
            return None, False

        thread_id = self._get_thread_id(runtime)
        call_key = _canonical_call_set_key(tool_calls)

        with self._lock:
            # Touch / create entry (move to end for LRU)
            if thread_id in self._chains:
                self._chains.move_to_end(thread_id)
            else:
                self._evict_if_needed()

            chain = self._chains.get(thread_id)
            turn_marker = _nearest_turn_marker(messages)
            if (
                chain is not None
                and chain.turn_marker is not None
                and turn_marker is not None
                and turn_marker != chain.turn_marker
            ):
                # A newer user message reframed the work; repetition across a
                # user turn is not a loop. Unknown markers (missing ids) on
                # either side skip the reset rather than guess.
                chain = None

            if chain is not None and chain.key == call_key:
                chain.count += 1
            else:
                chain = _RepeatChain(key=call_key, count=1, turn_marker=turn_marker)
            self._chains[thread_id] = chain
            count = chain.count
            tool_names = [tc.get("name", "?") for tc in tool_calls]

            # --- Layer 1: consecutive identical call sets ---
            if count >= self.hard_limit:
                logger.error(
                    "Consecutive identical tool-call chain reached the hard limit — forcing stop",
                    extra={
                        "thread_id": thread_id,
                        "call_key": call_key[:200],
                        "count": count,
                        "tools": tool_names,
                    },
                )
                return _hard_stop_message(count), True

            # Denial-aware early break: when the previous identical attempt
            # failed (read-before-write gate rejection, permission denial,
            # tool error), the repetition is already futile at the second
            # attempt — remind now, and on every further failed repeat,
            # instead of waiting for the reminder ladder. A successful
            # attempt clears the streak and hands control back to the ladder.
            if count >= 2 and _previous_attempt_failed(messages):
                chain.failed_repeats += 1
                logger.warning(
                    "Chain repeats a failed attempt — injecting denied-repeat reminder",
                    extra={
                        "thread_id": thread_id,
                        "call_key": call_key[:200],
                        "count": count,
                        "failed_repeats": chain.failed_repeats,
                        "tools": tool_names,
                    },
                )
                return _DENIED_REPEAT_REMINDER, False
            chain.failed_repeats = 0

            if count in self._reminder_threshold_set and count not in chain.reminded_tiers:
                chain.reminded_tiers.add(count)
                if count == self._first_reminder_threshold:
                    message = _GENTLE_REMINDER
                    tier = "gentle"
                else:
                    message = _detailed_reminder(call_key, count, self.arguments_preview_chars)
                    tier = "detailed"
                logger.warning(
                    "Consecutive identical tool-call chain — injecting %s reminder",
                    tier,
                    extra={
                        "thread_id": thread_id,
                        "call_key": call_key[:200],
                        "count": count,
                        "tools": tool_names,
                    },
                )
                return message, False

            # --- Layer 2: per-tool-type frequency (windowed) ---
            tool_name_history = self._tool_name_history[thread_id]
            name_counter = self._tool_name_counter[thread_id]
            for tc in tool_calls:
                name = tc.get("name", "")
                if not name:
                    continue
                # Windowed counting: append the name and trim to the frequency
                # window (>= the largest threshold) so the count can reach the
                # warn/hard limits on a tight burst yet still decay for
                # spread-out calls. A mirrored Counter gives O(1) freq_count
                # even when a per-tool override inflates the window globally.
                tool_name_history.append(name)
                name_counter[name] += 1
                while len(tool_name_history) > self._tool_freq_window:
                    old = tool_name_history.popleft()
                    c = name_counter[old] - 1
                    if c <= 0:
                        del name_counter[old]
                    else:
                        name_counter[old] = c
                freq_count = name_counter.get(name, 0)

                if name in self._tool_freq_overrides:
                    eff_warn, eff_hard = self._tool_freq_overrides[name]
                else:
                    eff_warn, eff_hard = self.tool_freq_warn, self.tool_freq_hard_limit

                if freq_count >= eff_hard:
                    logger.error(
                        "Tool frequency hard limit reached — forcing stop",
                        extra={
                            "thread_id": thread_id,
                            "tool_name": name,
                            "count": freq_count,
                        },
                    )
                    return _TOOL_FREQ_HARD_STOP_MSG.format(tool_name=name, count=freq_count), True

                if freq_count >= eff_warn:
                    freq_warned = self._tool_freq_warned[thread_id]
                    if name not in freq_warned:
                        freq_warned.add(name)
                        logger.warning(
                            "Tool frequency warning — too many calls to same tool type",
                            extra={
                                "thread_id": thread_id,
                                "tool_name": name,
                                "count": freq_count,
                            },
                        )
                        return _TOOL_FREQ_WARNING_MSG.format(tool_name=name, count=freq_count), False
                else:
                    # Windowed count decayed below the warn threshold; allow a
                    # future burst of this tool to warn again.
                    self._tool_freq_warned[thread_id].discard(name)

        return None, False

    @staticmethod
    def _append_text(content: str | list | None, text: str) -> str | list:
        """Append *text* to AIMessage content, handling str, list, and None.

        When content is a list of content blocks (e.g. Anthropic thinking mode),
        we append a new ``{"type": "text", ...}`` block instead of concatenating
        a string to a list, which would raise ``TypeError``.
        """
        if content is None:
            return text
        if isinstance(content, list):
            return [*content, {"type": "text", "text": f"\n\n{text}"}]
        if isinstance(content, str):
            return content + f"\n\n{text}"
        # Fallback: coerce unexpected types to str to avoid TypeError
        return str(content) + f"\n\n{text}"

    @staticmethod
    def _build_hard_stop_update(last_msg, content: str | list) -> dict:
        """Clear tool-call metadata so forced-stop messages serialize as plain assistant text."""
        update = {
            "tool_calls": [],
            "content": content,
        }

        additional_kwargs = dict(getattr(last_msg, "additional_kwargs", {}) or {})
        for key in ("tool_calls", "function_call"):
            additional_kwargs.pop(key, None)
        update["additional_kwargs"] = additional_kwargs

        response_metadata = deepcopy(getattr(last_msg, "response_metadata", {}) or {})
        if response_metadata.get("finish_reason") == "tool_calls":
            response_metadata["finish_reason"] = "stop"
        update["response_metadata"] = response_metadata

        return update

    def _apply(self, state: AgentState, runtime: Runtime) -> dict | None:
        warning, hard_stop = self._track_and_check(state, runtime)

        if hard_stop:
            # Record the stop reason so the executor can surface
            # ``stop_reason=loop_capped`` after the run returns (#3875 Phase 2).
            # The hard stop does not raise — it strips tool_calls and lets the
            # run finish with a forced final answer — so without this the caller
            # would see a clean ``completed``. See ``consume_stop_reason``.
            # Written under the lock to match ``TokenBudgetMiddleware``: the lead
            # agent's middleware instance is shared across concurrent Gateway
            # threads, so the bounded-dict write needs the same guard.
            run_id = self._get_run_id(runtime)
            with self._lock:
                self._stop_reason[run_id] = "loop_capped"
            # Also write to runtime.context so the lead worker can read it
            # without needing a reference to this middleware instance (#4176).
            ctx = getattr(runtime, "context", None)
            if isinstance(ctx, dict):
                ctx["stop_reason"] = "loop_capped"
            # Strip tool_calls from the last AIMessage to force text output.
            # Once tool_calls are stripped, the AIMessage no longer requires
            # matching ToolMessage responses, so mutating it in place here
            # is safe for OpenAI/Moonshot pairing validators.
            messages = state.get("messages", [])
            last_msg = messages[-1]
            content = self._append_text(last_msg.content, warning or _hard_stop_message(self.hard_limit))
            stripped_msg = last_msg.model_copy(update=self._build_hard_stop_update(last_msg, content))
            return {"messages": [stripped_msg]}

        if warning:
            # Defer injection to the next model call. We must NOT alter the
            # AIMessage(tool_calls=...) here (would put framework words in
            # the model's mouth, polluting downstream consumers like
            # MemoryMiddleware), nor insert a separate non-tool message
            # (would break OpenAI/Moonshot tool-call pairing because the
            # tools node has not produced ToolMessage responses yet). The
            # warning is delivered via ``wrap_model_call`` below.
            self._queue_pending_warning(runtime, warning)
            return None

        return None

    def _clear_other_run_pending_warnings(self, runtime: Runtime) -> None:
        """Drop stale pending warnings for previous runs in this thread."""
        thread_id, current_run_id = self._pending_key(runtime)
        with self._lock:
            for key in list(self._pending_warnings):
                if key[0] == thread_id and key[1] != current_run_id:
                    self._drop_pending_warning_key_locked(key)

    def _clear_current_run_pending_warnings(self, runtime: Runtime) -> None:
        """Drop pending warnings owned by the current thread/run."""
        pending_key = self._pending_key(runtime)
        with self._lock:
            self._drop_pending_warning_key_locked(pending_key)

    @staticmethod
    def _format_warning_message(warnings: list[str]) -> str:
        """Merge pending warnings into one prompt message."""
        deduped = list(dict.fromkeys(warnings))
        return "\n\n".join(deduped)

    @override
    def before_agent(self, state: AgentState, runtime: Runtime) -> dict | None:
        self._clear_other_run_pending_warnings(runtime)
        return None

    @override
    async def abefore_agent(self, state: AgentState, runtime: Runtime) -> dict | None:
        self._clear_other_run_pending_warnings(runtime)
        return None

    @override
    def after_model(self, state: AgentState, runtime: Runtime) -> dict | None:
        return self._apply(state, runtime)

    @override
    async def aafter_model(self, state: AgentState, runtime: Runtime) -> dict | None:
        return self._apply(state, runtime)

    @override
    def after_agent(self, state: AgentState, runtime: Runtime) -> dict | None:
        self._clear_current_run_pending_warnings(runtime)
        return None

    @override
    async def aafter_agent(self, state: AgentState, runtime: Runtime) -> dict | None:
        self._clear_current_run_pending_warnings(runtime)
        return None

    def _drain_pending_warnings(self, runtime: Runtime) -> list[str]:
        """Pop and return all queued warnings for *runtime*'s thread/run."""
        pending_key = self._pending_key(runtime)
        with self._lock:
            warnings = self._pending_warnings.pop(pending_key, [])
            self._pending_warning_touch_order.pop(pending_key, None)
        return warnings

    def _augment_request(self, request: ModelRequest) -> ModelRequest:
        """Append queued loop warnings (if any) to the outgoing message list.

        The warning is placed *after* every existing message, including the
        ToolMessage responses to the previous AIMessage(tool_calls). This
        keeps ``assistant tool_calls -> tool_messages`` pairing intact for
        OpenAI/Moonshot, avoids the Anthropic mid-stream SystemMessage
        restriction (we use HumanMessage), and never mutates an existing
        AIMessage.
        """
        warnings = self._drain_pending_warnings(request.runtime)
        if not warnings:
            return request
        new_messages = [
            *request.messages,
            HumanMessage(content=self._format_warning_message(warnings), name="loop_warning"),
        ]
        return request.override(messages=new_messages)

    @override
    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelCallResult:
        return handler(self._augment_request(request))

    @override
    async def awrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], Awaitable[ModelResponse]],
    ) -> ModelCallResult:
        return await handler(self._augment_request(request))

    def reset(self, thread_id: str | None = None) -> None:
        """Clear tracking state. If thread_id given, clear only that thread."""
        with self._lock:
            if thread_id:
                self._chains.pop(thread_id, None)
                self._tool_name_history.pop(thread_id, None)
                self._tool_name_counter.pop(thread_id, None)
                self._tool_freq_warned.pop(thread_id, None)
                for key in list(self._pending_warnings):
                    if key[0] == thread_id:
                        self._drop_pending_warning_key_locked(key)
            else:
                self._chains.clear()
                self._tool_name_history.clear()
                self._tool_name_counter.clear()
                self._tool_freq_warned.clear()
                self._pending_warnings.clear()
                self._pending_warning_touch_order.clear()
                self._stop_reason.clear()
