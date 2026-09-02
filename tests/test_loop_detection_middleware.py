"""Unit tests for the loop detection middleware's consecutive-chain semantics.

Covers the 2026-09 redesign: Layer 1 tracks the *consecutive* chain of
identical tool-call sets with exact argument canonicalization (no line-range
folding), escalates gentle → detailed reminders, resets on a new human turn,
and keeps Layer 2's windowed per-tool frequency guard unchanged.
"""

from types import SimpleNamespace

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from pydantic import ValidationError

from qilin.agents.middlewares.loop_detection_middleware import (
    LoopDetectionMiddleware,
    _canonical_call_set_key,
    _detailed_reminder,
    _nearest_turn_marker,
)
from qilin.config.loop_detection_config import LoopDetectionConfig

RUNTIME = SimpleNamespace(context={"thread_id": "t1", "run_id": "r1"})


def ai_response(*calls):
    """AIMessage whose tool_calls carry the given ``(name, args)`` pairs."""
    return AIMessage(
        content="",
        tool_calls=[
            {"name": name, "args": args, "id": f"call_{i}"} for i, (name, args) in enumerate(calls)
        ],
    )


def read_call(path, start, end, description="look"):
    return ("read_file", {"description": description, "path": path, "start_line": start, "end_line": end})


def track(middleware, messages):
    """Run one after_model detection pass over ``messages``."""
    return middleware._track_and_check({"messages": messages}, RUNTIME)


def run_chain(middleware, call, n):
    """Feed ``n`` consecutive identical responses; return per-response ``(warning, hard)``."""
    results = []
    messages = [HumanMessage(content="go", id="h1")]
    for _ in range(n):
        messages.append(ai_response(call))
        results.append(track(middleware, messages))
        messages.append(ToolMessage(content="ok", tool_call_id="call_0"))
    return results


class TestCanonicalIdentity:
    def test_property_order_and_description_are_irrelevant(self):
        a = _canonical_call_set_key(
            [{"name": "read_file", "args": {"path": "f", "start_line": 1, "end_line": 2, "description": "x"}}]
        )
        b = _canonical_call_set_key(
            [{"name": "read_file", "args": {"description": "y", "end_line": 2, "start_line": 1, "path": "f"}}]
        )
        assert a == b

    def test_exact_line_ranges_participate(self):
        a = _canonical_call_set_key([{"name": "read_file", "args": {"path": "f", "start_line": 1, "end_line": 2}}])
        b = _canonical_call_set_key([{"name": "read_file", "args": {"path": "f", "start_line": 1, "end_line": 3}}])
        assert a != b

    def test_call_multiset_is_order_independent(self):
        grep = {"name": "grep", "args": {"pattern": "p"}}
        ls = {"name": "ls", "args": {"path": "/"}}
        assert _canonical_call_set_key([grep, ls]) == _canonical_call_set_key([ls, grep])

    def test_nearest_turn_marker_skips_tool_and_ai_messages(self):
        messages = [
            HumanMessage(content="go", id="h1"),
            AIMessage(content="", tool_calls=[]),
            ToolMessage(content="ok", tool_call_id="c"),
            AIMessage(content=""),
        ]
        assert _nearest_turn_marker(messages) == "h1"

    def test_nearest_turn_marker_without_id_is_none(self):
        assert _nearest_turn_marker([HumanMessage(content="go"), AIMessage(content="")]) is None


class TestChainSemantics:
    def test_progressive_region_reads_never_trip(self):
        """The old 200-line bucket false positive: nearby ranges are distinct keys."""
        mw = LoopDetectionMiddleware()
        messages = [HumanMessage(content="go", id="h1")]
        for call in (
            read_call("f.py", 401, 600),
            read_call("f.py", 528, 585),
            read_call("f.py", 528, 590),
        ):
            messages.append(ai_response(call))
            assert track(mw, messages) == (None, False)
            messages.append(ToolMessage(content="ok", tool_call_id="call_0"))

    def test_description_only_differences_still_count_as_repeats(self):
        mw = LoopDetectionMiddleware()
        results = run_chain(
            mw,
            read_call("f.py", 528, 585),
            3,
        )
        assert results[0] == (None, False)
        assert results[1] == (None, False)
        # 3rd consecutive identical operation (descriptions differ) → gentle.
        assert results[2][0] is not None and "REPEATED TOOL CALLS" in results[2][0]
        assert results[2][1] is False

    def test_interleaved_different_call_resets_the_chain(self):
        """A different tracked call resets; no window accumulation of non-adjacent repeats."""
        mw = LoopDetectionMiddleware()
        a = read_call("f.py", 10, 20)
        b = read_call("f.py", 30, 40)
        messages = [HumanMessage(content="go", id="h1")]
        outcomes = []
        for call in (a, b, a, b, a, a, a):
            messages.append(ai_response(call))
            outcomes.append(track(mw, messages))
            messages.append(ToolMessage(content="ok", tool_call_id="call_0"))
        # Only the 3rd *consecutive* A (7th response overall) reminds.
        assert [warning for warning, _ in outcomes] == [None] * 6 + [outcomes[6][0]]
        assert outcomes[6][0] is not None

    def test_new_human_turn_resets_the_chain(self):
        mw = LoopDetectionMiddleware()
        call = read_call("f.py", 10, 20)
        messages = [HumanMessage(content="go", id="h1"), ai_response(call)]
        assert track(mw, messages) == (None, False)
        messages.append(ToolMessage(content="ok", tool_call_id="call_0"))
        messages.append(ai_response(call))
        assert track(mw, messages) == (None, False)  # count 2
        # New user turn: repetition across it is not a loop.
        messages.append(HumanMessage(content="reframe", id="h2"))
        messages.append(ai_response(call))
        assert track(mw, messages) == (None, False)  # reset → count 1
        messages.append(ToolMessage(content="ok", tool_call_id="call_0"))
        messages.append(ai_response(call))
        assert track(mw, messages) == (None, False)  # count 2
        messages.append(ToolMessage(content="ok", tool_call_id="call_0"))
        messages.append(ai_response(call))
        warning, hard = track(mw, messages)  # count 3 → gentle
        assert warning is not None and hard is False


class TestEscalationLadder:
    def test_gentle_then_detailed_then_hard_with_default_ladder(self):
        mw = LoopDetectionMiddleware()  # thresholds (3, 5, 8), hard 12
        results = run_chain(mw, read_call("f.py", 528, 585), 12)
        warnings = [warning for warning, _ in results]
        hards = [hard for _, hard in results]

        assert warnings[0] is None and warnings[1] is None
        # Tier 1 (gentle): no argument preview.
        assert warnings[2] is not None and "528" not in warnings[2]
        assert warnings[3] is None
        # Tier 2 (detailed): names the tool, the count, and the arguments.
        assert warnings[4] is not None
        assert "read_file" in warnings[4] and "5 consecutive" in warnings[4]
        assert '"start_line"' in warnings[4]
        assert warnings[5] is None and warnings[6] is None
        # Tier 3 (detailed at 8).
        assert warnings[7] is not None and "8 consecutive" in warnings[7]
        assert all(warnings[i] is None for i in (8, 9, 10))
        # Hard stop at 12.
        assert hards[11] is True and "FORCED STOP" in warnings[11]

    def test_detailed_reminder_caps_argument_preview(self):
        message = _detailed_reminder("x" * 1000, 5, 100)
        assert "(+900 more chars)" in message
        assert len(message) < 1000


class TestHardStop:
    def test_strips_tool_calls_and_records_loop_capped(self):
        mw = LoopDetectionMiddleware(reminder_thresholds=[2], hard_limit=3)
        call = read_call("f.py", 1, 2)
        messages = [HumanMessage(content="go", id="h1"), ai_response(call)]
        for _ in range(2):
            assert mw.after_model({"messages": messages}, RUNTIME) is None
            messages.append(ToolMessage(content="ok", tool_call_id="call_0"))
            messages.append(ai_response(call))
        result = mw.after_model({"messages": messages}, RUNTIME)
        assert result is not None and len(result["messages"]) == 1
        stripped = result["messages"][0]
        assert stripped.tool_calls == []
        assert RUNTIME.context["stop_reason"] == "loop_capped"
        assert mw.consume_stop_reason("r1") == "loop_capped"


class TestReminderInjection:
    def test_reminder_rides_after_tool_results_without_mutating_history(self):
        mw = LoopDetectionMiddleware(reminder_thresholds=[2], hard_limit=99)
        call = read_call("f.py", 1, 2)
        messages = [HumanMessage(content="go", id="h1"), ai_response(call)]
        assert mw.after_model({"messages": messages}, RUNTIME) is None  # 1st: silent
        messages.append(ToolMessage(content="ok", tool_call_id="call_0"))
        messages.append(ai_response(call))
        assert mw.after_model({"messages": messages}, RUNTIME) is None  # 2nd: reminder queued

        class FakeRequest:
            def __init__(self, runtime, msgs):
                self.runtime = runtime
                self.messages = msgs

            def override(self, messages):
                return SimpleNamespace(messages=messages)

        augmented = mw._augment_request(FakeRequest(RUNTIME, messages))
        assert augmented.messages[:-1] == messages
        assert isinstance(augmented.messages[-1], HumanMessage)
        assert "REPEATED TOOL CALLS" in augmented.messages[-1].content


class TestFrequencyLayer:
    def test_varied_arguments_still_trip_the_frequency_guard(self):
        mw = LoopDetectionMiddleware(
            reminder_thresholds=[3],
            hard_limit=99,
            tool_freq_warn=3,
            tool_freq_hard_limit=99,
            window_size=10,
        )
        messages = [HumanMessage(content="go", id="h1")]
        warning = hard = None
        for i in range(3):
            messages.append(ai_response(read_call("f.py", 10 * i, 10 * i + 5)))
            warning, hard = track(mw, messages)
            messages.append(ToolMessage(content="ok", tool_call_id="call_0"))
        # Distinct keys keep the chain at 1; the frequency layer fires at 3.
        assert warning is not None and "read_file" in warning and "3 times" in warning
        assert hard is False


class TestValidation:
    @pytest.mark.parametrize(
        "kwargs",
        [
            {"reminder_thresholds": []},
            {"reminder_thresholds": [1]},
            {"reminder_thresholds": [3, 3]},
            {"reminder_thresholds": [3, 5], "hard_limit": 4},
            {"arguments_preview_chars": 0},
        ],
    )
    def test_constructor_fails_loud(self, kwargs):
        with pytest.raises(ValueError):
            LoopDetectionMiddleware(**kwargs)

    def test_config_validator_rejects_hard_below_ladder(self):
        with pytest.raises(ValidationError):
            LoopDetectionConfig(reminder_thresholds=[3, 5, 8], hard_limit=5)

    def test_from_config_round_trip(self):
        mw = LoopDetectionMiddleware.from_config(LoopDetectionConfig())
        assert mw.reminder_thresholds == [3, 5, 8]
        assert mw.hard_limit == 12
        assert mw.arguments_preview_chars == 400
        custom = LoopDetectionConfig(reminder_thresholds=[2, 4], hard_limit=6, arguments_preview_chars=50)
        mw2 = LoopDetectionMiddleware.from_config(custom)
        assert mw2.reminder_thresholds == [2, 4]
        assert mw2.hard_limit == 6
        assert mw2.arguments_preview_chars == 50
