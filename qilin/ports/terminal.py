"""Terminal port: the ABC, the scrollback transcript, and the registry.

Layering (dependencies point downward only):

- TerminalPort (ABC): the per-terminal primitive surface a backend must
  implement - spawn, write, resize, signal, kill, exit reporting. Backends
  live in qilin.ports.backends and know nothing about sessions.
- TranscriptBuffer: the retained scrollback of ONE terminal - a line-
  indexed rolling buffer under a UTF-8 byte budget (~1 MiB, DSH parity).
  Pure and synchronous; unit-testable without a pty.
- TerminalRegistry: the session-scoped facade the tool layer talks to.
  It owns ALL policy - uuid minting, ownership assertion (the server-side
  scope that never trusts client ids), clamp rules via the wire argument
  models, 256 KiB read bounding, wait_for polling, exit snapshots - and
  delegates only byte/process mechanics to a TerminalPort backend.

Async contract: create/close/wait_for are async; everything else is sync
(fds and bookkeeping only). Tests drive real shells via asyncio.run.
"""

import asyncio
import codecs
import sys
import uuid as uuid_module
from abc import ABC, abstractmethod
from collections.abc import Callable

from qilin.ports.errors import PortError
from qilin.ports.protocol.terminal import (
    DEFAULT_READ_COUNT,
    DEFAULT_WAIT_MS,
    READ_BYTE_LIMIT,
    SCROLLBACK_BYTE_LIMIT,
    TerminalReadArgs,
    TerminalReadResult,
    TerminalResizeArgs,
    TerminalSendArgs,
    TerminalSignalArgs,
    TerminalSnapshot,
    TerminalWaitExited,
    TerminalWaitForArgs,
    TerminalWaitFound,
    TerminalWaitResult,
    TerminalWaitTimeout,
    bound_bytes,
)

#: Milliseconds between wait_for transcript polls.
WAIT_POLL_INTERVAL_MS = 50


def default_shell() -> str:
    """Resolve the platform default shell (DSH parity: POSIX login shell /
    Windows powershell.exe once the ConPTY backend lands)."""
    if sys.platform == "win32":
        return "powershell.exe"
    from qilin.ports.backends.posix import default_posix_shell

    return default_posix_shell()


def _default_shell_args(shell_args: list[str] | None) -> list[str]:
    """Automatic POSIX login flag unless explicit args replace it (DSH parity)."""
    if shell_args is not None:
        return list(shell_args)
    if sys.platform == "win32":
        return []
    return ["-l"]


# ---------------------------------------------------------------------------
# TerminalPort ABC
# ---------------------------------------------------------------------------


class TerminalPort(ABC):
    """One PTY-backed terminal instance (backend-specific mechanics only).

    The registry sets on_output BEFORE start() so no early output is lost,
    and on_exit to learn about process termination. After exit, the
    backend keeps exit_code/exit_signal available for snapshot reads.
    """

    on_output: Callable[[bytes], None] | None
    on_exit: Callable[[int | None, str | None], None] | None

    @abstractmethod
    async def start(self) -> None:
        """Spawn the child on the pty."""

    @abstractmethod
    def write(self, data: bytes) -> int:
        """Write raw bytes to the pty master; returns bytes accepted."""

    @abstractmethod
    def resize(self, cols: int, rows: int) -> None:
        """Apply a new pty size (already clamped by the registry)."""

    @abstractmethod
    def signal(self, sig: str) -> None:
        """Deliver a whitelisted POSIX signal (no-op after exit)."""

    @abstractmethod
    async def close(self) -> None:
        """Force-kill and release everything. Idempotent."""

    @abstractmethod
    def exited(self) -> bool:
        """Whether the top-level process has exited."""

    @property
    @abstractmethod
    def exit_code(self) -> int | None:
        """Exit code when the process exited normally, else None."""

    @property
    @abstractmethod
    def exit_signal(self) -> str | None:
        """Signal name when the process was killed by a signal, else None."""


def make_backend(argv: list[str], cwd: str | None, cols: int, rows: int) -> TerminalPort:
    """Instantiate the platform backend (Windows pywinpty lands in P3)."""
    if sys.platform == "win32":
        raise PortError(
            "pty-deps-missing",
            "the Windows ConPTY backend (pywinpty) is not wired yet (planned P3)",
        )
    from qilin.ports.backends.posix import PosixPtyTerminal

    return PosixPtyTerminal(argv, cwd, cols, rows)


# ---------------------------------------------------------------------------
# TranscriptBuffer
# ---------------------------------------------------------------------------


class TranscriptBuffer:
    """Line-indexed rolling scrollback under a UTF-8 byte budget.

    Bytes are decoded incrementally (multi-byte sequences may split across
    chunks) and split into lines on newline; a trailing partial line is
    retained and counts as the last transcript line while non-empty. When
    the budget is exceeded the OLDEST lines are dropped - total_lines then
    describes the retained transcript, exactly like DSH.
    """

    def __init__(self, byte_budget: int = SCROLLBACK_BYTE_LIMIT) -> None:
        self._budget = byte_budget
        self._lines: list[str] = []
        self._pending = ""
        self._bytes_used = 0
        self._decoder = codecs.getincrementaldecoder("utf-8")(errors="replace")

    def feed(self, data: bytes) -> None:
        """Ingest one raw PTY chunk."""
        text = self._decoder.decode(data)
        if not text:
            return
        self._pending += text
        while "\n" in self._pending:
            line, _, rest = self._pending.partition("\n")
            self._push(line.rstrip("\r"))
            self._pending = rest
        self._trim()

    def _push(self, line: str) -> None:
        self._lines.append(line)
        self._bytes_used += len(line.encode("utf-8")) + 1  # + newline

    def _trim(self) -> None:
        used = self._bytes_used + (
            len(self._pending.encode("utf-8")) if self._pending else 0
        )
        index = 0
        while used > self._budget and index < len(self._lines):
            used -= len(self._lines[index].encode("utf-8")) + 1
            index += 1
        if index > 0:
            del self._lines[:index]
            self._bytes_used = used

    def lines_view(self) -> list[str]:
        """Retained transcript lines, including the pending tail if any."""
        if self._pending:
            return [*self._lines, self._pending]
        return list(self._lines)

    def total_lines(self) -> int:
        return len(self._lines) + (1 if self._pending else 0)

    def render_page(self, offset: int, count: int) -> tuple[str, int, int, int]:
        """Render one page; returns (text, total_lines, line_begin, line_end).

        offset is 0-based from the start, or negative to read from the end
        (e.g. -50 = the last 50 lines). Bounds always describe the sliced
        window within the retained transcript.
        """
        view = self.lines_view()
        total = len(view)
        if offset >= 0:
            begin = min(offset, total)
        else:
            begin = max(0, total + offset)
        end = min(begin + count, total)
        return "\n".join(view[begin:end]), total, begin, end


# ---------------------------------------------------------------------------
# TerminalRegistry
# ---------------------------------------------------------------------------


class _TerminalEntry:
    """Registry record for one terminal."""

    def __init__(self, owner: str, title: str, command: str, backend: TerminalPort) -> None:
        self.owner = owner
        self.title = title
        self.command = command
        self.backend = backend
        self.transcript = TranscriptBuffer()


class TerminalRegistry:
    """Session-scoped terminal facade with DSH-parity policy.

    Ownership: every uuid is bound to the creating session id at create
    time; every subsequent call asserts ownership server-side. A foreign
    session gets 'forbidden' (existence not leaked), an unknown uuid gets
    'not-found'. Close keeps a tombstone so the DSH idempotency contract
    holds: closing an owned already-gone uuid returns closed=False.
    """

    def __init__(
        self,
        *,
        scrollback_bytes: int = SCROLLBACK_BYTE_LIMIT,
        backend_factory: Callable[[list[str], str | None, int, int], TerminalPort]
        | None = None,
    ) -> None:
        self._scrollback_bytes = scrollback_bytes
        self._backend_factory = backend_factory or make_backend
        self._entries: dict[str, _TerminalEntry] = {}
        self._tombstones: dict[str, str] = {}  # uuid -> owner

    # -- create ---------------------------------------------------------------

    async def create(
        self,
        owner: str,
        title: str,
        command: str = "",
        cwd: str | None = None,
        cols: int = 80,
        rows: int = 24,
        shell: str | None = None,
        shell_args: list[str] | None = None,
    ) -> str:
        """Spawn a detached shell; returns the opaque terminal uuid.

        Mirrors DSH terminal_create: an interactive shell is spawned and,
        when command is non-empty, the command is written to its stdin
        with a trailing carriage return (the host appends the Enter -
        callers never embed newlines).
        """
        shell_path = shell or default_shell()
        argv = [shell_path, *_default_shell_args(shell_args)]
        backend = self._backend_factory(argv, cwd, cols, rows)
        entry = _TerminalEntry(owner, title, command, backend)
        if self._scrollback_bytes != SCROLLBACK_BYTE_LIMIT:
            entry.transcript = TranscriptBuffer(byte_budget=self._scrollback_bytes)
        backend.on_output = entry.transcript.feed
        await backend.start()
        terminal_uuid = str(uuid_module.uuid4())
        self._entries[terminal_uuid] = entry
        if command:
            backend.write((command + "\r").encode("utf-8"))
        return terminal_uuid

    # -- ownership ------------------------------------------------------------

    def assert_owned(self, terminal_uuid: str, owner: str) -> _TerminalEntry:
        """Server-side scope check; raises PortError on violation."""
        entry = self._entries.get(terminal_uuid)
        if entry is not None:
            if entry.owner != owner:
                raise PortError("forbidden", "terminal belongs to another session")
            return entry
        tombstone_owner = self._tombstones.get(terminal_uuid)
        if tombstone_owner is not None:
            if tombstone_owner != owner:
                raise PortError("forbidden", "terminal belongs to another session")
            raise PortError("not-found", "terminal is already closed")
        raise PortError("not-found", "unknown terminal uuid")

    # -- primitives -----------------------------------------------------------

    def send(self, terminal_uuid: str, owner: str, text: str, submit: bool = False) -> int:
        """Write keystrokes; returns UTF-8 bytes written (Enter included)."""
        args = TerminalSendArgs(uuid=terminal_uuid, text=text, submit=submit)
        entry = self.assert_owned(args.uuid, owner)
        payload = (args.text + "\r") if args.submit else args.text
        raw = payload.encode("utf-8")
        entry.backend.write(raw)
        # DSH parity: the result counts intent (payload + Enter), not
        # partial-write mechanics; backends queue on EAGAIN.
        return len(raw)

    def read(
        self, terminal_uuid: str, owner: str, offset: int = 0, count: int = DEFAULT_READ_COUNT
    ) -> TerminalReadResult:
        """Render a bounded page of the retained transcript (<=256 KiB)."""
        args = TerminalReadArgs(uuid=terminal_uuid, offset=offset, count=count)
        entry = self.assert_owned(args.uuid, owner)
        text, total, begin, end = entry.transcript.render_page(args.offset, args.count)
        bounded, truncated = bound_bytes(text, READ_BYTE_LIMIT)
        return TerminalReadResult(
            text=bounded,
            total_lines=total,
            line_begin=begin,
            line_end=end,
            truncated=truncated,
        )

    async def wait_for(
        self,
        terminal_uuid: str,
        owner: str,
        needle: str,
        timeout_ms: int = DEFAULT_WAIT_MS,
    ) -> TerminalWaitResult:
        """Poll the full retained transcript until needle / timeout / exit.

        Cooperative cancellation: cancelling the awaiting task stops the
        wait immediately (DSH tool-call cancel parity).
        """
        args = TerminalWaitForArgs(uuid=terminal_uuid, needle=needle, timeout_ms=timeout_ms)
        entry = self.assert_owned(args.uuid, owner)
        loop = asyncio.get_running_loop()
        started = loop.time()
        deadline = started + args.timeout_ms / 1000
        while True:
            view = entry.transcript.lines_view()
            for index, line in enumerate(view):
                column = line.find(args.needle)
                if column >= 0:
                    elapsed_ms = int((loop.time() - started) * 1000)
                    return TerminalWaitFound(
                        needle=args.needle, line=index, column=column, elapsed_ms=elapsed_ms
                    )
            if entry.backend.exited():
                return TerminalWaitExited(
                    needle=args.needle,
                    exit_code=entry.backend.exit_code,
                    exit_signal=entry.backend.exit_signal,
                )
            if loop.time() >= deadline:
                return TerminalWaitTimeout(
                    needle=args.needle,
                    timeout_ms=args.timeout_ms,
                    total_lines=entry.transcript.total_lines(),
                )
            await asyncio.sleep(WAIT_POLL_INTERVAL_MS / 1000)

    def resize(self, terminal_uuid: str, owner: str, cols: int, rows: int) -> tuple[int, int]:
        """Resize the pty; returns the clamped dimensions applied."""
        args = TerminalResizeArgs(uuid=terminal_uuid, cols=cols, rows=rows)
        entry = self.assert_owned(args.uuid, owner)
        entry.backend.resize(args.cols, args.rows)
        return args.cols, args.rows

    def signal(self, terminal_uuid: str, owner: str, sig: str) -> None:
        """Deliver a whitelisted signal to the terminal's foreground group."""
        TerminalSignalArgs(uuid=terminal_uuid, signal=sig)  # wire validation
        entry = self.assert_owned(terminal_uuid, owner)
        entry.backend.signal(sig)

    async def close(self, terminal_uuid: str, owner: str) -> bool:
        """Dispose of one terminal; idempotent for owned uuids.

        DSH contract: closing an owned already-closed uuid is a no-op
        (closed=False); a FOREIGN uuid is forbidden regardless of state,
        an unknown one is not-found. Other verbs on a closed uuid go
        through assert_owned and fail with not-found instead.
        """
        entry = self._entries.get(terminal_uuid)
        if entry is not None:
            if entry.owner != owner:
                raise PortError("forbidden", "terminal belongs to another session")
            self._entries.pop(terminal_uuid)
            self._tombstones[terminal_uuid] = owner
            await entry.backend.close()
            return True
        tombstone_owner = self._tombstones.get(terminal_uuid)
        if tombstone_owner is not None:
            if tombstone_owner != owner:
                raise PortError("forbidden", "terminal belongs to another session")
            return False
        raise PortError("not-found", "unknown terminal uuid")

    def list(self, owner: str) -> list[TerminalSnapshot]:
        """Snapshots of every live terminal owned by one session."""
        snapshots: list[TerminalSnapshot] = []
        for terminal_uuid, entry in self._entries.items():
            if entry.owner != owner:
                continue
            snapshots.append(
                TerminalSnapshot(
                    uuid=terminal_uuid,
                    title=entry.title,
                    command=entry.command,
                    exited=entry.backend.exited(),
                    exit_code=entry.backend.exit_code,
                    exit_signal=entry.backend.exit_signal,
                )
            )
        return snapshots

    async def close_all(self, owner: str) -> None:
        """Release every terminal of one session (session teardown path)."""
        owned = [u for u, entry in self._entries.items() if entry.owner == owner]
        for terminal_uuid in owned:
            await self.close(terminal_uuid, owner)


__all__ = [
    "WAIT_POLL_INTERVAL_MS",
    "TerminalPort",
    "TerminalRegistry",
    "TranscriptBuffer",
    "default_shell",
]