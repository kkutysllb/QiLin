"""Patched ChatOpenAI adapter for Xiaomi MiMo reasoning_content replay.

MiMo's OpenAI-compatible API returns ``reasoning_content`` in thinking mode and
requires that value to be replayed on historical assistant messages in
multi-turn agent conversations. Standard ``langchain_openai.ChatOpenAI`` drops
that provider-specific field, which can cause HTTP 400 errors once tool calls
enter the conversation history.

The capture pipeline lives in :mod:`qilin.models.reasoning_capture`; only the
MiMo-specific field list (``reasoning_content`` only — the ``reasoning`` alias
is intentionally NOT probed) and credential wiring remain here.
"""

from __future__ import annotations

from typing import ClassVar

from langchain_openai import ChatOpenAI

from qilin.models.reasoning_capture import (
    MISSING,
    ReasoningCaptureMixin,
    make_reasoning_extractor,
    with_reasoning_content,
)

__all__ = ["PatchedChatMiMo"]

# Module-level aliases kept for backward compatibility with code (and tests)
# that import the MiMo extractor / patcher directly.
_MISSING = MISSING
_extract_reasoning_content = make_reasoning_extractor(("reasoning_content",))
_with_reasoning_content = with_reasoning_content


class PatchedChatMiMo(ReasoningCaptureMixin, ChatOpenAI):
    """ChatOpenAI with ``reasoning_content`` preservation for MiMo thinking mode."""

    reasoning_fields: ClassVar[tuple[str, ...]] = ("reasoning_content",)

    @classmethod
    def is_lc_serializable(cls) -> bool:
        return True

    @property
    def lc_secrets(self) -> dict[str, str]:
        return {"api_key": "MIMO_API_KEY", "openai_api_key": "MIMO_API_KEY"}
