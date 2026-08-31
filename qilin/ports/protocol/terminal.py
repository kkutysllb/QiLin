"""Terminal tool contracts, mirrored from DSH terminal_* tools.

Source of truth: dsh-plugins/DSH-better-sidebar src/tools.ts (the eight
model-facing tools) and src/agent-pty.ts (registry constants). QiLin
implements the same names, argument shapes, result shapes, defaults, and
clamp rules so the DSH vocabulary transfers unchanged.

Semantics are tmux-like: terminals are created detached
(spawn-and-detach), outlive the creating tool call, and every later
operation keys on the opaque uuid. Ownership is enforced server-side
against the calling agent's session — never against a client-supplied id
(the DSH assertOwned equivalent).
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# ---------------------------------------------------------------------------
# Constants (mirrored from agent-pty.ts / tools.ts)
# ---------------------------------------------------------------------------

#: UTF-8 bytes of one terminal_read result text (256 KiB).
READ_BYTE_LIMIT = 256 * 1024
#: Retained transcript budget per terminal (~1 MiB of scrollback).
SCROLLBACK_BYTE_LIMIT = 1024 * 1024
#: Default / hard-cap line page of one terminal_read call.
DEFAULT_READ_COUNT = 500
MAX_READ_COUNT = 500
#: pty resize clamp (cols and rows).
RESIZE_MIN = 2
RESIZE_MAX = 1024
#: terminal_wait_for default timeout and lower clamp, in milliseconds.
DEFAULT_WAIT_MS = 10_000
MIN_WAIT_MS = 100

#: POSIX signals the registry forwards to a live pty. On Windows only
#: SIGKILL and SIGTERM are effective; the rest are accepted but may no-op.
ALLOWED_SIGNALS = ("SIGINT", "SIGTERM", "SIGKILL", "SIGHUP", "SIGTSTP")
TerminalSignal = Literal["SIGINT", "SIGTERM", "SIGKILL", "SIGHUP", "SIGTSTP"]

#: Tool names of the terminal family, in DSH spelling.
TERMINAL_TOOL_NAMES = (
    "terminal_create",
    "terminal_list",
    "terminal_send",
    "terminal_read",
    "terminal_wait_for",
    "terminal_resize",
    "terminal_signal",
    "terminal_close",
)

# Shared model config: camelCase wire aliases, strict extra rejection
# (mirrors additionalProperties: false), immutable value objects.
_WIRE = ConfigDict(populate_by_name=True, extra="forbid", frozen=True)


def bound_bytes(text: str, max_bytes: int) -> tuple[str, bool]:
    """Truncate text to at most max_bytes UTF-8 bytes.

    Truncation never splits a multi-byte sequence: when the cap lands
    inside one, the walk-back retreats to the sequence's leading byte so
    the retained prefix decodes cleanly (a split would decode to U+FFFD).
    Returns (bounded_text, truncated).
    """
    buf = text.encode("utf-8")
    if len(buf) <= max_bytes:
        return text, False
    end = max_bytes
    while end > 0 and (buf[end] & 0b1100_0000) == 0b1000_0000:
        end -= 1
    return buf[:end].decode("utf-8"), True


# ---------------------------------------------------------------------------
# terminal_create
# ---------------------------------------------------------------------------


class TerminalCreateArgs(BaseModel):
    """Open a persistent terminal and run command in it (Enter appended).

    command="" opens a bare shell with no initial command. The terminal
    outlives the tool call; pair later writes with terminal_read.
    """

    model_config = _WIRE

    title: str = Field(description="Short human-readable label for the terminal tab.")
    command: str = Field(description="Shell command to run; empty string opens a bare shell.")


class TerminalCreateResult(BaseModel):
    """Opaque handle for the new terminal."""

    model_config = _WIRE

    uuid: str
    title: str


# ---------------------------------------------------------------------------
# terminal_list
# ---------------------------------------------------------------------------


class TerminalSnapshot(BaseModel):
    """One terminal as returned by terminal_list."""

    model_config = _WIRE

    uuid: str
    title: str
    command: str
    exited: bool
    exit_code: int | None = Field(default=None, alias="exitCode")
    exit_signal: str | None = Field(default=None, alias="exitSignal")


#: terminal_list returns a bare array of snapshots (no envelope).
TerminalListResult = list[TerminalSnapshot]


# ---------------------------------------------------------------------------
# terminal_send
# ---------------------------------------------------------------------------


class TerminalSendArgs(BaseModel):
    """Write raw text (keystrokes) to the pty stdin, tmux send-keys style.

    submit=True appends an Enter (carriage return); callers must not embed
    trailing newlines themselves. Control keys go through terminal_signal,
    never through literal control characters.
    """

    model_config = _WIRE

    uuid: str
    text: str
    submit: bool = False


class TerminalSendResult(BaseModel):
    """Bytes actually written (including the appended Enter, if any)."""

    model_config = _WIRE

    uuid: str
    byte_count: int = Field(alias="bytes")


# ---------------------------------------------------------------------------
# terminal_read
# ---------------------------------------------------------------------------


class TerminalReadArgs(BaseModel):
    """Read a bounded page of the retained transcript.

    offset is 0-based from the start; negative reads from the end (e.g.
    -50 reads the last 50 lines). count is clamped to 1..500.
    """

    model_config = _WIRE

    uuid: str
    offset: int = 0
    count: int = DEFAULT_READ_COUNT

    @field_validator("count")
    @classmethod
    def _clamp_count(cls, value: int) -> int:
        return max(1, min(value, MAX_READ_COUNT))


class TerminalReadResult(BaseModel):
    """One transcript page; text is byte-bounded to 256 KiB."""

    model_config = _WIRE

    text: str
    total_lines: int = Field(alias="totalLines")
    line_begin: int = Field(alias="lineBegin")
    line_end: int = Field(alias="lineEnd")
    truncated: bool


# ---------------------------------------------------------------------------
# terminal_wait_for
# ---------------------------------------------------------------------------


class TerminalWaitForArgs(BaseModel):
    """Block until needle appears in the transcript, the timeout elapses,
    or the terminal exits — whichever comes first.

    The needle is matched case-sensitively and must be non-empty; the
    timeout is clamped to a minimum of 100 ms.
    """

    model_config = _WIRE

    uuid: str
    needle: Annotated[str, Field(min_length=1)]
    timeout_ms: int = DEFAULT_WAIT_MS

    @field_validator("timeout_ms")
    @classmethod
    def _clamp_timeout(cls, value: int) -> int:
        return max(value, MIN_WAIT_MS)


class TerminalWaitFound(BaseModel):
    """The needle appeared in the retained transcript."""

    model_config = _WIRE

    kind: Literal["found"] = "found"
    needle: str
    line: int
    column: int
    elapsed_ms: int = Field(alias="elapsedMs")


class TerminalWaitTimeout(BaseModel):
    """The timeout elapsed before the needle appeared."""

    model_config = _WIRE

    kind: Literal["timeout"] = "timeout"
    needle: str
    timeout_ms: int = Field(alias="timeoutMs")
    total_lines: int = Field(alias="totalLines")


class TerminalWaitExited(BaseModel):
    """The terminal process died before the needle appeared."""

    model_config = _WIRE

    kind: Literal["exited"] = "exited"
    needle: str
    exit_code: int | None = Field(default=None, alias="exitCode")
    exit_signal: str | None = Field(default=None, alias="exitSignal")


TerminalWaitResult = Annotated[
    TerminalWaitFound | TerminalWaitTimeout | TerminalWaitExited,
    Field(discriminator="kind"),
]


# ---------------------------------------------------------------------------
# terminal_resize / terminal_signal / terminal_close
# ---------------------------------------------------------------------------


class TerminalResizeArgs(BaseModel):
    """Resize the pty; both axes clamp to 2..1024. No-op after exit."""

    model_config = _WIRE

    uuid: str
    cols: int
    rows: int

    @field_validator("cols", "rows")
    @classmethod
    def _clamp_axis(cls, value: int) -> int:
        return max(RESIZE_MIN, min(value, RESIZE_MAX))


class TerminalResizeResult(BaseModel):
    """The dimensions actually applied."""

    model_config = _WIRE

    uuid: str
    cols: int
    rows: int


class TerminalSignalArgs(BaseModel):
    """Deliver a POSIX signal to the foreground process (Ctrl+C etc.)."""

    model_config = _WIRE

    uuid: str
    signal: TerminalSignal


class TerminalSignalResult(BaseModel):
    model_config = _WIRE

    uuid: str
    signal: TerminalSignal


class TerminalCloseArgs(BaseModel):
    """Dispose of the terminal; idempotent (already-gone uuid → closed=False)."""

    model_config = _WIRE

    uuid: str


class TerminalCloseResult(BaseModel):
    model_config = _WIRE

    uuid: str
    closed: bool
