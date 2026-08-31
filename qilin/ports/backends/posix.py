"""POSIX PTY backend: asyncio subprocess behind os.openpty.

Design notes:

- The child is spawned with start_new_session=True (its own session,
  no controlling tty yet); the preexec hook then claims the slave as its
  controlling terminal (TIOCSCTTY) so job control (Ctrl+C reaching the
  foreground process group) works like a real terminal. preexec_fn runs
  between fork and exec with std fds already redirected — it must stay
  async-signal-safe minimal, and it carries CPython's documented
  fork-with-threads caveat (the same one every in-process PTY spawner
  in this style carries).
- The master fd is non-blocking and read through loop.add_reader; raw
  bytes flow to the on_output sink untouched — decoding is registry
  policy (incremental UTF-8), not backend policy.
- signal(): SIGKILL terminates the whole terminal (the session leader);
  every other signal goes to the pty's FOREGROUND process group via
  tcgetpgrp + killpg, which is what Ctrl+C means on a real terminal.
  Fallback to the direct child when the pgrp query fails (races with
  exit).
"""

from __future__ import annotations

import asyncio
import fcntl
import os
import pty
import signal
import struct
import termios
from collections.abc import Callable

from qilin.ports.errors import PortError
from qilin.ports.terminal import TerminalPort

_READ_CHUNK = 65536
_KILL_GRACE_SECONDS = 5.0


def default_posix_shell() -> str:
    """Resolve the login shell: $SHELL, then the passwd database, then sh."""
    shell = os.environ.get("SHELL", "")
    if shell:
        return shell
    try:
        import pwd

        return pwd.getpwuid(os.getuid()).pw_shell or "/bin/sh"
    except Exception:
        return "/bin/sh"


def _claim_controlling_tty() -> None:  # pragma: no cover - runs in the forked child
    """Make the slave (already on std fds) the child's controlling terminal."""
    try:
        fcntl.ioctl(0, termios.TIOCSCTTY, 0)
    except Exception:
        pass


class PosixPtyTerminal(TerminalPort):
    """One PTY-backed terminal on a POSIX host."""

    def __init__(
        self,
        argv: list[str],
        cwd: str | None,
        cols: int,
        rows: int,
    ) -> None:
        self._argv = argv
        self._cwd = cwd
        self._cols = cols
        self._rows = rows
        self._master: int | None = None
        self._proc: asyncio.subprocess.Process | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._pending_out = bytearray()
        self._writer_on = False
        self._released = False
        self._exit_code: int | None = None
        self._exit_signal: str | None = None
        self.on_output: Callable[[bytes], None] | None = None
        self.on_exit: Callable[[int | None, str | None], None] | None = None

    # -- lifecycle ---------------------------------------------------------

    async def start(self) -> None:
        """Spawn the child on a fresh pty and start watching it."""
        master, slave = pty.openpty()
        try:
            self._apply_winsize(slave)
        except OSError:
            pass  # winsize is best-effort before spawn
        try:
            self._proc = await asyncio.create_subprocess_exec(
                *self._argv,
                stdin=slave,
                stdout=slave,
                stderr=slave,
                cwd=self._cwd,
                start_new_session=True,
                preexec_fn=_claim_controlling_tty,
            )
        except Exception:
            os.close(master)
            os.close(slave)
            raise
        # The child holds its own slave dup; ours is no longer needed.
        os.close(slave)
        self._master = master
        os.set_blocking(master, False)
        self._loop = asyncio.get_running_loop()
        self._loop.add_reader(master, self._on_readable)
        self._loop.create_task(self._watch())

    async def _watch(self) -> None:
        assert self._proc is not None
        returncode = await self._proc.wait()
        if returncode < 0:
            self._exit_signal = _signal_name(returncode)
            self._exit_code = None
        else:
            self._exit_code = returncode
            self._exit_signal = None
        self._teardown_reader()
        if self.on_exit is not None:
            self.on_exit(self._exit_code, self._exit_signal)

    def _teardown_reader(self) -> None:
        if self._master is not None and self._loop is not None:
            try:
                self._loop.remove_reader(self._master)
            except Exception:
                pass
        self._drain_writer()
        if self._master is not None:
            try:
                os.close(self._master)
            except OSError:
                pass
            self._master = None

    # -- output --------------------------------------------------------------

    def _on_readable(self) -> None:
        assert self._master is not None
        while True:
            try:
                data = os.read(self._master, _READ_CHUNK)
            except BlockingIOError:
                return
            except OSError:
                return  # EIO: child side closed, the watch task reports exit
            if not data:
                return  # EOF; exit handling belongs to _watch
            if self.on_output is not None:
                self.on_output(data)

    # -- input / primitives ----------------------------------------------------

    def write(self, data: bytes) -> int:
        if self._master is None:
            raise PortError("pty-error", "terminal is not running")
        try:
            return os.write(self._master, data)
        except BlockingIOError:
            self._pending_out.extend(data)
            self._arm_writer()
            return 0

    def _arm_writer(self) -> None:
        if not self._writer_on and self._master is not None and self._loop is not None:
            self._writer_on = True
            self._loop.add_writer(self._master, self._drain_writer)

    def _drain_writer(self) -> None:
        if self._master is None:
            return
        while self._pending_out:
            try:
                written = os.write(self._master, bytes(self._pending_out))
            except BlockingIOError:
                return
            except OSError:
                del self._pending_out[:]
                break
            del self._pending_out[:written]
        if not self._pending_out and self._writer_on and self._loop is not None:
            self._writer_on = False
            try:
                self._loop.remove_writer(self._master)
            except Exception:
                pass

    def resize(self, cols: int, rows: int) -> None:
        if self._master is None:
            raise PortError("pty-error", "terminal is not running")
        self._cols, self._rows = cols, rows
        self._apply_winsize(self._master)

    def _apply_winsize(self, fd: int) -> None:
        packed = struct.pack("HHHH", self._rows, self._cols, 0, 0)
        fcntl.ioctl(fd, termios.TIOCSWINSZ, packed)

    def signal(self, sig: str) -> None:
        if self._proc is None or self._proc.returncode is not None:
            return  # no-op after exit (DSH semantics)
        if self._master is None:
            raise PortError("pty-error", "terminal is not running")
        signum = getattr(signal, sig, None)
        if signum is None:
            raise PortError("bad-request", f"unknown signal {sig!r}")
        if sig == "SIGKILL":
            self._proc.kill()
            return
        try:
            pgrp = os.tcgetpgrp(self._master)
            if pgrp > 0:
                os.killpg(pgrp, signum)
                return
        except OSError:
            pass
        os.kill(self._proc.pid, signum)

    # -- state ----------------------------------------------------------------

    def exited(self) -> bool:
        return self._proc is not None and self._proc.returncode is not None

    @property
    def exit_code(self) -> int | None:
        return self._exit_code

    @property
    def exit_signal(self) -> str | None:
        return self._exit_signal

    async def close(self) -> None:
        """Force-kill the terminal and release the pty. Idempotent."""
        if self._released:
            return
        self._released = True
        if self._proc is not None and self._proc.returncode is None:
            self._proc.kill()
            try:
                await asyncio.wait_for(self._proc.wait(), _KILL_GRACE_SECONDS)
            except TimeoutError:  # pragma: no cover - pathological
                pass
        self._teardown_reader()


def _signal_name(negative_returncode: int) -> str:
    """Map a negative wait returncode to its POSIX signal name."""
    number = -negative_returncode
    try:
        return signal.Signals(number).name
    except ValueError:
        return str(number)


def platform_backend_available() -> bool:
    """Whether this platform has a first-party backend (POSIX only, for now)."""
    return os.name == "posix"
