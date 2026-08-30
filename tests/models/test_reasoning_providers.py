"""Characterization tests for the reasoning-passthrough provider adapters (R7).

Pins — per provider — the ``_extract_reasoning*`` field priority (stepfun
probes ``reasoning_content`` AND ``reasoning``; mimo only ``reasoning_content``;
both preserve empty strings), the ``_with_reasoning_content`` overwrite
semantics, and the chunk / non-streaming result capture paths. MiniMax's
structurally different pipeline (``reasoning_details`` list + inline
``<think>`` extraction + merge semantics) is pinned as-is.

These tests must pass unchanged while stepfun/mimo converge onto the shared
``qilin.models.reasoning_capture`` module; the per-provider module-level
``_extract_reasoning*`` / ``_with_reasoning_content`` names stay valid aliases.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage

import qilin.models.patched_mimo as mimo_mod
import qilin.models.patched_minimax as minimax_mod
import qilin.models.patched_stepfun as stepfun_mod
from qilin.models.patched_mimo import PatchedChatMiMo
from qilin.models.patched_minimax import PatchedChatMiniMax
from qilin.models.patched_stepfun import PatchedChatStepFun

# The sentinel is re-created per module pre-refactor; post-refactor all modules
# re-export the shared one. Tests compare by identity within one module.
STEPFUN_MISSING = stepfun_mod._MISSING
MIMO_MISSING = mimo_mod._MISSING


def make_chat_result_response(
    message_dict: dict[str, Any],
    *,
    model: str = "test-model",
) -> dict[str, Any]:
    return {
        "id": "chatcmpl-1",
        "model": model,
        "object": "chat.completion",
        "created": 1,
        "choices": [
            {
                "index": 0,
                "finish_reason": "stop",
                "message": message_dict,
            }
        ],
    }


class TestStepFunExtractor:
    def test_reasoning_content_takes_priority_over_reasoning(self) -> None:
        assert (
            stepfun_mod._extract_reasoning(
                {"reasoning": "R", "reasoning_content": "RC"}
            )
            == "RC"
        )

    def test_reasoning_field_alone_is_used(self) -> None:
        assert stepfun_mod._extract_reasoning({"reasoning": "R"}) == "R"

    def test_empty_string_is_preserved(self) -> None:
        # The `is not None` probe keeps "" (unlike a truthiness probe).
        assert stepfun_mod._extract_reasoning({"reasoning_content": ""}) == ""
        assert stepfun_mod._extract_reasoning({"reasoning": ""}) == ""

    def test_none_values_are_missing(self) -> None:
        assert (
            stepfun_mod._extract_reasoning({"reasoning": None, "reasoning_content": None})
            is STEPFUN_MISSING
        )
        assert stepfun_mod._extract_reasoning({}) is STEPFUN_MISSING

    def test_attribute_probe(self) -> None:
        assert stepfun_mod._extract_reasoning(SimpleNamespace(reasoning="attr-r")) == "attr-r"
        assert (
            stepfun_mod._extract_reasoning(
                SimpleNamespace(reasoning_content="attr-rc", reasoning="attr-r")
            )
            == "attr-rc"
        )

    def test_model_extra_probe(self) -> None:
        obj = SimpleNamespace(model_extra={"reasoning": "extra-r"})
        assert stepfun_mod._extract_reasoning(obj) == "extra-r"


class TestMiMoExtractor:
    def test_only_reasoning_content_field(self) -> None:
        assert mimo_mod._extract_reasoning_content({"reasoning_content": "RC"}) == "RC"
        # MiMo does not probe the `reasoning` alias.
        assert mimo_mod._extract_reasoning_content({"reasoning": "R"}) is MIMO_MISSING
        assert (
            mimo_mod._extract_reasoning_content(
                {"reasoning": "R", "reasoning_content": None}
            )
            is MIMO_MISSING
        )

    def test_empty_string_is_preserved(self) -> None:
        assert mimo_mod._extract_reasoning_content({"reasoning_content": ""}) == ""

    def test_attribute_and_model_extra_probe(self) -> None:
        assert (
            mimo_mod._extract_reasoning_content(SimpleNamespace(reasoning_content="a"))
            == "a"
        )
        assert (
            mimo_mod._extract_reasoning_content(
                SimpleNamespace(model_extra={"reasoning_content": "m"})
            )
            == "m"
        )


@pytest.mark.parametrize(
    "with_rc", [stepfun_mod._with_reasoning_content, mimo_mod._with_reasoning_content]
)
class TestWithReasoningContentOverwrite:
    """stepfun/mimo semantics: overwrite when different, no-op when equal."""

    def test_sets_and_overwrites(self, with_rc: Any) -> None:
        message = AIMessage(content="hi")
        patched = with_rc(message, "thinking")
        assert patched.additional_kwargs["reasoning_content"] == "thinking"
        # original untouched
        assert "reasoning_content" not in message.additional_kwargs

        overwritten = with_rc(patched, "better")
        assert overwritten.additional_kwargs["reasoning_content"] == "better"

    def test_noop_when_equal(self, with_rc: Any) -> None:
        message = AIMessage(
            content="hi", additional_kwargs={"reasoning_content": "same"}
        )
        patched = with_rc(message, "same")
        assert patched.additional_kwargs["reasoning_content"] == "same"
        assert patched is not message  # still a copy path


class TestStepFunCapturePaths:
    def test_chunk_path_captures_reasoning(self) -> None:
        mw = PatchedChatStepFun(model="step-1", api_key="k")
        chunk = mw._convert_chunk_to_generation_chunk(
            {"choices": [{"delta": {"content": "hi", "reasoning": "think-1"}}]},
            AIMessageChunk,
            None,
        )
        assert chunk is not None
        assert chunk.message.content == "hi"
        assert chunk.message.additional_kwargs["reasoning_content"] == "think-1"

    def test_chunk_path_reasoning_content_wins(self) -> None:
        mw = PatchedChatStepFun(model="step-1", api_key="k")
        chunk = mw._convert_chunk_to_generation_chunk(
            {
                "choices": [
                    {
                        "delta": {
                            "content": "hi",
                            "reasoning": "r",
                            "reasoning_content": "rc",
                        }
                    }
                ]
            },
            AIMessageChunk,
            None,
        )
        assert chunk.message.additional_kwargs["reasoning_content"] == "rc"

    def test_chunk_path_without_reasoning_is_untouched(self) -> None:
        mw = PatchedChatStepFun(model="step-1", api_key="k")
        chunk = mw._convert_chunk_to_generation_chunk(
            {"choices": [{"delta": {"content": "hi"}}]},
            AIMessageChunk,
            None,
        )
        assert chunk is not None
        assert "reasoning_content" not in chunk.message.additional_kwargs

    def test_result_path_captures_reasoning_from_dict(self) -> None:
        mw = PatchedChatStepFun(model="step-1", api_key="k")
        result = mw._create_chat_result(
            make_chat_result_response(
                {"role": "assistant", "content": "answer", "reasoning": "why"}
            )
        )
        message = result.generations[0].message
        assert isinstance(message, AIMessage)
        assert message.content == "answer"
        assert message.additional_kwargs["reasoning_content"] == "why"

    def test_result_path_falls_back_to_typed_choice_message(self) -> None:
        """dict-message without reasoning -> probe the SDK object attributes."""

        class FakeSDKMessage:
            reasoning = "typed-reasoning"

        class FakeSDKChoice:
            message = FakeSDKMessage()

        class FakeSDKResponse:
            choices = [FakeSDKChoice()]

            def model_dump(self, **_kwargs: Any) -> dict[str, Any]:
                return make_chat_result_response(
                    {"role": "assistant", "content": "answer"}
                )

        mw = PatchedChatStepFun(model="step-1", api_key="k")
        result = mw._create_chat_result(FakeSDKResponse())
        message = result.generations[0].message
        assert message.additional_kwargs["reasoning_content"] == "typed-reasoning"

    def test_request_payload_replays_reasoning_content(self) -> None:
        mw = PatchedChatStepFun(model="step-1", api_key="k")
        history = AIMessage(
            content="earlier",
            additional_kwargs={"reasoning_content": "old-reasoning"},
        )
        payload = mw._get_request_payload([HumanMessage(content="q"), history])
        assistant_payloads = [m for m in payload["messages"] if m["role"] == "assistant"]
        assert assistant_payloads[0]["reasoning_content"] == "old-reasoning"


class TestMiMoCapturePaths:
    def test_chunk_path_captures_reasoning_content(self) -> None:
        mw = PatchedChatMiMo(model="mimo", api_key="k")
        chunk = mw._convert_chunk_to_generation_chunk(
            {"choices": [{"delta": {"content": "hi", "reasoning_content": "rc-1"}}]},
            AIMessageChunk,
            None,
        )
        assert chunk is not None
        assert chunk.message.additional_kwargs["reasoning_content"] == "rc-1"
        # MiMo ignores the `reasoning` alias in deltas too.
        chunk2 = mw._convert_chunk_to_generation_chunk(
            {"choices": [{"delta": {"content": "hi", "reasoning": "r"}}]},
            AIMessageChunk,
            None,
        )
        assert chunk2 is not None
        assert "reasoning_content" not in chunk2.message.additional_kwargs

    def test_result_path_captures_reasoning_content(self) -> None:
        mw = PatchedChatMiMo(model="mimo", api_key="k")
        result = mw._create_chat_result(
            make_chat_result_response(
                {"role": "assistant", "content": "answer", "reasoning_content": "why"}
            )
        )
        assert (
            result.generations[0].message.additional_kwargs["reasoning_content"] == "why"
        )

    def test_result_path_falls_back_to_typed_choice_message(self) -> None:
        class FakeSDKMessage:
            reasoning_content = "typed-rc"

        class FakeSDKChoice:
            message = FakeSDKMessage()

        class FakeSDKResponse:
            choices = [FakeSDKChoice()]

            def model_dump(self, **_kwargs: Any) -> dict[str, Any]:
                return make_chat_result_response(
                    {"role": "assistant", "content": "answer"}
                )

        mw = PatchedChatMiMo(model="mimo", api_key="k")
        result = mw._create_chat_result(FakeSDKResponse())
        assert (
            result.generations[0].message.additional_kwargs["reasoning_content"]
            == "typed-rc"
        )

    def test_request_payload_replays_reasoning_content(self) -> None:
        mw = PatchedChatMiMo(model="mimo", api_key="k")
        history = AIMessage(
            content="earlier",
            additional_kwargs={"reasoning_content": "old-reasoning"},
        )
        payload = mw._get_request_payload([HumanMessage(content="q"), history])
        assistant_payloads = [m for m in payload["messages"] if m["role"] == "assistant"]
        assert assistant_payloads[0]["reasoning_content"] == "old-reasoning"


class TestMiniMaxPipeline:
    """MiniMax keeps its own structurally different reasoning pipeline."""

    def test_extract_reasoning_text_joins_and_strips(self) -> None:
        assert (
            minimax_mod._extract_reasoning_text([{"text": " a "}, {"text": "b"}])
            == "a\n\nb"
        )
        # blank entries are dropped
        assert minimax_mod._extract_reasoning_text([{"text": "  "}, {"text": "b"}]) == "b"
        assert minimax_mod._extract_reasoning_text([]) is None
        assert minimax_mod._extract_reasoning_text("not-a-list") is None

    def test_extract_reasoning_text_strip_parts_false_keeps_raw(self) -> None:
        assert (
            minimax_mod._extract_reasoning_text(
                [{"text": " a "}], strip_parts=False
            )
            == " a "
        )
        # whitespace-only entries are still skipped
        assert (
            minimax_mod._extract_reasoning_text([{"text": "  "}], strip_parts=False)
            is None
        )

    def test_strip_inline_think_tags(self) -> None:
        assert minimax_mod._strip_inline_think_tags("<think>r1</think>answer") == (
            "answer",
            "r1",
        )
        assert minimax_mod._strip_inline_think_tags(
            "<think> r1 </think><think>r2</think>ok"
        ) == ("ok", "r1\n\nr2")
        assert minimax_mod._strip_inline_think_tags("plain") == ("plain", None)

    def test_merge_reasoning_dedupes(self) -> None:
        assert minimax_mod._merge_reasoning("a", None, "a", "b") == "a\n\nb"
        assert minimax_mod._merge_reasoning(None, "") is None

    def test_with_reasoning_content_merge_semantics(self) -> None:
        message = AIMessage(content="x")
        out = minimax_mod._with_reasoning_content(message, "r1")
        assert out.additional_kwargs["reasoning_content"] == "r1"
        out2 = minimax_mod._with_reasoning_content(out, "r1")  # dedup
        assert out2.additional_kwargs["reasoning_content"] == "r1"
        out3 = minimax_mod._with_reasoning_content(out, "r2")
        assert out3.additional_kwargs["reasoning_content"] == "r1\n\nr2"
        # falsy reasoning is a no-op (message returned unchanged)
        assert minimax_mod._with_reasoning_content(message, None) is message

    def test_with_reasoning_content_preserve_whitespace_appends(self) -> None:
        message = AIMessage(content="x")
        out = minimax_mod._with_reasoning_content(message, "r1", preserve_whitespace=True)
        assert out.additional_kwargs["reasoning_content"] == "r1"
        out2 = minimax_mod._with_reasoning_content(
            out, "r2", preserve_whitespace=True
        )
        assert out2.additional_kwargs["reasoning_content"] == "r1r2"
        fresh = minimax_mod._with_reasoning_content(
            AIMessage(content="x", additional_kwargs={"reasoning_content": "existing"}),
            "r2",
            preserve_whitespace=True,
        )
        assert fresh.additional_kwargs["reasoning_content"] == "existingr2"

    def test_chunk_path_captures_reasoning_details(self) -> None:
        mw = PatchedChatMiniMax(model="minimax", api_key="k")
        chunk = mw._convert_chunk_to_generation_chunk(
            {
                "model": "minimax",
                "choices": [
                    {
                        "delta": {
                            "role": "assistant",
                            "content": "hi",
                            "reasoning_details": [{"text": " r "}],
                        }
                    }
                ],
            },
            AIMessageChunk,
            None,
        )
        assert chunk is not None
        assert chunk.message.content == "hi"
        assert chunk.message.additional_kwargs["reasoning_content"] == " r "
        assert chunk.message.response_metadata["model_provider"] == "openai"

    def test_result_path_merges_split_and_inline_think(self) -> None:
        mw = PatchedChatMiniMax(model="minimax", api_key="k")
        result = mw._create_chat_result(
            make_chat_result_response(
                {
                    "role": "assistant",
                    "content": "<think>inline</think>answer",
                    "reasoning_details": [{"text": "split"}],
                }
            )
        )
        message = result.generations[0].message
        assert message.content == "answer"
        assert message.additional_kwargs["reasoning_content"] == "split\n\ninline"

    def test_result_path_keeps_unclosed_think_content(self) -> None:
        mw = PatchedChatMiniMax(model="minimax", api_key="k")
        result = mw._create_chat_result(
            make_chat_result_response(
                {"role": "assistant", "content": "<think>truncated mid"}
            )
        )
        message = result.generations[0].message
        # inline think without a closing tag stays in content (extraction only)
        assert message.content == "<think>truncated mid"
        assert "reasoning_content" not in message.additional_kwargs

    def test_request_payload_sets_reasoning_split_and_strips_user_names(self) -> None:
        mw = PatchedChatMiniMax(model="minimax", api_key="k")
        payload = mw._get_request_payload(
            [HumanMessage(content="q", name="user-input")]
        )
        assert payload["extra_body"]["reasoning_split"] is True
        user_payload = next(m for m in payload["messages"] if m["role"] == "user")
        assert "name" not in user_payload
