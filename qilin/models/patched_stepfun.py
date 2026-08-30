"""Patched ChatOpenAI adapter for StepFun reasoning models.

StepFun returns ``reasoning`` (or ``reasoning_content`` with deepseek-style) in
both streaming deltas and non-streaming responses. Standard ``ChatOpenAI``
ignores these non-standard fields, so reasoning content is silently dropped.
This adapter captures reasoning from all response paths and replays it on
historical assistant messages for multi-turn tool-call conversations.

The capture pipeline lives in :mod:`qilin.models.reasoning_capture`; only the
StepFun-specific field priority (``reasoning_content`` first, then ``reasoning``)
and credential wiring remain here.
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

__all__ = ["PatchedChatStepFun"]

# Module-level aliases kept for backward compatibility with code (and tests)
# that import the StepFun extractor / patcher directly.
_MISSING = MISSING
_extract_reasoning = make_reasoning_extractor(("reasoning_content", "reasoning"))
_with_reasoning_content = with_reasoning_content


class PatchedChatStepFun(ReasoningCaptureMixin, ChatOpenAI):
    """ChatOpenAI with full reasoning support for StepFun models.

    Captures ``reasoning`` / ``reasoning_content`` from both streaming and
    non-streaming responses and replays it on historical assistant messages in
    multi-turn tool-call conversations.
    """

    # StepFun may return reasoning via ``reasoning`` (default) or
    # ``reasoning_content`` (deepseek-style). Check ``reasoning_content`` first.
    reasoning_fields: ClassVar[tuple[str, ...]] = ("reasoning_content", "reasoning")

    @classmethod
    def is_lc_serializable(cls) -> bool:
        return True

    @property
    def lc_secrets(self) -> dict[str, str]:
        return {"api_key": "STEPFUN_API_KEY", "openai_api_key": "STEPFUN_API_KEY"}
