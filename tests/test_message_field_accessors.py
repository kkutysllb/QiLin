"""Characterization tests for the message-field accessors duplicated across 5
modules (audit R10).

Pins the CURRENT per-module behavior — including the known ``_message_type``
semantic drift between ``thread_runs`` (assistant→ai mapping + ``role``
fallback + str coercion) and ``threads`` (no mapping, strict-str) — before the
semantics-free accessors (``_message_id`` / ``_message_additional_kwargs`` /
``_checkpoint_messages``) converge onto ``qilin.utils.messages``. All tests
must pass unchanged after that merge, and the drift point must stay visible.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

import app.gateway.checkpoint_lineage as lineage_mod
import app.gateway.routers.thread_runs as thread_runs_mod
import app.gateway.routers.threads as threads_mod
from qilin.agents.middlewares.durable_context_middleware import (
    _message_id as durable_message_id,
)
from qilin.runtime.runs.worker import _message_id as worker_message_id

# Modules whose ``_message_id`` coerces any truthy id via str() ...
COERCING_MESSAGE_ID = (
    thread_runs_mod._message_id,
    lineage_mod._message_id,
    durable_message_id,
)
# ... versus the strict-str variant (threads router / runs worker).
STRICT_MESSAGE_ID = (threads_mod._message_id, worker_message_id)


class Msg:
    """Message-like object with optional attributes."""

    def __init__(self, **attrs: Any) -> None:
        for key, value in attrs.items():
            setattr(self, key, value)


class Snapshot:
    def __init__(self, *, values: Any = None, checkpoint: Any = None) -> None:
        self.values = values
        if checkpoint is not None:
            self.checkpoint = checkpoint


class TestMessageIdVariants:
    @pytest.mark.parametrize("accessor", COERCING_MESSAGE_ID)
    def test_coercing_variant_stringifies_truthy_ids(self, accessor: Any) -> None:
        assert accessor(Msg(id="m-1")) == "m-1"
        assert accessor({"id": "m-1"}) == "m-1"
        # non-string truthy ids are coerced: 42 -> "42"
        assert accessor(Msg(id=42)) == "42"
        assert accessor({"id": 42}) == "42"

    @pytest.mark.parametrize("accessor", COERCING_MESSAGE_ID + STRICT_MESSAGE_ID)
    def test_falsy_ids_yield_none(self, accessor: Any) -> None:
        assert accessor(Msg(id="")) is None
        assert accessor({"id": ""}) is None
        assert accessor(Msg()) is None
        assert accessor({}) is None
        assert accessor(None) is None

    @pytest.mark.parametrize("accessor", STRICT_MESSAGE_ID)
    def test_strict_variant_rejects_non_string_ids(self, accessor: Any) -> None:
        assert accessor(Msg(id=42)) is None
        assert accessor({"id": 42}) is None
        assert accessor(Msg(id="m-1")) == "m-1"
        assert accessor({"id": "m-1"}) == "m-1"

    def test_dict_message_reads_dict_key_not_attribute(self) -> None:
        # A dict's "id" key wins over any attribute path (dicts have no `id`).
        assert thread_runs_mod._message_id({"id": "d-1"}) == "d-1"
        assert threads_mod._message_id({"id": "d-1"}) == "d-1"


class TestMessageTypeDrift:
    """THE documented drift point — thread_runs maps, threads does not."""

    def test_thread_runs_maps_assistant_to_ai(self) -> None:
        assert thread_runs_mod._message_type(Msg(type="assistant")) == "ai"
        assert thread_runs_mod._message_type({"type": "assistant"}) == "ai"

    def test_thread_runs_falls_back_to_role_key(self) -> None:
        assert thread_runs_mod._message_type({"role": "assistant"}) == "ai"
        assert thread_runs_mod._message_type({"role": "human"}) == "human"
        assert thread_runs_mod._message_type(Msg(type="human")) == "human"

    def test_thread_runs_coerces_non_string_type(self) -> None:
        assert thread_runs_mod._message_type({"type": 3}) == "3"

    def test_threads_has_no_role_fallback_and_no_mapping(self) -> None:
        # The threads-router variant intentionally does NOT do the
        # assistant→ai mapping and does NOT consult the `role` key.
        assert threads_mod._message_type({"role": "assistant"}) is None
        assert threads_mod._message_type({"type": "assistant"}) == "assistant"
        assert threads_mod._message_type(Msg(type="ai")) == "ai"

    def test_threads_is_strict_str(self) -> None:
        assert threads_mod._message_type({"type": 3}) is None

    def test_threads_branch_visibility_ignores_role_shaped_messages(self) -> None:
        """Branch decisions must keep treating role-only dicts as invisible."""
        assert threads_mod._is_branch_visible_message({"role": "assistant"}) is False
        assert threads_mod._is_branch_assistant_message({"role": "assistant"}) is False
        assert threads_mod._is_branch_visible_message({"type": "ai"}) is True
        assert threads_mod._is_branch_assistant_message({"type": "ai"}) is True

    def test_thread_runs_visibility_maps_role_shaped_assistant(self) -> None:
        """thread_runs UI visibility DOES rely on the assistant→ai mapping."""
        assert (
            thread_runs_mod._is_visible_ai_message({"role": "assistant"}) is True
        )
        assert (
            thread_runs_mod._is_visible_ai_message({"role": "assistant", "name": "summary"})
            is False
        )


class TestMessageAdditionalKwargsVariants:
    def test_thread_runs_returns_a_copy(self) -> None:
        source = {"tool_calls": []}
        result = thread_runs_mod._message_additional_kwargs({"additional_kwargs": source})
        assert result == {"tool_calls": []}
        assert result is not source  # defensive copy

    def test_threads_returns_the_original_dict(self) -> None:
        source = {"hide_from_ui": True}
        result = threads_mod._message_additional_kwargs({"additional_kwargs": source})
        assert result is source  # no copy

    @pytest.mark.parametrize(
        "accessor",
        [thread_runs_mod._message_additional_kwargs, threads_mod._message_additional_kwargs],
    )
    def test_object_attribute_and_non_dict_fallback(self, accessor: Any) -> None:
        assert accessor(Msg(additional_kwargs={"a": 1})) == {"a": 1}
        assert accessor(Msg()) == {}
        assert accessor({"additional_kwargs": "not-a-dict"}) == {}
        assert accessor({}) == {}


class TestCheckpointMessagesVariants:
    def test_canonical_reads_values_messages(self) -> None:
        snapshot = Snapshot(values={"messages": [{"id": "m-1"}]})
        assert lineage_mod.checkpoint_messages(snapshot) == [{"id": "m-1"}]
        assert thread_runs_mod._checkpoint_messages(snapshot) == [{"id": "m-1"}]

    def test_canonical_falls_back_to_raw_checkpoint_channel_values(self) -> None:
        snapshot = Snapshot(
            checkpoint={"channel_values": {"messages": [{"id": "raw-1"}]}}
        )
        # degraded raw-checkpoint read path: the canonical accessor recovers
        # messages from checkpoint["channel_values"]
        assert lineage_mod.checkpoint_messages(snapshot) == [{"id": "raw-1"}]

    def test_threads_has_no_raw_checkpoint_fallback(self) -> None:
        snapshot = Snapshot(
            checkpoint={"channel_values": {"messages": [{"id": "raw-1"}]}}
        )
        # The threads-router inline variant returns [] on the degraded path.
        assert threads_mod._checkpoint_messages(snapshot) == []

    def test_threads_reads_values_messages(self) -> None:
        snapshot = Snapshot(values={"messages": [{"id": "m-1"}]})
        assert threads_mod._checkpoint_messages(snapshot) == [{"id": "m-1"}]

    @pytest.mark.parametrize(
        "accessor",
        [
            lineage_mod.checkpoint_messages,
            thread_runs_mod._checkpoint_messages,
            threads_mod._checkpoint_messages,
        ],
    )
    def test_non_list_messages_yield_empty(self, accessor: Any) -> None:
        assert accessor(Snapshot(values={"messages": "not-a-list"})) == []
        assert accessor(Snapshot(values={})) == []
        assert accessor(Snapshot(values=None)) == []


class TestWorkerMessageIdStrictness:
    """The worker's accessor is used for pre-existing-id bookkeeping."""

    def test_worker_accepts_string_ids_from_objects_and_dicts(self) -> None:
        assert worker_message_id(Msg(id="m-1")) == "m-1"
        assert worker_message_id({"id": "m-1"}) == "m-1"

    def test_worker_rejects_non_string_ids(self) -> None:
        assert worker_message_id(Msg(id=42)) is None
        assert worker_message_id({"id": 42}) is None


def test_simple_namespace_object_paths() -> None:
    """Plain attribute objects (SimpleNamespace) behave like message objects."""
    assert thread_runs_mod._message_id(SimpleNamespace(id="s-1")) == "s-1"
    assert threads_mod._message_id(SimpleNamespace(id=7)) is None
    assert threads_mod._message_type(SimpleNamespace(type="human")) == "human"
