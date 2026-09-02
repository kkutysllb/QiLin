from __future__ import annotations

from collections.abc import Mapping
from copy import deepcopy
from typing import Any

from langchain_core.messages import HumanMessage

from qilin.constants import HIDE_FROM_UI_KEY

ORIGINAL_USER_CONTENT_KEY = "original_user_content"
SUMMARY_MESSAGE_NAME = "summary"


def message_id(message: Any, *, strict_str: bool = False) -> str | None:
    """Read a message ``id`` from a message-like object or mapping.

    Two intentionally distinct coercion policies exist in the codebase and are
    preserved via this flag (audit R10):

    - ``strict_str=False`` (default): the gateway ``thread_runs`` /
      ``checkpoint_lineage`` / ``durable_context_middleware`` variant — any
      truthy id is accepted and stringified (``42`` becomes ``"42"``).
    - ``strict_str=True``: the gateway ``threads`` router / ``runs.worker``
      variant — only a non-empty ``str`` id is accepted; non-string ids yield
      ``None`` (used where the raw value feeds id-set bookkeeping and must not
      be silently reshaped).
    """
    if isinstance(message, dict):
        value = message.get("id")
    else:
        value = getattr(message, "id", None)
    if strict_str:
        return value if isinstance(value, str) and value else None
    return str(value) if value else None


def message_additional_kwargs(message: Any, *, copy: bool = False) -> dict[str, Any]:
    """Read ``additional_kwargs`` from a message-like object or mapping.

    Non-dict values (including missing) yield ``{}``. ``copy=True`` returns a
    defensive copy — the ``thread_runs`` router variant — while ``copy=False``
    returns the original mapping, as the ``threads`` router branch code does.
    """
    if isinstance(message, dict):
        value = message.get("additional_kwargs")
    else:
        value = getattr(message, "additional_kwargs", None)
    if not isinstance(value, dict):
        return {}
    return dict(value) if copy else value


def message_content_to_text(content: Any, *, separator: str = "\n") -> str:
    """Extract text from LangChain message content shapes.

    List blocks (plain strings and any dict with a ``str`` ``text``) are
    joined with *separator* (empty parts skipped). The default ``"\\n"`` is the
    canonical joining strategy; callers preserving a historical no-separator
    strategy pass ``separator=""`` explicitly (audit R11).
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return separator.join(part for part in parts if part)
    return str(content)


def content_shapes_to_text(content: Any, *, separator: str = "") -> str:
    """Extract text from the common content-shape family (audit R11 canonical).

    Handles: a plain string; a list of string / ``{"text": ...}`` / nested
    ``{"content": ...}`` blocks joined with *separator*; or a mapping with a
    ``text``/``content`` key (text wins). Anything else yields ``""``.

    This is the shared body of :func:`message_to_text` and the channels
    manager's streaming-payload extraction — both historically used the
    no-separator join (hence the default ``separator=""``).
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, Mapping):
                text = block.get("text")
                if isinstance(text, str):
                    parts.append(text)
                else:
                    nested = block.get("content")
                    if isinstance(nested, str):
                        parts.append(nested)
        return separator.join(parts)
    if isinstance(content, Mapping):
        for key in ("text", "content"):
            value = content.get(key)
            if isinstance(value, str):
                return value
    return ""


def message_to_text(message: Any, *, text_attribute_fallback: bool = False) -> str:
    """Extract display text from a whole message (``BaseMessage`` or dict-shaped).

    Reads ``content`` from either an attribute (``BaseMessage``) or a mapping key
    (``run_events`` rows are dicts), then delegates the shape walk to
    :func:`content_shapes_to_text` (no-separator join, nested-content blocks,
    ``text``/``content`` mapping keys).
    Set ``text_attribute_fallback=True`` to fall back to ``message.text`` when
    content yields nothing (matches ``RunJournal._message_text``).

    Unlike :func:`message_content_to_text` (which takes raw ``content`` and joins
    list blocks with newlines), this keeps the no-separator join and the broader
    shape handling that several call sites had each reimplemented.
    """
    content = message.get("content") if isinstance(message, Mapping) else getattr(message, "content", None)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return content_shapes_to_text(content)
    if isinstance(content, Mapping):
        text = content_shapes_to_text(content)
        if text:
            return text
        # Degenerate mapping without str text/content keys falls through to
        # the text-attribute fallback, exactly as before the extraction.
    if text_attribute_fallback:
        fallback_text = getattr(message, "text", None)
        if isinstance(fallback_text, str):
            return fallback_text
    return ""


def get_original_user_content_text(content: Any, additional_kwargs: Mapping[str, Any] | None) -> str:
    """Return pre-middleware user text when available, otherwise content text."""
    original_content = (additional_kwargs or {}).get(ORIGINAL_USER_CONTENT_KEY)
    if isinstance(original_content, str):
        return original_content
    return message_content_to_text(content)


def restore_original_human_message(message: HumanMessage) -> HumanMessage:
    """Build the UI-facing copy of a model-sanitized human message.

    Input middleware intentionally keeps the original user text in
    ``additional_kwargs`` while replacing the model-facing text with transport
    wrappers and other context.  Run-event history must persist the original
    text without mutating the message that is actually sent to the model.

    Mixed content is already normalized by the sanitization middleware to a
    single text block.  For defensive compatibility, multiple current text
    blocks are collapsed at the first text position while every non-text block
    retains its value and relative order.
    """
    original_content = message.additional_kwargs.get(ORIGINAL_USER_CONTENT_KEY)
    if not isinstance(original_content, str):
        return message

    additional_kwargs = dict(message.additional_kwargs)
    additional_kwargs.pop(ORIGINAL_USER_CONTENT_KEY, None)

    content = message.content
    if isinstance(content, str):
        restored_content: str | list = original_content
    elif isinstance(content, list):
        restored_content = []
        restored_text = False
        for block in content:
            is_string_text = isinstance(block, str)
            is_mapping_text = isinstance(block, Mapping) and block.get("type") == "text" and isinstance(block.get("text"), str)
            if not is_string_text and not is_mapping_text:
                restored_content.append(block)
                continue
            if restored_text:
                continue
            if isinstance(block, Mapping) and isinstance(block.get("text"), str):
                restored_content.append({**block, "text": original_content})
            else:
                restored_content.append(original_content)
            restored_text = True
        if not restored_text:
            restored_content.insert(0, {"type": "text", "text": original_content})
    else:
        restored_content = original_content

    return message.model_copy(
        update={
            # Pydantic deep-copies the original model for ``deep=True``, but
            # applies values supplied through ``update`` without copying them.
            # Keep the persisted/UI copy fully isolated from the model-facing
            # message, including nested image/file blocks and metadata.
            "content": deepcopy(restored_content),
            "additional_kwargs": deepcopy(additional_kwargs),
        },
        deep=True,
    )


def is_real_user_message(message: object) -> bool:
    """Return whether ``message`` is a real user-authored HumanMessage.

    Middleware-injected hidden HumanMessages and summarization markers should not
    drive user-intent features such as slash-skill activation or MCP routing.
    """
    if not isinstance(message, HumanMessage):
        return False
    if message.name == SUMMARY_MESSAGE_NAME:
        return False
    if message.additional_kwargs.get(HIDE_FROM_UI_KEY):
        return False
    return True
