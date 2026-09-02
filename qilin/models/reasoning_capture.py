"""Shared reasoning-capture machinery for the OpenAI-compatible provider patches.

StepFun, MiMo (and historically MiniMax) each hand-rolled the same pipeline:
probe provider-specific reasoning fields on a dict / SDK object / ``model_extra``,
store the value under ``additional_kwargs["reasoning_content"]``, and patch both
the streaming-chunk and non-streaming-result message paths of
``langchain_openai.ChatOpenAI``. This module keeps that pipeline in exactly one
copy; providers keep only their configuration and genuinely provider-specific
extras.

Semantic differences between providers are preserved via configuration:

- ``make_reasoning_extractor(fields)`` — the field list IS the semantic
  (StepFun probes ``("reasoning_content", "reasoning")``, MiMo only
  ``("reasoning_content",)``). All field probes are ``is not None`` checks, so
  empty-string reasoning is preserved (MiMo's documented contract).
- ``with_reasoning_content`` — the overwrite semantics shared by StepFun/MiMo
  (MiniMax's merge / ``preserve_whitespace`` semantics are structurally
  different and stay in ``patched_minimax.py``).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, ClassVar, cast

from langchain_core.messages import AIMessage, AIMessageChunk
from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, ChatResult

MISSING = object()
"""Sentinel for "no reasoning found" — distinct from an empty string."""


def extract_reasoning_fields(value: Any, fields: Sequence[str]) -> str | object:
    """Return the first non-``None`` reasoning value among *fields*.

    Probe order: Mapping key → object attribute → ``model_extra`` mapping.
    Empty strings are returned as-is (only ``None`` counts as absent).
    Returns :data:`MISSING` when no field carries reasoning content.
    """
    if isinstance(value, Mapping):
        for field in fields:
            if field in value and value[field] is not None:
                return value[field]
        return MISSING

    # Pydantic / SDK object attributes
    for field in fields:
        attr = getattr(value, field, MISSING)
        if attr is not MISSING and attr is not None:
            return attr

    # Some SDK versions store extra fields in model_extra
    model_extra = getattr(value, "model_extra", None)
    if isinstance(model_extra, Mapping):
        for field in fields:
            if field in model_extra and model_extra[field] is not None:
                return model_extra[field]

    return MISSING


def make_reasoning_extractor(
    fields: Sequence[str],
) -> Any:
    """Build an extractor bound to an ordered *fields* priority list."""

    def _extract(value: Any) -> str | object:
        return extract_reasoning_fields(value, fields)

    return _extract


def with_reasoning_content(
    message: AIMessage | AIMessageChunk, reasoning: str
) -> AIMessage | AIMessageChunk:
    """Return a copy of *message* with ``reasoning_content`` in additional_kwargs.

    The existing value is overwritten only when it differs (an equality no-op
    keeps streaming merge quiet for repeated identical chunks).
    """
    additional_kwargs = dict(message.additional_kwargs)
    if additional_kwargs.get("reasoning_content") != reasoning:
        additional_kwargs["reasoning_content"] = reasoning
    return message.model_copy(update={"additional_kwargs": additional_kwargs})


def get_typed_choice_message(response: Any, index: int) -> Any:
    """Extract the SDK-typed choice message at *index*, if available."""
    choices = getattr(response, "choices", None)
    if choices is None:
        return None
    try:
        return choices[index].message
    except (AttributeError, IndexError, TypeError):
        return None


class ReasoningCaptureMixin:
    """Mixin for ``ChatOpenAI`` subclasses that capture reasoning content.

    Subclasses declare ``reasoning_fields`` (ordered priority list) and inherit
    the full capture pipeline: streaming-chunk patching, non-streaming result
    patching (with the SDK-typed-object fallback), and request-payload
    replay of ``additional_kwargs["reasoning_content"]``.

    ``reasoning_fields`` is a ``ClassVar`` so mixing it into the Pydantic
    ``ChatOpenAI`` metaclass never turns it into a model field.
    """

    reasoning_fields: ClassVar[tuple[str, ...]] = ("reasoning_content",)

    @classmethod
    def _extract_reasoning(cls, value: Any) -> str | object:
        return extract_reasoning_fields(value, cls.reasoning_fields)

    # --- Request payload replay ---

    def _get_request_payload(
        self,
        input_: Any,
        *,
        stop: list[str] | None = None,
        **kwargs: Any,
    ) -> dict:
        """Restore ``reasoning_content`` on historical assistant messages.

        Imported lazily so the mixin can sit above ``ChatOpenAI`` without a
        hard module-level dependency beyond the shared replay helpers.
        """
        from qilin.models.assistant_payload_replay import (
            restore_assistant_payloads,
            restore_reasoning_content,
        )

        original_messages = self._convert_input(input_).to_messages()  # type: ignore[attr-defined]
        payload = super()._get_request_payload(input_, stop=stop, **kwargs)  # type: ignore[misc]

        restore_assistant_payloads(
            payload.get("messages", []),
            original_messages,
            restore_reasoning_content,
        )

        return payload

    # --- Streaming reasoning capture ---

    def _convert_chunk_to_generation_chunk(
        self,
        chunk: dict,
        default_chunk_class: type,
        base_generation_info: dict | None,
    ) -> ChatGenerationChunk | None:
        """Capture provider reasoning fields from streaming deltas."""
        generation_chunk = super()._convert_chunk_to_generation_chunk(  # type: ignore[misc]
            chunk,
            default_chunk_class,
            base_generation_info,
        )
        if generation_chunk is None:
            return None

        choices = chunk.get("choices", [])
        if choices:
            delta = choices[0].get("delta") or {}
            reasoning = self._extract_reasoning(delta)
            if (
                reasoning is not MISSING
                and isinstance(reasoning, str)
                and isinstance(generation_chunk.message, AIMessageChunk)
            ):
                generation_chunk = ChatGenerationChunk(
                    message=cast(
                        "AIMessageChunk",
                        with_reasoning_content(generation_chunk.message, reasoning),
                    ),
                    generation_info=generation_chunk.generation_info,
                )

        return generation_chunk

    # --- Non-streaming reasoning capture ---

    def _create_chat_result(
        self,
        response: dict | Any,
        generation_info: dict | None = None,
    ) -> ChatResult:
        """Capture provider reasoning fields from non-streaming responses."""
        result = super()._create_chat_result(response, generation_info)  # type: ignore[misc]
        response_dict = (
            response if isinstance(response, dict) else response.model_dump()
        )
        choices = response_dict.get("choices", [])

        patched_generations: list[ChatGeneration] | None = None
        for index, generation in enumerate(result.generations):
            choice = choices[index] if index < len(choices) else {}
            choice_message = (
                choice.get("message", {}) if isinstance(choice, Mapping) else {}
            )
            reasoning = self._extract_reasoning(choice_message)

            if reasoning is MISSING and not isinstance(response, dict):
                reasoning = self._extract_reasoning(
                    get_typed_choice_message(response, index)
                )

            message = generation.message
            if (
                reasoning is not MISSING
                and isinstance(reasoning, str)
                and isinstance(message, AIMessage)
            ):
                if patched_generations is None:
                    patched_generations = list(result.generations)
                patched_generations[index] = ChatGeneration(
                    message=with_reasoning_content(message, reasoning),
                    generation_info=generation.generation_info,
                )

        return ChatResult(
            generations=patched_generations or result.generations,
            llm_output=result.llm_output,
        )
