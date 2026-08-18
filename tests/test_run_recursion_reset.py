"""Step-budget resets for the agent run worker.

LangGraph raises :class:`GraphRecursionError` the moment a run exhausts its
``recursion_limit`` step budget, which the worker used to propagate as a hard
run error. These tests pin the new recovery behaviour: the helper that drives
one streamed turn resumes from the thread's head checkpoint with a fresh
budget so legitimately long tasks run to completion, while pathological
loops stay bounded by ``recursion_reset_limit`` and abort/cancellation
short-circuit the retry loop.
"""

from __future__ import annotations

from typing import Any, TypedDict

import pytest
from langgraph.checkpoint.memory import MemorySaver
from langgraph.errors import GraphRecursionError
from langgraph.graph import END, START, StateGraph

from qilin.config.app_config import AppConfig, SandboxConfig
from qilin.runtime.runs.worker import (
    _DEFAULT_RECURSION_RESET_LIMIT,
    _resolve_recursion_reset_limit,
    _stream_turn_with_recursion_reset,
)

# ---------------------------------------------------------------------------
# Resolver
# ---------------------------------------------------------------------------


def test_resolve_recursion_reset_limit_falls_back_to_default_when_config_missing() -> None:
    """Bare unit-test environments have no ``AppConfig``; the default applies."""

    assert _resolve_recursion_reset_limit(None) == _DEFAULT_RECURSION_RESET_LIMIT


def test_resolve_recursion_reset_limit_reads_app_config_field() -> None:
    """A real ``AppConfig`` exposes the field as written by the deployment YAML."""

    cfg = AppConfig(sandbox=SandboxConfig(use="qilin.sandbox.local:LocalSandboxProvider"))
    assert cfg.recursion_reset_limit == _DEFAULT_RECURSION_RESET_LIMIT  # field default is 3
    cfg.recursion_reset_limit = 7
    assert _resolve_recursion_reset_limit(cfg) == 7


# ---------------------------------------------------------------------------
# Helper — fake turn callables (no LangGraph runtime required)
# ---------------------------------------------------------------------------


async def test_pass_first_try() -> None:
    calls: list[tuple[Any, Any]] = []

    async def turn(payload: Any, cfg: Any) -> None:
        calls.append((payload, cfg))

    await _stream_turn_with_recursion_reset(
        turn,
        input_payload={"a": 1},
        stream_config="orig",
        resume_config="resume",
        max_resets=3,
        should_abort=lambda: False,
    )

    assert calls == [({"a": 1}, "orig")]


async def test_resume_uses_none_payload_and_resume_config() -> None:
    calls: list[tuple[Any, Any]] = []
    reset_events: list[tuple[int, int]] = []

    state = {"calls": 0}

    async def turn(payload: Any, cfg: Any) -> None:
        calls.append((payload, cfg))
        state["calls"] += 1
        if state["calls"] <= 2:
            raise GraphRecursionError("boom")

    await _stream_turn_with_recursion_reset(
        turn,
        input_payload="initial",
        stream_config="orig",
        resume_config="resume",
        max_resets=3,
        should_abort=lambda: False,
        on_reset=lambda used, budget: reset_events.append((used, budget)),
    )

    # Attempt 0 carries the user payload + the original config; every resume
    # uses ``None`` so LangGraph loads the head checkpoint + the per-attempt
    # config that clears ``checkpoint_id``/``checkpoint_map``.
    assert calls == [("initial", "orig"), (None, "resume"), (None, "resume")]
    assert reset_events == [(1, 3), (2, 3)]


async def test_budget_exhausted_propagates_recursion_error() -> None:
    state = {"calls": 0}

    async def turn(payload: Any, cfg: Any) -> None:
        state["calls"] += 1
        raise GraphRecursionError("boom")

    with pytest.raises(GraphRecursionError):
        await _stream_turn_with_recursion_reset(
            turn,
            input_payload="p",
            stream_config="c",
            resume_config="r",
            max_resets=2,
            should_abort=lambda: False,
        )

    # 1 initial + 2 retries = 3 calls before the limit stops the loop.
    assert state["calls"] == 3


async def test_max_resets_zero_disables_resets() -> None:
    """``0`` restores the legacy hard-stop behaviour (no retries)."""

    state = {"calls": 0}

    async def turn(payload: Any, cfg: Any) -> None:
        state["calls"] += 1
        raise GraphRecursionError("boom")

    with pytest.raises(GraphRecursionError):
        await _stream_turn_with_recursion_reset(
            turn,
            input_payload="p",
            stream_config="c",
            resume_config="r",
            max_resets=0,
            should_abort=lambda: False,
        )

    assert state["calls"] == 1


async def test_abort_flag_short_circuits_reset_loop() -> None:
    """A cancellation/abort that races the resume must propagate, not retry."""

    state = {"calls": 0, "abort": False}

    async def turn(payload: Any, cfg: Any) -> None:
        state["calls"] += 1
        # Flip the abort flag on the second call; the helper must see it
        # before scheduling the next resume.
        if state["calls"] == 2:
            state["abort"] = True
        raise GraphRecursionError("boom")

    with pytest.raises(GraphRecursionError):
        await _stream_turn_with_recursion_reset(
            turn,
            input_payload="p",
            stream_config="c",
            resume_config="r",
            max_resets=10,
            should_abort=lambda: state["abort"],
        )

    assert state["calls"] == 2


async def test_non_recursion_errors_propagate_immediately() -> None:
    """Only ``GraphRecursionError`` is retried; every other error passes through."""

    state = {"calls": 0}

    async def turn(payload: Any, cfg: Any) -> None:
        state["calls"] += 1
        raise ValueError("not a recursion error")

    with pytest.raises(ValueError, match="not a recursion error"):
        await _stream_turn_with_recursion_reset(
            turn,
            input_payload="p",
            stream_config="c",
            resume_config="r",
            max_resets=3,
            should_abort=lambda: False,
        )

    assert state["calls"] == 1


# ---------------------------------------------------------------------------
# Integration — exercise the actual LangGraph resume mechanics
# ---------------------------------------------------------------------------
#
# This is the strongest guard against upstream changes: if a future LangGraph
# release stops committing the head checkpoint before raising, or stops
# granting a fresh per-invocation budget on ``astream(None)``, the resume path
# stops working and this test fails. The probe used to validate the design
# (see commit history of ``worker.py``) ran the same shape against the
# installed version.


class _CountdownState(TypedDict, total=False):
    n: int


async def test_langgraph_resume_continues_with_fresh_budget() -> None:
    """A real looping graph exhausts ``recursion_limit`` then resumes cleanly."""

    call_count = {"n": 0}

    def tick(state: _CountdownState) -> dict[str, int]:
        call_count["n"] += 1
        n = state.get("n", 0)
        if n <= 1:
            return {"n": 0}  # the conditional edge routes to END next tick
        return {"n": n - 1}

    def route(state: _CountdownState) -> str:
        return END if state.get("n", 0) <= 0 else "tick"

    g = StateGraph(_CountdownState)
    g.add_node("tick", tick)
    g.add_edge(START, "tick")
    g.add_conditional_edges("tick", route)
    graph = g.compile(checkpointer=MemorySaver())

    cfg: dict[str, Any] = {"configurable": {"thread_id": "t1"}, "recursion_limit": 3}

    async def turn(payload: Any, run_config: Any) -> None:
        async for _ in graph.astream(payload, config=run_config, stream_mode="values"):
            pass

    await _stream_turn_with_recursion_reset(
        turn,
        input_payload={"n": 10},
        stream_config=cfg,
        resume_config=cfg,  # select-clearing already done by the caller in production
        max_resets=5,
        should_abort=lambda: False,
    )

    # 10 ticks total across one or more windows. The exact count is
    # implementation-defined (depends on LangGraph's +1 stop offset), but
    # it must be well above the per-invocation ``recursion_limit`` and end
    # at 0 — proving both the resume AND the state preservation.
    assert call_count["n"] > cfg["recursion_limit"], (
        f"graph completed in {call_count['n']} ticks — resume did not extend "
        f"the budget past recursion_limit={cfg['recursion_limit']}"
    )

    final_state = await graph.aget_state(cfg)
    assert final_state.values.get("n") == 0