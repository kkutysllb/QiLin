"""Windows ConPTY backend: pywinpty (Jupyter-grade, Rust bindings).

Mirrors the posix backend's TerminalPort surface on the ConPTY facility:

- spawn: winpty.PTY(cols, rows) + spawn(appname, cmdline, cwd); the shell
  argv is rendered through subprocess.list2cmdline.
- output: a daemon reader thread blocks on pty.read() and re-enters the
  event loop with call_soon_threadsafe - the asyncio loop is NEVER
  blocked on the PTY, and subscribers stay loop-bound.
- signals: SIGKILL/SIGTERM terminate the process; every other signal is
  accepted but is a no-op (DSH parity: "on Windows, only SIGKILL and
  SIGTERM are effective").
- exit code: ConPTY exposes no wait()-like call, so the code is read from
  the process handle via GetExitCodeProcess (ctypes, no extra deps).

v1 limitations (documented): keystrokes are decoded as UTF-8 before
pty.write (ConPTY writes strings); exit_signal is always None.
"""

from __future__ import annotations

import asyncio
import subprocess
import threading
from collections.abc import Callable

from qilin.ports.errors import PortError

#: Bytes asked per blocking read of the ConPTY pipe.
_READ_CHUNK = 65536
#: Seconds to wait for the reader thread to join on close.
_READER_JOIN_SECONDS = 2.0

_PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
_STILL_ACTIVE = 259


def windows_exit_code(pid: int) -> int | None:
    """Read the exit code of a Windows process via GetExitCodeProcess.

    Returns None while the process is still running or the code cannot be
    read (handle invalid, access denied).
    """
    import ctypes

    kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
    handle = kernel32.OpenProcess(_PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
    if not handle:
        return None
    try:
        code = ctypes.c_ulong(_STILL_ACTIVE)
        if not kernel32.GetExitCodeProcess(handle, ctypes.byref(code)):
            return None
        return None if code.value == _STILL_ACTIVE else int(code.value)
    finally:
        kernel32.CloseHandle(handle)


class WindowsConPtyTerminal:
    """One ConPTY-backed terminal (implements the TerminalPort surface).

    Kept as a structural implementation (no ABC import) so importing this
    module on POSIX stays side-effect free and cheap.
    """

    on_output: Callable[[bytes], None] | None
    on_exit: Callable[[int | None, str | None], None] | None

    def __init__(self, argv: list[str], cwd: str | None, cols: int, rows: int) -> None:
        self._argv = argv
        self._cwd = cwd
        self._cols = cols
        self._rows = rows
        self._pty = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._reader: threading.Thread | None = None
        self._exit_code: int | None = None
        self._released = False
        self.on_output = None
        self.on_exit = None

    # -- lifecycle ---------------------------------------------------------

    async def start(self) -> None:
        try:
            import winpty
        except ImportError as exc:  # pragma: no cover - platform guard
            raise PortError(
                "pty-deps-missing", "pywinpty is required on Windows: pip install pywinpty"
            ) from exc
        self._loop = asyncio.get_running_loop()
        self._pty = winpty.PTY(self._cols, self._rows)
        cmdline = subprocess.list2cmdline(self._argv)
        self._pty.spawn(appname=self._argv[0], cmdline=cmdline, cwd=self._cwd)
        self._reader = threading.Thread(target=self._reader_loop, daemon=True, name="conpty-reader")
        self._reader.start()

    def _reader_loop(self) -> None:  # pragma: no cover - windows only
        """Pump ConPTY output into the event loop until EOF."""
        assert self._pty is not None
        loop = self._loop
        while True:
            try:
                data = self._pty.read(_READ_CHUNK)
            except Exception:
                break
            if not data:
                break
            if self.on_output is not None and loop is not None:
                loop.call_soon_threadsafe(self.on_output, data)
        code = None
        pid = getattr(self._pty, "pid", None)
        if pid:
            try:
                code = windows_exit_code(pid)
            except Exception:
                code = None
        self._exit_code = code
        if self.on_exit is not None and loop is not None:
            loop.call_soon_threadsafe(self.on_exit, code, None)

    # -- primitives ----------------------------------------------------------

    def write(self, data: bytes) -> int:
        if self._pty is None:
            raise PortError("pty-error", "terminal is not running")
        self._pty.write(data.decode("utf-8", errors="replace"))
        return len(data)

    def resize(self, cols: int, rows: int) -> None:
        if self._pty is None:
            raise PortError("pty-error", "terminal is not running")
        self._cols, self._rows = cols, rows
        self._pty.set_size(cols, rows)

    def signal(self, sig: str) -> None:  # pragma: no cover - windows only
        """SIGKILL/SIGTERM terminate the process; others no-op (DSH parity)."""
        if self._pty is None or self._released:
            return
        if sig in ("SIGKILL", "SIGTERM"):
            try:
                self._pty.terminate(force=sig == "SIGKILL")
            except Exception:
                pass

    def exited(self) -> bool:
        if self._pty is None:
            return True
        try:
            return not self._pty.isalive()
        except Exception:
            return True

    @property
    def exit_code(self) -> int | None:
        return self._exit_code

    @property
    def exit_signal(self) -> str | None:
        return None  # ConPTY processes report codes, not POSIX signals

    async def close(self) -> None:
        """Kill the process and release the ConPTY. Idempotent."""
        if self._released:
            return
        self._released = True
        if self._pty is not None:
            try:
                self._pty.terminate(force=True)
            except Exception:
                pass
            try:
                self._pty.close()
            except Exception:
                pass
        if self._reader is not None:
            self._reader.join(timeout=_READER_JOIN_SECONDS)
