"""Characterization tests for ``LLMErrorHandlingMiddleware`` sync/async retry loops.

These tests pin the *current* retry-classification, backoff-sequence, burst-rate
circuit-breaker-exemption and max-attempts behavior of ``wrap_model_call`` /
``awrap_model_call`` (audit item R2). The sync and async loops are intentionally
exercised in parallel so the shared ``_retry_decision`` extraction cannot fork
their behavior: the tests must pass unchanged before and after the refactor.

No LLM, no network: the model handler is a scripted recording fake, and the
retry sleeps / jitter draws are stubbed to make the backoff sequence
deterministic.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any

import pytest
from langchain.agents.middleware.types import ModelRequest, ModelResponse
from langchain_core.messages import AIMessage
from langgraph.errors import GraphBubbleUp

from qilin.agents.middlewares.llm_error_handling_middleware import (
    LLMErrorHandlingMiddleware,
)
from qilin.config.app_config import (
    AppConfig,
    CircuitBreakerConfig,
    LlmCallConfig,
    SandboxConfig,
)

MODULE = "qilin.agents.middlewares.llm_error_handling_middleware"


# --- Scripted exception doubles -------------------------------------------
# Classification keys off class __name__ / attributes / message text, so plain
# Exception subclasses with the right names reproduce provider errors exactly.


class ReadError(Exception):
    """httpx.ReadError twin: classified transient by class name."""


class StreamChunkTimeoutError(Exception):
    """langchain-openai chunk-gap watchdog twin: tight 2-attempt budget."""


class TransientHTTPError(Exception):
    """Generic 5xx-style error: classified transient via status_code."""


class QuotaError(Exception):
    """Insufficient-quota error: non-retriable."""


class BurstRateError(Exception):
    """limit_burst_rate 429: retriable with a dedicated 2-attempt budget."""


def make_middleware(
    *,
    failure_threshold: int = 5,
    **llm_overrides: Any,
) -> LLMErrorHandlingMiddleware:
    config = AppConfig(
        sandbox=SandboxConfig(use="qilin.sandbox.local:LocalSandboxProvider"),
        llm_call=LlmCallConfig(max_concurrent_calls=0, **llm_overrides),
        circuit_breaker=CircuitBreakerConfig(
            failure_threshold=failure_threshold,
            recovery_timeout_sec=60,
        ),
    )
    return LLMErrorHandlingMiddleware(app_config=config)


def make_request() -> ModelRequest:
    return ModelRequest(model=SimpleNamespace(), messages=[])


class ScriptedHandler:
    """Recording fake model handler: raises scripted exceptions, then succeeds."""

    def __init__(self, script: list[Any], *, async_mode: bool = False):
        self.script = list(script)
        self.calls = 0
        self.async_mode = async_mode

    def _pop(self) -> Any:
        self.calls += 1
        if not self.script:
            return ModelResponse(result=[AIMessage(content="ok")])
        step = self.script.pop(0)
        if isinstance(step, Exception):
            raise step
        return step

    def __call__(self, request: ModelRequest) -> ModelResponse:
        assert not self.async_mode
        return self._pop()

    async def __call_async__(self, request: ModelRequest) -> ModelResponse:
        return self._pop()


def make_sync_handler(script: list[Any]) -> ScriptedHandler:
    return ScriptedHandler(script)


class AsyncScriptedHandler:
    """Async twin of ScriptedHandler (awaitable call interface)."""

    def __init__(self, script: list[Any]):
        self.script = list(script)
        self.calls = 0

    async def __call__(self, request: ModelRequest) -> ModelResponse:
        self.calls += 1
        if not self.script:
            return ModelResponse(result=[AIMessage(content="ok")])
        step = self.script.pop(0)
        if isinstance(step, Exception):
            raise step
        return step


def make_async_handler(script: list[Any]) -> AsyncScriptedHandler:
    return AsyncScriptedHandler(script)


@pytest.fixture()
def backoff_stubs(monkeypatch: pytest.MonkeyPatch) -> dict[str, list[Any]]:
    """Deterministic backoff: randint returns the window high, sleeps recorded.

    With ``randint -> high`` the decorrelated-jitter windows become observable:
    each recorded sleep equals ``min(cap, max(base, seed * 3))`` for the seed
    the middleware actually used.
    """
    randint_calls: list[tuple[int, int]] = []
    sync_sleeps: list[float] = []
    async_sleeps: list[float] = []

    def fake_randint(low: int, high: int) -> int:
        randint_calls.append((low, high))
        return high

    def fake_sync_sleep(seconds: float) -> None:
        sync_sleeps.append(seconds)

    async def fake_async_sleep(seconds: float) -> None:
        async_sleeps.append(seconds)

    monkeypatch.setattr(f"{MODULE}.random.randint", fake_randint)
    monkeypatch.setattr(f"{MODULE}.time.sleep", fake_sync_sleep)
    monkeypatch.setattr(f"{MODULE}.asyncio.sleep", fake_async_sleep)
    return {
        "randint_calls": randint_calls,
        "sync_sleeps": sync_sleeps,
        "async_sleeps": async_sleeps,
    }


def fallback_of(result: Any) -> AIMessage:
    assert isinstance(result, AIMessage), type(result)
    return result


class TestSyncRetryLoop:
    def test_transient_error_then_success_after_one_retry(
        self, backoff_stubs: dict[str, list[Any]]
    ) -> None:
        mw = make_middleware()
        handler = make_sync_handler([ReadError("connection dropped")])
        request = make_request()

        result = mw.wrap_model_call(request, handler)

        assert handler.calls == 2
        assert isinstance(result, ModelResponse)
        assert result.result[0].content == "ok"
        # First retry window: seed=base(1000) -> high=min(cap(8000), 3000).
        assert backoff_stubs["randint_calls"] == [(1000, 3000)]
        assert backoff_stubs["sync_sleeps"] == [3.0]
        assert backoff_stubs["async_sleeps"] == []

    def test_backoff_window_sequence_across_attempts(
        self, backoff_stubs: dict[str, list[Any]]
    ) -> None:
        mw = make_middleware(retry_max_attempts=3)
        handler = make_sync_handler(
            [TransientHTTPError("boom")] * 3
        )  # always failing: status_code attr below
        handler.script = [
            type("E5xx", (Exception,), {"status_code": 500})("boom") for _ in range(3)
        ]

        result = mw.wrap_model_call(make_request(), handler)

        assert handler.calls == 3
        fallback = fallback_of(result)
        kwargs = fallback.additional_kwargs
        assert kwargs["qilin_error_fallback"] is True
        assert kwargs["error_reason"] == "transient"
        assert kwargs["error_type"] == "E5xx"        # Attempt 1 seeds from base(1000) -> window (1000, 3000); attempt 2
        # seeds from the previous delay (3000) -> high=min(8000, 9000)=8000.
        assert backoff_stubs["randint_calls"] == [(1000, 3000), (1000, 8000)]
        assert backoff_stubs["sync_sleeps"] == [3.0, 8.0]

    def test_non_retriable_quota_fails_fast_without_sleep(
        self, backoff_stubs: dict[str, list[Any]]
    ) -> None:
        mw = make_middleware()
        handler = make_sync_handler([QuotaError("insufficient_quota: out of credit")])

        result = mw.wrap_model_call(make_request(), handler)

        assert handler.calls == 1
        fallback = fallback_of(result)
        kwargs = fallback.additional_kwargs
        assert kwargs["error_reason"] == "quota"
        assert "out of quota" in fallback.content
        assert backoff_stubs["sync_sleeps"] == []
        assert backoff_stubs["randint_calls"] == []

    def test_burst_rate_budget_is_two_attempts_and_exempts_circuit(
        self, backoff_stubs: dict[str, list[Any]]
    ) -> None:
        mw = make_middleware(failure_threshold=1)  # single failure would trip it
        handler = make_sync_handler([BurstRateError("limit_burst_rate exceeded") for _ in range(5)])

        result = mw.wrap_model_call(make_request(), handler)

        # Dedicated burst budget: 1 first attempt + 1 retry, then shed load.
        assert handler.calls == 2
        fallback = fallback_of(result)
        assert fallback.additional_kwargs["error_reason"] == "burst_rate"
        # Burst windows: base=burst_retry_base_delay_ms(5000), seed=5000 ->
        # high=min(cap(8000), 15000)=8000 for the single burst retry.
        assert backoff_stubs["randint_calls"] == [(5000, 8000)]
        assert backoff_stubs["sync_sleeps"] == [8.0]
        # Circuit-breaker exemption: the burst failure must NOT be recorded as
        # a circuit failure (the #4290 self-inflicted-outage guarantee).
        assert mw._circuit_state == "closed"
        assert mw._circuit_failure_count == 0
        # And the next call still reaches the provider (no fast-fail).
        follow_up = make_sync_handler([])
        mw.wrap_model_call(make_request(), follow_up)
        assert follow_up.calls == 1

    def test_burst_budget_tighter_than_operator_ceiling(
        self, backoff_stubs: dict[str, list[Any]]
    ) -> None:
        mw = make_middleware(retry_max_attempts=10)
        handler = make_sync_handler([BurstRateError("limit_burst_rate") for _ in range(10)])

        mw.wrap_model_call(make_request(), handler)

        assert handler.calls == 2  # operator ceiling cannot loosen the burst budget

    def test_stream_chunk_timeout_gets_one_retry(
        self, backoff_stubs: dict[str, list[Any]]
    ) -> None:
        mw = make_middleware(retry_max_attempts=5)
        handler = make_sync_handler([StreamChunkTimeoutError("chunk gap") for _ in range(5)])

        result = mw.wrap_model_call(make_request(), handler)

        assert handler.calls == 2  # _RETRY_BUDGET_OVERRIDES["StreamChunkTimeoutError"] == 2
        fallback = fallback_of(result)
        assert fallback.additional_kwargs["error_reason"] == "transient"
        # The stream-drop exception also gets the dedicated user message.
        assert "split the work" in fallback.content or "split" in fallback.content

    def test_retry_after_header_is_honored_without_jitter(
        self, backoff_stubs: dict[str, list[Any]]
    ) -> None:
        mw = make_middleware()
        err = ReadError("429")
        err.response = SimpleNamespace(headers={"retry-after": "2"})
        handler = make_sync_handler([err])

        mw.wrap_model_call(make_request(), handler)

        assert handler.calls == 2
        assert backoff_stubs["sync_sleeps"] == [2.0]  # 2s * 1000ms, no jitter draw
        assert backoff_stubs["randint_calls"] == []

    def test_transient_failure_records_circuit_failure_and_opens_circuit(
        self, backoff_stubs: dict[str, list[Any]]
    ) -> None:
        mw = make_middleware(failure_threshold=2, retry_max_attempts=1)

        mw.wrap_model_call(make_request(), make_sync_handler([ReadError("x")]))
        assert mw._circuit_state == "closed"
        mw.wrap_model_call(make_request(), make_sync_handler([ReadError("x")]))
        assert mw._circuit_state == "open"  # threshold=2 tripped

        # Circuit open: fast-fail without touching the model.
        fresh = make_sync_handler([])
        result = mw.wrap_model_call(make_request(), fresh)
        assert fresh.calls == 0
        fallback = fallback_of(result)
        assert fallback.additional_kwargs["error_type"] == "CircuitBreakerOpen"
        assert fallback.additional_kwargs["error_reason"] == "circuit_open"
        assert "Circuit breaker is engaged" in fallback.content

    def test_graph_bubble_up_passes_through_untouched(
        self, backoff_stubs: dict[str, list[Any]]
    ) -> None:
        mw = make_middleware()
        handler = make_sync_handler([GraphBubbleUp()])

        with pytest.raises(GraphBubbleUp):
            mw.wrap_model_call(make_request(), handler)

        assert handler.calls == 1
        assert backoff_stubs["sync_sleeps"] == []
        # Control-flow signals must release (not consume) the half-open probe.
        assert mw._circuit_probe_in_flight is False


class TestAsyncRetryLoop:
    async def test_transient_error_then_success_after_one_retry(
        self, backoff_stubs: dict[str, list[Any]]
    ) -> None:
        mw = make_middleware()
        handler = make_async_handler([ReadError("connection dropped")])

        result = await mw.awrap_model_call(make_request(), handler)

        assert handler.calls == 2
        assert isinstance(result, ModelResponse)
        assert result.result[0].content == "ok"
        assert backoff_stubs["randint_calls"] == [(1000, 3000)]
        assert backoff_stubs["async_sleeps"] == [3.0]
        assert backoff_stubs["sync_sleeps"] == []

    async def test_backoff_window_sequence_across_attempts(
        self, backoff_stubs: dict[str, list[Any]]
    ) -> None:
        mw = make_middleware(retry_max_attempts=3)
        handler = make_async_handler(
            [type("E5xx", (Exception,), {"status_code": 500})("boom") for _ in range(3)]
        )

        result = await mw.awrap_model_call(make_request(), handler)

        assert handler.calls == 3
        fallback = fallback_of(result)
        assert fallback.additional_kwargs["error_reason"] == "transient"
        assert backoff_stubs["randint_calls"] == [(1000, 3000), (1000, 8000)]
        assert backoff_stubs["async_sleeps"] == [3.0, 8.0]

    async def test_non_retriable_quota_fails_fast_without_sleep(
        self, backoff_stubs: dict[str, list[Any]]
    ) -> None:
        mw = make_middleware()
        handler = make_async_handler([QuotaError("insufficient_quota")])

        result = await mw.awrap_model_call(make_request(), handler)

        assert handler.calls == 1
        fallback = fallback_of(result)
        assert fallback.additional_kwargs["error_reason"] == "quota"
        assert backoff_stubs["async_sleeps"] == []

    async def test_burst_rate_budget_is_two_attempts_and_exempts_circuit(
        self, backoff_stubs: dict[str, list[Any]]
    ) -> None:
        mw = make_middleware(failure_threshold=1)
        handler = make_async_handler([BurstRateError("limit_burst_rate") for _ in range(5)])

        result = await mw.awrap_model_call(make_request(), handler)

        assert handler.calls == 2
        fallback = fallback_of(result)
        assert fallback.additional_kwargs["error_reason"] == "burst_rate"
        assert backoff_stubs["randint_calls"] == [(5000, 8000)]
        assert backoff_stubs["async_sleeps"] == [8.0]
        assert mw._circuit_state == "closed"
        assert mw._circuit_failure_count == 0
        follow_up = make_async_handler([])
        await mw.awrap_model_call(make_request(), follow_up)
        assert follow_up.calls == 1

    async def test_stream_chunk_timeout_gets_one_retry(
        self, backoff_stubs: dict[str, list[Any]]
    ) -> None:
        mw = make_middleware(retry_max_attempts=5)
        handler = make_async_handler([StreamChunkTimeoutError("chunk gap") for _ in range(5)])

        result = await mw.awrap_model_call(make_request(), handler)

        assert handler.calls == 2
        fallback = fallback_of(result)
        assert fallback.additional_kwargs["error_reason"] == "transient"

    async def test_transient_failure_records_circuit_failure_and_opens_circuit(
        self, backoff_stubs: dict[str, list[Any]]
    ) -> None:
        mw = make_middleware(failure_threshold=2, retry_max_attempts=1)

        await mw.awrap_model_call(make_request(), make_async_handler([ReadError("x")]))
        assert mw._circuit_state == "closed"
        await mw.awrap_model_call(make_request(), make_async_handler([ReadError("x")]))
        assert mw._circuit_state == "open"

        fresh = make_async_handler([])
        result = await mw.awrap_model_call(make_request(), fresh)
        assert fresh.calls == 0
        fallback = fallback_of(result)
        assert fallback.additional_kwargs["error_type"] == "CircuitBreakerOpen"
        assert fallback.additional_kwargs["error_reason"] == "circuit_open"

    async def test_graph_bubble_up_passes_through_untouched(
        self, backoff_stubs: dict[str, list[Any]]
    ) -> None:
        mw = make_middleware()
        handler = make_async_handler([GraphBubbleUp()])

        with pytest.raises(GraphBubbleUp):
            await mw.awrap_model_call(make_request(), handler)

        assert handler.calls == 1
        assert backoff_stubs["async_sleeps"] == []
        assert mw._circuit_probe_in_flight is False


class TestRetryEventPayload:
    """The llm_retry event describes the *effective* budget, not the ceiling."""

    def test_sync_retry_event_reports_effective_max_attempts(
        self,
        backoff_stubs: dict[str, list[Any]],
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        mw = make_middleware()
        emitted: list[dict[str, Any]] = []
        monkeypatch.setattr(
            mw,
            "_emit_retry_event",
            lambda attempt, wait_ms, reason, *, max_attempts: emitted.append(
                {
                    "attempt": attempt,
                    "wait_ms": wait_ms,
                    "reason": reason,
                    "max_attempts": max_attempts,
                }
            ),
        )
        handler = make_sync_handler([BurstRateError("limit_burst_rate")])

        mw.wrap_model_call(make_request(), handler)

        assert emitted == [
            {
                "attempt": 1,
                "wait_ms": 8000,
                "reason": "burst_rate",
                "max_attempts": 2,
            }
        ]

    async def test_async_retry_event_reports_effective_max_attempts(
        self,
        backoff_stubs: dict[str, list[Any]],
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        mw = make_middleware()
        emitted: list[dict[str, Any]] = []

        async def fake_emit(
            attempt: int, wait_ms: int, reason: str, *, max_attempts: int
        ) -> None:
            emitted.append(
                {
                    "attempt": attempt,
                    "wait_ms": wait_ms,
                    "reason": reason,
                    "max_attempts": max_attempts,
                }
            )

        monkeypatch.setattr(mw, "_aemit_retry_event", fake_emit)
        handler = make_async_handler([BurstRateError("limit_burst_rate")])

        await mw.awrap_model_call(make_request(), handler)

        assert emitted == [
            {
                "attempt": 1,
                "wait_ms": 8000,
                "reason": "burst_rate",
                "max_attempts": 2,
            }
        ]


def test_sync_and_async_share_classification_tables() -> None:
    """Sync/async twins must classify the same exception identically."""
    mw = make_middleware()
    exc = BurstRateError("limit_burst_rate")
    assert mw._classify_error(exc) == (True, "burst_rate")
    assert mw._max_attempts_for(exc, "burst_rate") == 2
    assert asyncio.iscoroutinefunction(mw.awrap_model_call)
