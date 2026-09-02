"""Tests for the terminal port: TranscriptBuffer, registry policy, and
the POSIX pty backend end to end.

Two layers are covered separately:

- Pure/deterministic: TranscriptBuffer (parsing, paging, trimming,
  multi-byte splits) and the registry's ownership/tombstone/bounding
  policy through a scripted fake backend (no processes).
- Integration: real shells on a real pty through asyncio.run - spawn,
  command round-trip, wait_for variants, signals, close idempotency,
  pagination on live output. Every spawned process is short-lived or
  explicitly killed; nothing is left running.
"""

import asyncio
import os
import sys

import pytest

from qilin.ports.errors import PortError
from qilin.ports.protocol.terminal import READ_BYTE_LIMIT
from qilin.ports.terminal import TerminalPort, TerminalRegistry, TranscriptBuffer

SH = "/bin/sh"
NO_LOGIN = []  # explicit empty shell_args -> no automatic -l


# ---------------------------------------------------------------------------
# TranscriptBuffer (pure)
# ---------------------------------------------------------------------------


class TestTranscriptBuffer:
    def test_feed_splits_lines_and_keeps_pending(self) -> None:
        buffer = TranscriptBuffer()
        buffer.feed(b"line one\nline two\nline three")
        assert buffer.lines_view() == ["line one", "line two", "line three"]
        assert buffer.total_lines() == 3

    def test_feed_strips_carriage_returns(self) -> None:
        buffer = TranscriptBuffer()
        buffer.feed(b"a\r\nb\r\n")
        assert buffer.lines_view() == ["a", "b"]

    def test_multibyte_sequence_split_across_chunks(self) -> None:
        buffer = TranscriptBuffer()
        buffer.feed("好".encode()[:2])  # first 2 bytes of a 3-byte char
        buffer.feed("好".encode()[2:] + b"\n")
        assert buffer.lines_view() == ["好"]

    def test_page_positive_offset_window(self) -> None:
        buffer = TranscriptBuffer()
        buffer.feed(b"l1\nl2\nl3\nl4\nl5\n")
        text, total, begin, end = buffer.render_page(1, 2)
        assert (text, total, begin, end) == ("l2\nl3", 5, 1, 3)

    def test_page_negative_offset_reads_tail(self) -> None:
        buffer = TranscriptBuffer()
        buffer.feed(b"l1\nl2\nl3\n")
        text, total, begin, end = buffer.render_page(-2, 10)
        assert (text, total, begin, end) == ("l2\nl3", 3, 1, 3)

    def test_page_offset_beyond_end_clamps(self) -> None:
        buffer = TranscriptBuffer()
        buffer.feed(b"l1\nl2\n")
        text, total, begin, end = buffer.render_page(99, 10)
        assert (text, total, begin, end) == ("", 2, 2, 2)

    def test_trim_drops_oldest_under_budget(self) -> None:
        buffer = TranscriptBuffer(byte_budget=16)
        for i in range(10):
            buffer.feed(f"line-{i:02d}--------\n".encode())  # 19 bytes/line
        view = buffer.lines_view()
        assert len(view) < 10  # oldest lines were dropped
        # The budget governs retained completed lines.
        used = sum(len(line.encode()) + 1 for line in view)
        assert used <= 16 + len(view[-1].encode()) + 1  # pending tail may stick out

    def test_pending_tail_survives_trim(self) -> None:
        buffer = TranscriptBuffer(byte_budget=8)
        buffer.feed(b"aaaaaaaa\n")  # 9 bytes: nothing retained
        buffer.feed(b"tail")
        assert buffer.lines_view() == ["tail"]


# ---------------------------------------------------------------------------
# Fake backend for registry policy tests
# ---------------------------------------------------------------------------


class FakeBackend(TerminalPort):
    """Scripted backend: no process, feeds bytes on demand."""

    def __init__(self) -> None:
        self.on_output = None
        self.on_exit = None
        self.written: list[bytes] = []
        self.resized: list[tuple[int, int]] = []
        self.signaled: list[str] = []
        self.closed = False
        self._exited = False
        self._exit_code: int | None = None
        self._exit_signal: str | None = None

    async def start(self) -> None:
        pass

    def write(self, data: bytes) -> int:
        self.written.append(bytes(data))
        return len(data)

    def resize(self, cols: int, rows: int) -> None:
        self.resized.append((cols, rows))

    def signal(self, sig: str) -> None:
        self.signaled.append(sig)

    async def close(self) -> None:
        self.closed = True

    def exited(self) -> bool:
        return self._exited

    @property
    def exit_code(self) -> int | None:
        return self._exit_code

    @property
    def exit_signal(self) -> str | None:
        return self._exit_signal

    # test helpers
    def emit(self, data: bytes) -> None:
        if self.on_output is not None:
            self.on_output(data)

    def finish(self, code: int | None = 0, sig: str | None = None) -> None:
        self._exited = True
        self._exit_code = None if sig else code
        self._exit_signal = sig
        if self.on_exit is not None:
            self.on_exit(self._exit_code, self._exit_signal)


def fake_factory(backends: list[FakeBackend]):
    def factory(argv, cwd, cols, rows) -> FakeBackend:
        backend = FakeBackend()
        backends.append(backend)
        return backend

    return factory


class TestRegistryPolicy:
    def test_send_counts_enter_and_write_payload(self) -> None:
        backends: list[FakeBackend] = []
        registry = TerminalRegistry(backend_factory=fake_factory(backends))
        terminal_uuid = asyncio.run(registry.create("s1", "t", shell=SH, shell_args=NO_LOGIN))
        written = registry.send(terminal_uuid, "s1", "ls -la", submit=True)
        assert written == len(b"ls -la\r")
        assert backends[0].written[-1] == b"ls -la\r"

    def test_ownership_forbidden_and_not_found(self) -> None:
        backends: list[FakeBackend] = []
        registry = TerminalRegistry(backend_factory=fake_factory(backends))
        terminal_uuid = asyncio.run(registry.create("s1", "t", shell=SH, shell_args=NO_LOGIN))

        with pytest.raises(PortError) as forbidden:
            registry.read(terminal_uuid, "s2")
        assert forbidden.value.code == "forbidden"

        with pytest.raises(PortError) as missing:
            registry.read("no-such-uuid", "s1")
        assert missing.value.code == "not-found"

    def test_read_bounds_page_to_256kib(self) -> None:
        backends: list[FakeBackend] = []
        registry = TerminalRegistry(backend_factory=fake_factory(backends))
        terminal_uuid = asyncio.run(registry.create("s1", "t", shell=SH, shell_args=NO_LOGIN))
        backends[0].emit(b"x" * (400 * 1024))  # one giant line
        result = registry.read(terminal_uuid, "s1")
        assert result.truncated is True
        assert len(result.text.encode()) <= READ_BYTE_LIMIT

    def test_close_tombstone_contract(self) -> None:
        backends: list[FakeBackend] = []
        registry = TerminalRegistry(backend_factory=fake_factory(backends))
        terminal_uuid = asyncio.run(registry.create("s1", "t", shell=SH, shell_args=NO_LOGIN))

        assert asyncio.run(registry.close(terminal_uuid, "s1")) is True
        assert backends[0].closed is True
        # Owned already-closed uuid: idempotent no-op, not an error.
        assert asyncio.run(registry.close(terminal_uuid, "s1")) is False
        # Other verbs on the closed uuid fail closed.
        with pytest.raises(PortError) as missing:
            registry.read(terminal_uuid, "s1")
        assert missing.value.code == "not-found"
        # Foreign close on a tombstone is forbidden, never a leak.
        with pytest.raises(PortError) as forbidden:
            asyncio.run(registry.close(terminal_uuid, "s2"))
        assert forbidden.value.code == "forbidden"

    def test_list_scopes_to_owner(self) -> None:
        backends: list[FakeBackend] = []
        registry = TerminalRegistry(backend_factory=fake_factory(backends))
        asyncio.run(registry.create("s1", "a", shell=SH, shell_args=NO_LOGIN))
        asyncio.run(registry.create("s1", "b", shell=SH, shell_args=NO_LOGIN))
        asyncio.run(registry.create("s2", "c", shell=SH, shell_args=NO_LOGIN))
        assert [snap.title for snap in registry.list("s1")] == ["a", "b"]
        assert [snap.title for snap in registry.list("s2")] == ["c"]

    def test_resize_clamps_via_wire_args(self) -> None:
        backends: list[FakeBackend] = []
        registry = TerminalRegistry(backend_factory=fake_factory(backends))
        terminal_uuid = asyncio.run(registry.create("s1", "t", shell=SH, shell_args=NO_LOGIN))
        assert registry.resize(terminal_uuid, "s1", 0, 99_999) == (2, 1024)
        assert backends[0].resized == [(2, 1024)]

    def test_wait_for_found_and_exited_fake(self) -> None:
        backends: list[FakeBackend] = []
        registry = TerminalRegistry(backend_factory=fake_factory(backends))
        terminal_uuid = asyncio.run(registry.create("s1", "t", shell=SH, shell_args=NO_LOGIN))

        async def scenario() -> None:
            backends[0].emit(b"build done\n")
            found = await registry.wait_for(terminal_uuid, "s1", "done", timeout_ms=1000)
            assert found.kind == "found"

            backends[0].finish(code=3)
            exited = await registry.wait_for(terminal_uuid, "s1", "never", timeout_ms=1000)
            assert exited.kind == "exited"
            assert exited.exit_code == 3

        asyncio.run(scenario())


# ---------------------------------------------------------------------------
# POSIX pty integration (real shells)
# ---------------------------------------------------------------------------


def run(coro):
    return asyncio.run(coro)


def _pty_available() -> bool:
    """Whether this environment can allocate pty devices at all (some
    sandboxed CI runners cannot) - integration tests skip instead of
    failing there."""
    try:
        import pty

        master, slave = pty.openpty()
        os.close(master)
        os.close(slave)
        return True
    except OSError:
        return False


@pytest.mark.skipif(sys.platform == "win32", reason="POSIX pty only")
@pytest.mark.skipif(
    not _pty_available(), reason="pty devices unavailable in this environment"
)
class TestPosixPtyIntegration:
    def test_command_round_trip_and_wait_found(self) -> None:
        async def scenario() -> None:
            registry = TerminalRegistry()
            terminal_uuid = await registry.create(
                "s1", "echo", command="echo qilin-pty-ok", shell=SH, shell_args=NO_LOGIN
            )
            result = await registry.wait_for(terminal_uuid, "s1", "qilin-pty-ok", timeout_ms=5000)
            assert result.kind == "found"
            await registry.close_all("s1")

        run(scenario())

    def test_read_pagination_on_live_output(self) -> None:
        async def scenario() -> None:
            registry = TerminalRegistry()
            terminal_uuid = await registry.create(
                "s1",
                "lines",
                command='printf "l1\\nl2\\nl3\\n"',
                shell=SH,
                shell_args=NO_LOGIN,
            )
            await registry.wait_for(terminal_uuid, "s1", "l3", timeout_ms=5000)
            # An interactive shell on a pty echoes the command and prints
            # prompts into the transcript (DSH reality too), so pagination
            # is asserted structurally: l1/l2/l3 must exist and page
            # windows must slice the retained transcript consistently.
            await asyncio.sleep(0.3)  # let the trailing prompt land
            full = registry.read(terminal_uuid, "s1", offset=0, count=500)
            lines = full.text.splitlines()
            # Prompt and output can coalesce onto one line on some platforms
            # (e.g. dash on Linux echoes "$ l1"), so content presence is
            # asserted at substring level; paging is asserted structurally
            # against the actual transcript lines below.
            for marker in ("l1", "l2", "l3"):
                assert marker in full.text

            head = registry.read(terminal_uuid, "s1", offset=0, count=1)
            assert (head.line_begin, head.line_end) == (0, 1)
            assert head.text == lines[0]

            tail = registry.read(terminal_uuid, "s1", offset=-1, count=1)
            assert tail.line_end == tail.total_lines
            assert tail.text == lines[-1]

            window = registry.read(terminal_uuid, "s1", offset=1, count=2)
            assert window.text == "\n".join(lines[1:3])
            await registry.close_all("s1")

        run(scenario())

    def test_exit_code_captured(self) -> None:
        async def scenario() -> None:
            registry = TerminalRegistry()
            terminal_uuid = await registry.create(
                "s1", "exit", command="exit 7", shell=SH, shell_args=NO_LOGIN
            )
            result = await registry.wait_for(
                terminal_uuid, "s1", "never-appears", timeout_ms=5000
            )
            assert result.kind == "exited"
            assert result.exit_code == 7
            snapshots = registry.list("s1")
            assert snapshots[0].exited is True
            await registry.close(terminal_uuid, "s1")

        run(scenario())

    def test_signal_sigint_kills_foreground(self) -> None:
        async def scenario() -> None:
            registry = TerminalRegistry()
            terminal_uuid = await registry.create(
                "s1", "sleeper", command="exec sleep 60", shell=SH, shell_args=NO_LOGIN
            )
            # Give the child a beat to settle into the pty foreground group
            # before signalling; on loaded runners an immediate SIGINT can
            # land before the session leader setup completes.
            await asyncio.sleep(0.3)
            registry.signal(terminal_uuid, "s1", "SIGINT")
            result = await registry.wait_for(
                terminal_uuid, "s1", "never-appears", timeout_ms=5000
            )
            assert result.kind == "exited"
            # Linux wait accounting may report a shell-wrapped signal death
            # as exit code 130 instead of exit_signal; the contract under
            # test is "the foreground sleeper died from the signal".
            assert result.exit_signal == "SIGINT" or result.exit_code == 130
            await registry.close(terminal_uuid, "s1")

        run(scenario())

    def test_resize_returns_clamped_dims(self) -> None:
        async def scenario() -> None:
            registry = TerminalRegistry()
            terminal_uuid = await registry.create("s1", "t", shell=SH, shell_args=NO_LOGIN)
            assert registry.resize(terminal_uuid, "s1", 40, 10) == (40, 10)
            await registry.close(terminal_uuid, "s1")

        run(scenario())

    def test_close_releases_and_lists_empty(self) -> None:
        async def scenario() -> None:
            registry = TerminalRegistry()
            terminal_uuid = await registry.create(
                "s1", "long", command="exec sleep 60", shell=SH, shell_args=NO_LOGIN
            )
            assert registry.list("s1")[0].exited is False
            assert await registry.close(terminal_uuid, "s1") is True
            assert registry.list("s1") == []

        run(scenario())
