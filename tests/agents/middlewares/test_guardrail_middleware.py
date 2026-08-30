"""Characterization tests for ``GuardrailMiddleware`` sync/async twins (audit R6).

Pins the fail-closed / fail-open provider-error branches, the deny path, the
journal event ``action`` strings, and the denial message construction for both
``wrap_tool_call`` and ``awrap_tool_call`` before the shared decision/apply
helpers are extracted. Tests must pass unchanged after the refactor.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from langchain_core.messages import ToolMessage
from langgraph.errors import GraphBubbleUp
from langgraph.prebuilt.tool_node import ToolCallRequest

from qilin.guardrails.middleware import GuardrailMiddleware
from qilin.guardrails.provider import GuardrailDecision, GuardrailReason
from qilin.runtime.events.catalog import MIDDLEWARE_GUARDRAIL_TAG


class AllowProvider:
    def evaluate(self, gr: Any) -> GuardrailDecision:
        return GuardrailDecision(allow=True, policy_id="p-allow", reasons=[])

    async def aevaluate(self, gr: Any) -> GuardrailDecision:
        return GuardrailDecision(allow=True, policy_id="p-allow", reasons=[])


class DenyProvider:
    def __init__(self, code: str = "oap.secret", message: str = "no secrets allowed"):
        self.code = code
        self.message = message

    def _decision(self) -> GuardrailDecision:
        return GuardrailDecision(
            allow=False,
            policy_id="p-deny",
            reasons=[GuardrailReason(code=self.code, message=self.message)],
        )

    def evaluate(self, gr: Any) -> GuardrailDecision:
        return self._decision()

    async def aevaluate(self, gr: Any) -> GuardrailDecision:
        return self._decision()


class RaisingProvider:
    def evaluate(self, gr: Any) -> GuardrailDecision:
        raise RuntimeError("evaluator down")

    async def aevaluate(self, gr: Any) -> GuardrailDecision:
        raise RuntimeError("evaluator down")


class GraphBubbleUpProvider:
    def evaluate(self, gr: Any) -> GuardrailDecision:
        raise GraphBubbleUp()

    async def aevaluate(self, gr: Any) -> GuardrailDecision:
        raise GraphBubbleUp()


class NoReasonDenyProvider:
    """Deny with an empty reasons list exercises the fallback copy/code."""

    def evaluate(self, gr: Any) -> GuardrailDecision:
        return GuardrailDecision(allow=False, policy_id="p-empty", reasons=[])

    async def aevaluate(self, gr: Any) -> GuardrailDecision:
        return GuardrailDecision(allow=False, policy_id="p-empty", reasons=[])


class FakeJournal:
    def __init__(self) -> None:
        self.events: list[dict[str, Any]] = []

    def record_middleware(self, **kwargs: Any) -> None:
        self.events.append(kwargs)


def make_handler(*, async_mode: bool = False):
    calls: list[ToolCallRequest] = []
    sentinel = ToolMessage(content="executed", tool_call_id="call-1", name="bash")

    def handler(request: ToolCallRequest) -> ToolMessage:
        assert not async_mode
        calls.append(request)
        return sentinel

    async def ahandler(request: ToolCallRequest) -> ToolMessage:
        calls.append(request)
        return sentinel

    return calls, (ahandler if async_mode else handler)


@pytest.fixture()
def journal_context():
    journal = FakeJournal()
    runtime = SimpleNamespace(
        context={"thread_id": "t1", "user_role": "admin", "__run_journal": journal}
    )
    return journal, runtime


@pytest.fixture()
def request_factory(make_request):
    def _make(runtime: Any = None) -> ToolCallRequest:
        return make_request("bash", {"command": "ls"}, runtime=runtime)

    return _make


class TestSyncWrapToolCall:
    def test_allow_passes_through_without_journal_event(
        self, journal_context, request_factory
    ) -> None:
        journal, runtime = journal_context
        mw = GuardrailMiddleware(AllowProvider(), fail_closed=True)
        calls, handler = make_handler()
        request = request_factory(runtime)

        result = mw.wrap_tool_call(request, handler)

        assert calls == [request]
        assert result.content == "executed"
        assert journal.events == []  # allow path records nothing

    def test_deny_returns_error_tool_message_and_records_deny_event(
        self, journal_context, request_factory
    ) -> None:
        journal, runtime = journal_context
        mw = GuardrailMiddleware(DenyProvider(), fail_closed=True)
        calls, handler = make_handler()
        request = request_factory(runtime)

        result = mw.wrap_tool_call(request, handler)

        assert calls == []
        assert isinstance(result, ToolMessage)
        assert result.status == "error"
        assert result.tool_call_id == "call-1"
        assert result.name == "bash"
        assert result.content == (
            "Guardrail denied: tool 'bash' was blocked (oap.secret). "
            "Reason: no secrets allowed. Choose an alternative approach."
        )
        assert len(journal.events) == 1
        event = journal.events[0]
        assert event["tag"] == MIDDLEWARE_GUARDRAIL_TAG
        assert event["name"] == "GuardrailMiddleware"
        assert event["hook"] == "wrap_tool_call"
        assert event["action"] == "deny_tool_call"
        changes = event["changes"]
        assert changes["tool_name"] == "bash"
        assert changes["allow"] is False
        assert changes["policy_id"] == "p-deny"
        assert changes["reason_codes"] == ["oap.secret"]
        assert changes["reason_messages"] == ["no secrets allowed"]
        assert changes["fail_closed"] is True
        assert changes["provider_error"] is False

    def test_deny_without_reasons_uses_fallback_copy(
        self, journal_context, request_factory
    ) -> None:
        _journal, runtime = journal_context
        mw = GuardrailMiddleware(NoReasonDenyProvider(), fail_closed=True)
        calls, handler = make_handler()

        result = mw.wrap_tool_call(request_factory(runtime), handler)
        assert calls == []
        assert isinstance(result, ToolMessage)
        assert result.content == (
            "Guardrail denied: tool 'bash' was blocked (oap.denied). "
            "Reason: blocked by guardrail policy. Choose an alternative approach."
        )

    def test_provider_error_fail_closed_blocks(
        self, journal_context, request_factory
    ) -> None:
        journal, runtime = journal_context
        mw = GuardrailMiddleware(RaisingProvider(), fail_closed=True)
        calls, handler = make_handler()

        result = mw.wrap_tool_call(request_factory(runtime), handler)

        assert calls == []
        assert isinstance(result, ToolMessage)
        assert result.status == "error"
        assert "oap.evaluator_error" in result.content
        assert "guardrail provider error (fail-closed)" in result.content
        event = journal.events[0]
        assert event["action"] == "deny_tool_call"
        assert event["changes"]["provider_error"] is True
        assert event["changes"]["allow"] is False
        assert event["changes"]["reason_codes"] == ["oap.evaluator_error"]

    def test_provider_error_fail_open_allows(
        self, journal_context, request_factory
    ) -> None:
        journal, runtime = journal_context
        mw = GuardrailMiddleware(RaisingProvider(), fail_closed=False)
        calls, handler = make_handler()

        result = mw.wrap_tool_call(request_factory(runtime), handler)

        assert len(calls) == 1  # handler ran
        assert result.content == "executed"
        event = journal.events[0]
        assert event["action"] == "allow_tool_call_after_provider_error"
        assert event["changes"]["provider_error"] is True
        assert event["changes"]["allow"] is True
        assert event["changes"]["fail_closed"] is False
        assert event["changes"]["reason_codes"] == ["oap.evaluator_error"]

    def test_graph_bubble_up_from_provider_propagates(
        self, journal_context, request_factory
    ) -> None:
        _, runtime = journal_context
        mw = GuardrailMiddleware(GraphBubbleUpProvider(), fail_closed=True)
        calls, handler = make_handler()

        with pytest.raises(GraphBubbleUp):
            mw.wrap_tool_call(request_factory(runtime), handler)
        assert calls == []

    def test_missing_journal_is_noop(self, make_request) -> None:
        runtime = SimpleNamespace(context={"thread_id": "t1"})  # no __run_journal
        mw = GuardrailMiddleware(DenyProvider(), fail_closed=True)
        calls, handler = make_handler()

        result = mw.wrap_tool_call(
            make_request("bash", {"command": "ls"}, runtime=runtime), handler
        )

        assert calls == []
        assert isinstance(result, ToolMessage)


class TestAsyncWrapToolCall:
    async def test_allow_passes_through_without_journal_event(
        self, journal_context, request_factory
    ) -> None:
        journal, runtime = journal_context
        mw = GuardrailMiddleware(AllowProvider(), fail_closed=True)
        calls, handler = make_handler(async_mode=True)

        result = await mw.awrap_tool_call(request_factory(runtime), handler)

        assert calls == [request_factory(runtime)]
        assert result.content == "executed"
        assert journal.events == []

    async def test_deny_returns_error_tool_message_and_records_deny_event(
        self, journal_context, request_factory
    ) -> None:
        journal, runtime = journal_context
        mw = GuardrailMiddleware(DenyProvider(), fail_closed=True)
        calls, handler = make_handler(async_mode=True)

        result = await mw.awrap_tool_call(request_factory(runtime), handler)

        assert calls == []
        assert isinstance(result, ToolMessage)
        assert result.status == "error"
        assert result.content == (
            "Guardrail denied: tool 'bash' was blocked (oap.secret). "
            "Reason: no secrets allowed. Choose an alternative approach."
        )
        event = journal.events[0]
        assert event["action"] == "deny_tool_call"
        assert event["changes"]["provider_error"] is False
        assert event["changes"]["allow"] is False

    async def test_deny_without_reasons_uses_fallback_copy(
        self, journal_context, request_factory
    ) -> None:
        _journal, runtime = journal_context
        mw = GuardrailMiddleware(NoReasonDenyProvider(), fail_closed=True)
        calls, handler = make_handler(async_mode=True)

        result = await mw.awrap_tool_call(request_factory(runtime), handler)

        assert calls == []
        assert isinstance(result, ToolMessage)
        assert "oap.denied" in result.content
        assert "blocked by guardrail policy" in result.content

    async def test_provider_error_fail_closed_blocks(
        self, journal_context, request_factory
    ) -> None:
        journal, runtime = journal_context
        mw = GuardrailMiddleware(RaisingProvider(), fail_closed=True)
        calls, handler = make_handler(async_mode=True)

        result = await mw.awrap_tool_call(request_factory(runtime), handler)

        assert calls == []
        assert isinstance(result, ToolMessage)
        assert "guardrail provider error (fail-closed)" in result.content
        event = journal.events[0]
        assert event["action"] == "deny_tool_call"
        assert event["changes"]["provider_error"] is True

    async def test_provider_error_fail_open_allows(
        self, journal_context, request_factory
    ) -> None:
        journal, runtime = journal_context
        mw = GuardrailMiddleware(RaisingProvider(), fail_closed=False)
        calls, handler = make_handler(async_mode=True)

        result = await mw.awrap_tool_call(request_factory(runtime), handler)

        assert calls  # handler ran exactly once
        assert result.content == "executed"
        event = journal.events[0]
        assert event["action"] == "allow_tool_call_after_provider_error"
        assert event["changes"]["provider_error"] is True

    async def test_graph_bubble_up_from_provider_propagates(
        self, journal_context, request_factory
    ) -> None:
        _, runtime = journal_context
        mw = GuardrailMiddleware(GraphBubbleUpProvider(), fail_closed=True)
        calls, handler = make_handler(async_mode=True)

        with pytest.raises(GraphBubbleUp):
            await mw.awrap_tool_call(request_factory(runtime), handler)
        assert calls == []

    async def test_missing_journal_is_noop(self, make_request) -> None:
        runtime = SimpleNamespace(context={"thread_id": "t1"})
        mw = GuardrailMiddleware(DenyProvider(), fail_closed=True)
        calls, handler = make_handler(async_mode=True)

        result = await mw.awrap_tool_call(
            make_request("bash", {"command": "ls"}, runtime=runtime), handler
        )

        assert calls == []
        assert isinstance(result, ToolMessage)


def test_guardrail_request_build_carries_context_fields(
    journal_context, request_factory
) -> None:
    """The GuardrailRequest is derived from the runtime context dict."""
    _, runtime = journal_context
    captured: list[Any] = []

    class CapturingProvider(AllowProvider):
        def evaluate(self, gr):
            captured.append(gr)
            return super().evaluate(gr)

    mw = GuardrailMiddleware(CapturingProvider(), fail_closed=True, passport="agt-1")
    _calls, handler = make_handler()
    mw.wrap_tool_call(request_factory(runtime), handler)

    gr = captured[0]
    assert gr.tool_name == "bash"
    assert gr.tool_input == {"command": "ls"}
    assert gr.agent_id == "agt-1"
    assert gr.thread_id == "t1"
    assert gr.user_role == "admin"
    assert gr.tool_call_id == "call-1"
    assert gr.timestamp  # now_iso() stamped
