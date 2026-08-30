"""Tests for ReadBeforeWriteMiddleware's version-gate decision logic.

The gate blocks file-modifying tools (``write_file``, ``str_replace``) unless a
``read_file`` of the target at its *current* content version appears earlier in
``state["messages"]`` (a sha256 read mark stamped on the read's ToolMessage).

All decision paths are exercised with an injected fake content reader and fake
``ToolCallRequest`` objects — no sandbox is involved. Path arguments are
normalized like the real reader's filesystem would normalize them
(``posixpath.normpath``) so ``.``/``..`` spellings resolve to the same key.
"""

import hashlib
import posixpath
from typing import Any

from langchain_core.messages import ToolMessage
from langgraph.prebuilt.tool_node import ToolCallRequest
from langgraph.types import Command

from qilin.agents.middlewares.read_before_write_middleware import (
    READ_MARK_KEY,
    ReadBeforeWriteMiddleware,
)
from qilin.agents.middlewares.tool_result_meta import TOOL_META_KEY


class FakeContentStore:
    """Dict-backed stand-in for ``read_current_file_content``."""

    def __init__(self) -> None:
        self.contents: dict[str, str] = {}

    def read(self, runtime: Any, path: str) -> str:
        return self.contents[posixpath.normpath(path)]  # KeyError == FileNotFoundError

    def write(self, path: str, content: str) -> None:
        self.contents[posixpath.normpath(path)] = content


class OkHandler:
    """Handler that records invocations and returns a success ToolMessage."""

    def __init__(self) -> None:
        self.calls: list[ToolCallRequest] = []

    def __call__(self, request: ToolCallRequest) -> ToolMessage:
        self.calls.append(request)
        return self._message(request)

    async def acall(self, request: ToolCallRequest) -> ToolMessage:
        self.calls.append(request)
        return self._message(request)

    @staticmethod
    def _message(request: ToolCallRequest) -> ToolMessage:
        return ToolMessage(
            content="ok",
            tool_call_id=request.tool_call["id"],
            name=request.tool_call["name"],
        )


def read_mark_message(path: str, content: str) -> ToolMessage:
    """A ToolMessage carrying a read mark, as state["messages"] would hold it."""
    return ToolMessage(
        content="file content",
        tool_call_id="call-read",
        name="read_file",
        additional_kwargs={
            READ_MARK_KEY: {
                "path": posixpath.normpath(path),
                "hash": hashlib.sha256(content.encode("utf-8")).hexdigest(),
            }
        },
    )


def content_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# write gate: block / allow decisions
# ---------------------------------------------------------------------------


class TestWriteGate:
    def test_write_to_new_file_allowed(self, make_request) -> None:
        middleware = ReadBeforeWriteMiddleware(content_reader=FakeContentStore().read)
        handler = OkHandler()

        result = middleware.wrap_tool_call(make_request("write_file", "/w/new.txt"), handler)

        assert result.content == "ok"
        assert len(handler.calls) == 1

    def test_write_to_existing_unread_file_blocked(self, make_request) -> None:
        store = FakeContentStore()
        store.write("/w/a.txt", "v1")
        middleware = ReadBeforeWriteMiddleware(content_reader=store.read)
        handler = OkHandler()

        result = middleware.wrap_tool_call(make_request("write_file", "/w/a.txt"), handler)

        assert isinstance(result, ToolMessage)
        assert result.status == "error"
        assert "/w/a.txt" in result.content
        assert "blocked" in result.content
        assert result.tool_call_id == "call-1"
        assert result.name == "write_file"
        # The tool must not run when the gate blocks.
        assert handler.calls == []
        # The block still carries structured tool metadata for downstream
        # classification (ToolProgressMiddleware).
        assert TOOL_META_KEY in result.additional_kwargs

    def test_str_replace_is_gated_like_write_file(self, make_request) -> None:
        store = FakeContentStore()
        store.write("/w/a.txt", "v1")
        middleware = ReadBeforeWriteMiddleware(content_reader=store.read)

        result = middleware.wrap_tool_call(make_request("str_replace", "/w/a.txt"), OkHandler())

        assert isinstance(result, ToolMessage)
        assert result.status == "error"
        assert "str_replace" in result.content

    def test_write_allowed_after_read_of_current_version(self, make_request) -> None:
        store = FakeContentStore()
        store.write("/w/a.txt", "v1")
        middleware = ReadBeforeWriteMiddleware(content_reader=store.read)

        read_result = middleware.wrap_tool_call(
            make_request("read_file", "/w/a.txt"), OkHandler()
        )
        result = middleware.wrap_tool_call(
            make_request("write_file", "/w/a.txt", state={"messages": [read_result]}),
            OkHandler(),
        )

        assert result.content == "ok"

    def test_write_blocked_against_stale_read_mark(self, make_request) -> None:
        """Any successful write changes the hash, so the earlier read mark no
        longer matches the file's current version."""
        store = FakeContentStore()
        store.write("/w/a.txt", "v1")
        middleware = ReadBeforeWriteMiddleware(content_reader=store.read)

        read_result = middleware.wrap_tool_call(
            make_request("read_file", "/w/a.txt"), OkHandler()
        )
        store.write("/w/a.txt", "v2")  # the intervening write landed

        result = middleware.wrap_tool_call(
            make_request("write_file", "/w/a.txt", state={"messages": [read_result]}),
            OkHandler(),
        )

        assert isinstance(result, ToolMessage)
        assert result.status == "error"

    def test_state_without_any_mark_blocks(self, make_request) -> None:
        store = FakeContentStore()
        store.write("/w/a.txt", "v1")
        middleware = ReadBeforeWriteMiddleware(content_reader=store.read)

        result = middleware.wrap_tool_call(
            make_request("write_file", "/w/a.txt", state={"messages": ["irrelevant"]}),
            OkHandler(),
        )

        assert isinstance(result, ToolMessage)
        assert result.status == "error"

    def test_latest_mark_wins(self, make_request) -> None:
        """Only the most recent read of a path counts — an older matching
        read does not rescue a newer mismatching one, and vice versa."""
        store = FakeContentStore()
        middleware = ReadBeforeWriteMiddleware(content_reader=store.read)
        state = {"messages": [read_mark_message("/w/a.txt", "v1"), read_mark_message("/w/a.txt", "v2")]}

        store.write("/w/a.txt", "v2")  # matches the latest mark
        assert middleware.wrap_tool_call(make_request("write_file", "/w/a.txt", state=state), OkHandler()).content == "ok"

        store.write("/w/a.txt", "v1")  # only the older mark matches
        result = middleware.wrap_tool_call(make_request("write_file", "/w/a.txt", state=state), OkHandler())
        assert isinstance(result, ToolMessage)
        assert result.status == "error"

    def test_mark_for_other_path_does_not_authorize(self, make_request) -> None:
        store = FakeContentStore()
        store.write("/w/a.txt", "v1")
        store.write("/w/b.txt", "v1")
        middleware = ReadBeforeWriteMiddleware(content_reader=store.read)
        state = {"messages": [read_mark_message("/w/b.txt", "v1")]}

        result = middleware.wrap_tool_call(make_request("write_file", "/w/a.txt", state=state), OkHandler())

        assert isinstance(result, ToolMessage)
        assert result.status == "error"

    def test_path_spelling_normalized_between_read_and_write(self, make_request) -> None:
        store = FakeContentStore()
        store.write("/w/n.txt", "same")
        middleware = ReadBeforeWriteMiddleware(content_reader=store.read)

        read_result = middleware.wrap_tool_call(
            make_request("read_file", "/w/./sub/../n.txt"), OkHandler()
        )
        assert read_result.additional_kwargs[READ_MARK_KEY]["path"] == "/w/n.txt"

        result = middleware.wrap_tool_call(
            make_request("write_file", "/w/n.txt", state={"messages": [read_result]}),
            OkHandler(),
        )

        assert result.content == "ok"


# ---------------------------------------------------------------------------
# fail-open paths
# ---------------------------------------------------------------------------


class TestFailOpen:
    def test_missing_file_fails_open_for_write_file(self, make_request) -> None:
        """FileNotFoundError means the write creates the file — allowed."""
        middleware = ReadBeforeWriteMiddleware(content_reader=FakeContentStore().read)
        handler = OkHandler()

        result = middleware.wrap_tool_call(make_request("write_file", "/w/gone.txt"), handler)

        assert result.content == "ok"
        assert len(handler.calls) == 1

    def test_error_string_read_channel_fails_open(self, make_request) -> None:
        """AIO/E2B sandboxes report read failures as "Error: ..." strings; the
        gate cannot distinguish missing from unreadable, so it allows the
        write and lets the tool surface any real failure."""
        store = FakeContentStore()
        store.write("/w/err.txt", "Error: file not found in sandbox")
        middleware = ReadBeforeWriteMiddleware(content_reader=store.read)
        handler = OkHandler()

        result = middleware.wrap_tool_call(make_request("write_file", "/w/err.txt"), handler)

        assert result.content == "ok"
        assert len(handler.calls) == 1

    def test_reader_exception_fails_open(self, make_request) -> None:
        def broken_reader(runtime: Any, path: str) -> str:
            raise OSError("sandbox unavailable")

        middleware = ReadBeforeWriteMiddleware(content_reader=broken_reader)
        handler = OkHandler()

        result = middleware.wrap_tool_call(make_request("write_file", "/w/x.txt"), handler)

        assert result.content == "ok"
        assert len(handler.calls) == 1


# ---------------------------------------------------------------------------
# read mark stamping
# ---------------------------------------------------------------------------


class TestReadMarkStamping:
    def test_successful_read_stamps_mark_with_current_hash(self, make_request) -> None:
        store = FakeContentStore()
        store.write("/w/a.txt", "v1")
        middleware = ReadBeforeWriteMiddleware(content_reader=store.read)

        result = middleware.wrap_tool_call(make_request("read_file", "/w/a.txt"), OkHandler())

        mark = result.additional_kwargs[READ_MARK_KEY]
        assert mark == {"path": "/w/a.txt", "hash": content_hash("v1")}

    def test_failed_read_stamps_no_mark(self, make_request) -> None:
        store = FakeContentStore()
        store.write("/w/a.txt", "v1")
        middleware = ReadBeforeWriteMiddleware(content_reader=store.read)

        def failing_handler(request: ToolCallRequest) -> ToolMessage:
            return ToolMessage(
                content="Error: read failed",
                tool_call_id=request.tool_call["id"],
                name="read_file",
                status="error",
            )

        result = middleware.wrap_tool_call(make_request("read_file", "/w/a.txt"), failing_handler)

        assert READ_MARK_KEY not in result.additional_kwargs

    def test_mark_stamped_on_command_wrapped_result(self, make_request) -> None:
        store = FakeContentStore()
        store.write("/w/a.txt", "v1")
        middleware = ReadBeforeWriteMiddleware(content_reader=store.read)

        def command_handler(request: ToolCallRequest) -> Command:
            return Command(
                update={
                    "messages": [
                        ToolMessage(content="ok", tool_call_id=request.tool_call["id"], name="read_file")
                    ]
                }
            )

        result = middleware.wrap_tool_call(make_request("read_file", "/w/a.txt"), command_handler)

        assert isinstance(result, Command)
        inner = result.update["messages"][0]
        assert inner.additional_kwargs[READ_MARK_KEY]["hash"] == content_hash("v1")

    def test_error_string_read_stamps_no_mark(self, make_request) -> None:
        store = FakeContentStore()
        store.write("/w/a.txt", "Error: cannot read binary")
        middleware = ReadBeforeWriteMiddleware(content_reader=store.read)

        result = middleware.wrap_tool_call(make_request("read_file", "/w/a.txt"), OkHandler())

        assert READ_MARK_KEY not in result.additional_kwargs


# ---------------------------------------------------------------------------
# passthrough paths
# ---------------------------------------------------------------------------


class TestPassthrough:
    def test_ungated_tool_result_untouched(self, make_request) -> None:
        store = FakeContentStore()
        store.write("/w/a.txt", "v1")
        middleware = ReadBeforeWriteMiddleware(content_reader=store.read)
        handler = OkHandler()

        result = middleware.wrap_tool_call(make_request("bash", "/w/a.txt"), handler)

        assert result.content == "ok"
        assert READ_MARK_KEY not in result.additional_kwargs
        assert len(handler.calls) == 1

    def test_gated_tool_without_path_arg_passthrough(self, make_request) -> None:
        middleware = ReadBeforeWriteMiddleware(content_reader=FakeContentStore().read)
        handler = OkHandler()

        request = make_request("write_file", None)
        result = middleware.wrap_tool_call(request, handler)

        assert result.content == "ok"
        assert len(handler.calls) == 1


# ---------------------------------------------------------------------------
# async wrapper
# ---------------------------------------------------------------------------


class TestAsyncWrapToolCall:
    async def test_block_read_allow_cycle(self, make_request) -> None:
        store = FakeContentStore()
        store.write("/w/a.txt", "v1")
        middleware = ReadBeforeWriteMiddleware(content_reader=store.read)
        handler = OkHandler()
        read_state: dict[str, Any] = {"messages": []}

        blocked = await middleware.awrap_tool_call(make_request("write_file", "/w/a.txt"), handler.acall)
        assert isinstance(blocked, ToolMessage)
        assert blocked.status == "error"

        read_result = await middleware.awrap_tool_call(make_request("read_file", "/w/a.txt"), handler.acall)
        assert READ_MARK_KEY in read_result.additional_kwargs

        read_state["messages"].append(read_result)
        allowed = await middleware.awrap_tool_call(
            make_request("write_file", "/w/a.txt", state=read_state), handler.acall
        )
        assert allowed.content == "ok"

    async def test_ungated_tool_passthrough(self, make_request) -> None:
        middleware = ReadBeforeWriteMiddleware(content_reader=FakeContentStore().read)
        handler = OkHandler()

        async def async_handler(request: ToolCallRequest) -> ToolMessage:
            return await handler.acall(request)

        result = await middleware.awrap_tool_call(make_request("bash", "/w/anywhere"), async_handler)

        assert result.content == "ok"
        assert len(handler.calls) == 1
