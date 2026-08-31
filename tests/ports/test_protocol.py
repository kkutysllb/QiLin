"""Consistency tests for the DSH-mirrored ports protocol contracts.

These pin the wire fidelity guarantees: camelCase result aliases, strict
extra rejection, clamp rules, the wait_for discriminated union, the
multi-byte-safe truncation helper, and the capability monotonicity rule.
If one of these fails after touching qilin/ports/protocol, the protocol
drifted from DSH - fix the contract, not the test, unless the change is a
deliberate, documented protocol revision.
"""

import pytest
from pydantic import TypeAdapter, ValidationError

from qilin.ports.protocol import (
    ALLOWED_SIGNALS,
    DEFAULT_READ_COUNT,
    DEFAULT_WAIT_MS,
    MAX_READ_COUNT,
    MIN_WAIT_MS,
    PORT_CAPABILITIES,
    READ_BYTE_LIMIT,
    RESIZE_MAX,
    RESIZE_MIN,
    AnyPortEvent,
    SurfaceOpenArgs,
    SurfaceOpenEvent,
    SurfaceOpenResult,
    TerminalCloseArgs,
    TerminalCloseResult,
    TerminalCreateArgs,
    TerminalCreateResult,
    TerminalExitedEvent,
    TerminalListResult,
    TerminalOutputEvent,
    TerminalReadArgs,
    TerminalReadResult,
    TerminalResizeArgs,
    TerminalSendArgs,
    TerminalSendResult,
    TerminalSnapshot,
    TerminalWaitExited,
    TerminalWaitForArgs,
    TerminalWaitFound,
    TerminalWaitResult,
    TerminalWaitTimeout,
    bound_bytes,
    classify_target_kind,
    supports,
)

# ---------------------------------------------------------------------------
# terminal_create / terminal_list
# ---------------------------------------------------------------------------


def test_create_args_and_wire_dump() -> None:
    args = TerminalCreateArgs(title="dev server", command="pnpm dev")
    assert args.model_dump() == {"title": "dev server", "command": "pnpm dev"}

    result = TerminalCreateResult(uuid="u-1", title="dev server")
    assert result.model_dump(by_alias=True) == {"uuid": "u-1", "title": "dev server"}


def test_snapshot_camel_case_and_null_exits() -> None:
    snapshot = TerminalSnapshot(
        uuid="u-1", title="repl", command="python", exited=True, exit_code=0
    )
    dumped = snapshot.model_dump(by_alias=True)
    assert dumped["exitCode"] == 0
    assert dumped["exitSignal"] is None

    # A bare array is not a BaseModel - validate through a TypeAdapter.
    parsed = TypeAdapter(TerminalListResult).validate_python(
        [
            {
                "uuid": "u-2",
                "title": "t",
                "command": "top",
                "exited": False,
                "exitCode": None,
                "exitSignal": None,
            }
        ]
    )
    assert parsed[0].exited is False


# ---------------------------------------------------------------------------
# terminal_send
# ---------------------------------------------------------------------------


def test_send_result_uses_bytes_alias() -> None:
    result = TerminalSendResult(uuid="u-1", byte_count=7)
    assert result.model_dump(by_alias=True) == {"uuid": "u-1", "bytes": 7}


def test_send_args_rejects_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        TerminalSendArgs(uuid="u-1", text="ls", submit=True, shell="/bin/zsh")


# ---------------------------------------------------------------------------
# terminal_read
# ---------------------------------------------------------------------------


def test_read_count_clamped_to_hard_cap() -> None:
    assert TerminalReadArgs(uuid="u").count == DEFAULT_READ_COUNT
    assert TerminalReadArgs(uuid="u", count=99_999).count == MAX_READ_COUNT
    assert TerminalReadArgs(uuid="u", count=0).count == 1
    assert TerminalReadArgs(uuid="u", count=-5).count == 1


def test_read_offset_accepts_negative() -> None:
    assert TerminalReadArgs(uuid="u", offset=-50).offset == -50


def test_read_result_camel_case() -> None:
    result = TerminalReadResult(
        text="hello", total_lines=10, line_begin=0, line_end=10, truncated=False
    )
    assert result.model_dump(by_alias=True) == {
        "text": "hello",
        "totalLines": 10,
        "lineBegin": 0,
        "lineEnd": 10,
        "truncated": False,
    }


# ---------------------------------------------------------------------------
# terminal_wait_for
# ---------------------------------------------------------------------------


def test_wait_for_args_needle_and_timeout_clamps() -> None:
    with pytest.raises(ValidationError):
        TerminalWaitForArgs(uuid="u", needle="")
    assert TerminalWaitForArgs(uuid="u", needle="done").timeout_ms == DEFAULT_WAIT_MS
    assert TerminalWaitForArgs(uuid="u", needle="x", timeout_ms=1).timeout_ms == MIN_WAIT_MS


def test_wait_for_discriminated_union_parses_dsh_payloads() -> None:
    adapter = TypeAdapter(TerminalWaitResult)

    found = adapter.validate_python(
        {"kind": "found", "needle": "ok", "line": 3, "column": 7, "elapsedMs": 120}
    )
    assert isinstance(found, TerminalWaitFound)
    assert found.elapsed_ms == 120

    timeout = adapter.validate_python(
        {"kind": "timeout", "needle": "ok", "timeoutMs": 10_000, "totalLines": 4096}
    )
    assert isinstance(timeout, TerminalWaitTimeout)
    assert timeout.total_lines == 4096

    exited = adapter.validate_python(
        {"kind": "exited", "needle": "ok", "exitCode": 2, "exitSignal": None}
    )
    assert isinstance(exited, TerminalWaitExited)
    assert exited.exit_code == 2


# ---------------------------------------------------------------------------
# terminal_resize / terminal_signal / terminal_close
# ---------------------------------------------------------------------------


def test_resize_axes_clamped() -> None:
    args = TerminalResizeArgs(uuid="u", cols=0, rows=99_999)
    assert args.cols == RESIZE_MIN
    assert args.rows == RESIZE_MAX
    mid = TerminalResizeArgs(uuid="u", cols=80, rows=24)
    assert (mid.cols, mid.rows) == (80, 24)


def test_signals_whitelist() -> None:
    assert ALLOWED_SIGNALS == ("SIGINT", "SIGTERM", "SIGKILL", "SIGHUP", "SIGTSTP")
    # Unknown fields are rejected at the contract boundary (extra=forbid).
    with pytest.raises(ValidationError):
        TerminalResizeArgs.model_validate({"uuid": "u", "cols": 80, "rows": 24, "x": 1})


def test_close_result_flag() -> None:
    assert TerminalCloseResult(uuid="u-9", closed=False).model_dump() == {
        "uuid": "u-9",
        "closed": False,
    }
    assert TerminalCloseArgs(uuid="u-9").uuid == "u-9"


# ---------------------------------------------------------------------------
# bound_bytes (multi-byte safety)
# ---------------------------------------------------------------------------


class TestBoundBytes:
    def test_short_text_untouched(self) -> None:
        bounded, truncated = bound_bytes("hello", 100)
        assert bounded == "hello"
        assert truncated is False

    def test_ascii_exact_cap_not_truncated(self) -> None:
        bounded, truncated = bound_bytes("a" * 10, 10)
        assert bounded == "a" * 10
        assert truncated is False

    def test_multibyte_never_splits_sequence(self) -> None:
        # U+597D is 3 bytes; a cap of 4 fits exactly one whole char.
        bounded, truncated = bound_bytes("好好好", 4)
        assert bounded == "好"
        assert truncated is True
        assert len(bounded.encode("utf-8")) <= 4

    def test_multibyte_cap_matches_dsh_walkback(self) -> None:
        # Cap of 5 bytes: one 3-byte char + 2 leading bytes of the next -
        # the walk-back retreats to 3, mirroring the DSH continuation-byte
        # retreat exactly.
        bounded, truncated = bound_bytes("好好", 5)
        assert bounded == "好"
        assert truncated is True

    def test_read_byte_limit_constant(self) -> None:
        assert READ_BYTE_LIMIT == 256 * 1024


# ---------------------------------------------------------------------------
# surface open
# ---------------------------------------------------------------------------


class TestSurfaceOpen:
    def test_result_wire_shape(self) -> None:
        result = SurfaceOpenResult(
            kind="file", target="/tmp/plan.md", title="plan.md", delivered=True
        )
        assert result.model_dump(by_alias=True) == {
            "kind": "file",
            "target": "/tmp/plan.md",
            "title": "plan.md",
            "delivered": True,
        }

    def test_args_title_optional(self) -> None:
        assert SurfaceOpenArgs(target="README.md").title is None

    def test_classify_urls(self) -> None:
        assert classify_target_kind("https://example.com/x?y=1") == "url"
        assert classify_target_kind("http://127.0.0.1:57112") == "url"

    def test_classify_paths_and_schemes(self) -> None:
        assert classify_target_kind("/tmp/a.md") is None
        assert classify_target_kind("relative/README.md") is None
        assert classify_target_kind("ftp://example.com") is None
        # Windows drive letters are filesystem paths, not URL schemes.
        assert classify_target_kind("C:\\dev\\qilin") is None
        assert classify_target_kind("c:/repos/qilin") is None


# ---------------------------------------------------------------------------
# events
# ---------------------------------------------------------------------------


def test_output_event_round_trip() -> None:
    event = TerminalOutputEvent(uuid="u-1", data="hello\n")
    parsed = TypeAdapter(AnyPortEvent).validate_python(event.model_dump())
    assert isinstance(parsed, TerminalOutputEvent)
    assert parsed.data == "hello\n"


def test_exited_event_camel_case() -> None:
    event = TerminalExitedEvent(uuid="u-1", exit_code=None, exit_signal="SIGKILL")
    dumped = event.model_dump(by_alias=True)
    assert dumped["exitSignal"] == "SIGKILL"
    assert dumped["exitCode"] is None


def test_surface_open_event_uses_session_id_alias() -> None:
    event = SurfaceOpenEvent(
        session_id="s-1", surface="url", target="https://x.y", title="x.y"
    )
    assert event.model_dump(by_alias=True)["sessionId"] == "s-1"
    parsed = TypeAdapter(AnyPortEvent).validate_python(event.model_dump(by_alias=True))
    assert isinstance(parsed, SurfaceOpenEvent)


# ---------------------------------------------------------------------------
# capabilities
# ---------------------------------------------------------------------------


def test_capability_set_v1_members() -> None:
    assert PORT_CAPABILITIES == (
        "terminal.basic",
        "terminal.stream",
        "surface.open",
        "surface.queue",
    )


def test_supports_membership_probe() -> None:
    assert supports(PORT_CAPABILITIES, "terminal.basic")
    assert not supports(PORT_CAPABILITIES, "surface.badge")
