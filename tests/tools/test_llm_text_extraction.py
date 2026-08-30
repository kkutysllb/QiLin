"""Characterization tests for the LLM content text-extraction call sites (R11).

Pins the CURRENT extraction/joining semantics of the four hand-rolled copies
(``client._extract_text``, qilinmem ``updater._extract_text``,
``channels/manager._extract_text_content``, ``tui/runtime._extract_text``) and
of ``title_middleware._strip_think_tags`` (unclosed-tag semantics), plus the
canonical helpers in ``qilin.utils.llm_text`` / ``qilin.utils.messages``. The
call-site tests must pass unchanged after the copies converge onto the
canonicals (with explicit ``separator`` parameters preserving each join
strategy).
"""

from __future__ import annotations

from types import SimpleNamespace

from qilin.utils.llm_text import extract_response_text, strip_think_blocks
from qilin.utils.messages import message_content_to_text


class TestCanonicalExtractResponseText:
    def test_str_passthrough(self) -> None:
        assert extract_response_text("hi") == "hi"

    def test_list_joined_with_newlines(self) -> None:
        assert extract_response_text(["a", "b"]) == "a\nb"

    def test_text_and_output_text_blocks(self) -> None:
        blocks = [
            {"type": "text", "text": "a"},
            {"type": "output_text", "text": "b"},
            {"type": "tool_use", "id": "x"},
        ]
        assert extract_response_text(blocks) == "a\nb"

    def test_none_and_fallback(self) -> None:
        assert extract_response_text(None) == ""
        assert extract_response_text(42) == "42"
        assert extract_response_text([]) == ""


class TestCanonicalMessageContentToText:
    def test_str_passthrough(self) -> None:
        assert message_content_to_text("hi") == "hi"

    def test_any_dict_with_text_key(self) -> None:
        # no `type` check — any dict block with a str `text` participates
        assert message_content_to_text([{"text": "a"}, {"other": 1}]) == "a"

    def test_empty_parts_skipped(self) -> None:
        assert message_content_to_text(["a", "", "b"]) == "a\nb"

    def test_fallback_str(self) -> None:
        assert message_content_to_text(None) == "None"
        assert message_content_to_text(42) == "42"


class TestClientExtractText:
    """QiLinClient._extract_text: chunk_like heuristic + grouped join."""

    def test_str_passthrough(self) -> None:
        from qilin.client import QiLinClient

        assert QiLinClient._extract_text("hello") == "hello"

    def test_all_string_list_joined_with_newlines(self) -> None:
        from qilin.client import QiLinClient

        # long blocks without JSON punctuation: full texts, newline-joined
        assert QiLinClient._extract_text(["hello world", "second part"]) == (
            "hello world\nsecond part"
        )

    def test_chunk_like_strings_glued_without_separator(self) -> None:
        from qilin.client import QiLinClient

        # short JSON-delta-looking chunks must be glued to stay parseable
        assert QiLinClient._extract_text(['{"a":', "123}"]) == '{"a":123}'

    def test_mixed_list_groups_consecutive_strings(self) -> None:
        from qilin.client import QiLinClient

        # consecutive string chunks glue together; dict blocks join with \n
        assert QiLinClient._extract_text(["a", "b", {"text": "T"}]) == "ab\nT"

    def test_dict_blocks_joined_with_newlines(self) -> None:
        from qilin.client import QiLinClient

        assert QiLinClient._extract_text([{"text": "A"}, {"text": "B"}]) == "A\nB"

    def test_edge_cases(self) -> None:
        from qilin.client import QiLinClient

        assert QiLinClient._extract_text([]) == ""
        assert QiLinClient._extract_text([{"foo": 1}]) == ""
        assert QiLinClient._extract_text(None) == "None"
        assert QiLinClient._extract_text(42) == "42"
        # a dict block without a str `text` is skipped
        assert QiLinClient._extract_text([{"text": 1}, {"text": "ok"}]) == "ok"


class TestUpdaterExtractText:
    """qilinmem updater._extract_text: grouped join, NO chunk_like heuristic."""

    def test_str_passthrough(self) -> None:
        from qilin.agents.memory.backends.qilinmem.qilinmem.core.updater import (
            _extract_text,
        )

        assert _extract_text("hello") == "hello"

    def test_all_string_list_glued(self) -> None:
        from qilin.agents.memory.backends.qilinmem.qilinmem.core.updater import (
            _extract_text,
        )

        # differs from client: no chunk_like check, strings always glue
        assert _extract_text(["hello world", "second part"]) == "hello worldsecond part"

    def test_mixed_list_groups_consecutive_strings(self) -> None:
        from qilin.agents.memory.backends.qilinmem.qilinmem.core.updater import (
            _extract_text,
        )

        assert _extract_text(["a", "b", {"text": "T"}]) == "ab\nT"

    def test_edge_cases(self) -> None:
        from qilin.agents.memory.backends.qilinmem.qilinmem.core.updater import (
            _extract_text,
        )

        assert _extract_text([]) == ""
        assert _extract_text(None) == "None"
        assert _extract_text(42) == "42"


class TestManagerExtractTextContent:
    """channels/manager._extract_text_content: no-separator join + nesting."""

    def test_str_passthrough(self) -> None:
        from app.channels.manager import _extract_text_content

        assert _extract_text_content("hi") == "hi"

    def test_blocks_joined_without_separator(self) -> None:
        from app.channels.manager import _extract_text_content

        assert _extract_text_content([{"text": "A"}, {"text": "B"}]) == "AB"
        assert _extract_text_content(["a", {"text": "B"}, "c"]) == "aBc"

    def test_nested_content_block(self) -> None:
        from app.channels.manager import _extract_text_content

        assert _extract_text_content([{"content": "C"}]) == "C"
        assert _extract_text_content([{"text": "A"}, {"content": "C"}]) == "AC"

    def test_mapping_root_text_then_content(self) -> None:
        from app.channels.manager import _extract_text_content

        assert _extract_text_content({"text": "T"}) == "T"
        assert _extract_text_content({"content": "C"}) == "C"
        assert _extract_text_content({"text": "T", "content": "C"}) == "T"

    def test_edge_cases(self) -> None:
        from app.channels.manager import _extract_text_content

        assert _extract_text_content(None) == ""
        assert _extract_text_content(42) == ""
        assert _extract_text_content([123]) == ""
        assert _extract_text_content({"text": 1}) == ""


class TestTuiExtractText:
    """tui/runtime._extract_text: None-guard, type=="text" filter, "" join."""

    def test_str_passthrough(self) -> None:
        from qilin.tui.runtime import _extract_text

        assert _extract_text("hi") == "hi"

    def test_none_guard(self) -> None:
        from qilin.tui.runtime import _extract_text

        assert _extract_text(None) == ""  # NOT "None"

    def test_string_blocks_glued(self) -> None:
        from qilin.tui.runtime import _extract_text

        assert _extract_text(["a", "b"]) == "ab"

    def test_text_typed_blocks_glued(self) -> None:
        from qilin.tui.runtime import _extract_text

        blocks = [
            {"type": "text", "text": "T1"},
            {"type": "text", "text": "T2"},
            {"type": "tool_use", "id": "x"},
        ]
        assert _extract_text(blocks) == "T1T2"

    def test_fallback_str(self) -> None:
        from qilin.tui.runtime import _extract_text

        assert _extract_text(42) == "42"


class TestTitleStripThinkTags:
    """Unclosed-tag semantics: preserve (no truncation), like the title copy."""

    @staticmethod
    def _strip(text: str) -> str:
        from qilin.agents.middlewares.title_middleware import TitleMiddleware

        # unbound call: the method only uses `text` (no instance state)
        return TitleMiddleware._strip_think_tags(SimpleNamespace(), text)

    def test_no_tags(self) -> None:
        assert self._strip("plain title") == "plain title"

    def test_complete_block_removed(self) -> None:
        assert self._strip("<think>r</think>answer") == "answer"

    def test_case_insensitive(self) -> None:
        assert self._strip("<THINK>r</THINK>answer") == "answer"

    def test_multiple_blocks(self) -> None:
        assert self._strip("a<think>r1</think>b<think>r2</think>c") == "abc"

    def test_unclosed_tag_is_preserved(self) -> None:
        # THE equivalence point with strip_think_blocks(truncate_unclosed=False)
        assert self._strip("a <think>truncated mid") == "a <think>truncated mid"

    def test_multiline_block(self) -> None:
        assert self._strip("<think>\nmulti\nline\n</think>ok") == "ok"

    def test_whitespace_stripped(self) -> None:
        assert self._strip("  <think>r</think> ans  ") == "ans"


def test_unclosed_semantics_match_canonical() -> None:
    """strip_think_blocks(truncate_unclosed=False) == title's _strip_think_tags
    for every plain-tag shape the title path consumes."""
    for text in [
        "plain",
        "<think>r</think>answer",
        "<THINK>r</THINK>answer",
        "a<think>r1</think>b<think>r2</think>c",
        "a <think>truncated mid",
        "  <think>r</think> ans  ",
        "<think>\nmulti\n</think>ok",
    ]:
        from qilin.agents.middlewares.title_middleware import TitleMiddleware

        assert TitleMiddleware._strip_think_tags(SimpleNamespace(), text) == (
            strip_think_blocks(text, truncate_unclosed=False)
        )
