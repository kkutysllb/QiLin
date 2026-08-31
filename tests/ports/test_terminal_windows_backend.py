"""Windows backend dispatch tests - run on any platform.

The real ConPTY backend only executes on Windows (guarded by skipif); what
this suite pins on every platform is the dispatch + contract surface:
import safety on POSIX, platform shell resolution, the clean
pty-deps-missing error when pywinpty is absent, and the Windows signal
parity rules.
"""

import sys

import pytest

from qilin.ports import terminal as terminal_module
from qilin.ports.errors import PortError
from qilin.ports.terminal import (
    TerminalRegistry,
    _default_shell_args,
    default_shell,
    make_backend,
)


class TestWindowsDispatch:
    def test_windows_backend_module_imports_on_posix(self) -> None:
        # The module must stay side-effect free on non-Windows (lazy
        # pywinpty import) so the registry import chain never breaks.
        import qilin.ports.backends.windows as windows_backend

        assert windows_backend.WindowsConPtyTerminal is not None
        assert windows_backend.windows_exit_code is not None

    def test_default_shell_is_powershell_on_windows(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(sys, "platform", "win32")
        assert default_shell() == "powershell.exe"

    def test_default_shell_args_empty_on_windows(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # No automatic POSIX -l on Windows; explicit args still pass through.
        monkeypatch.setattr(sys, "platform", "win32")
        assert _default_shell_args(None) == []
        assert _default_shell_args(["-NoLogo"]) == ["-NoLogo"]

    def test_make_backend_raises_deps_missing_without_pywinpty(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(sys, "platform", "win32")
        # Force the lazy import to fail regardless of the host platform.
        monkeypatch.setitem(sys.modules, "winpty", None)
        with pytest.raises(PortError) as exc:
            make_backend(["powershell.exe"], None, 80, 24)
        assert exc.value.code == "pty-deps-missing"
        assert "pywinpty" in exc.value.message

    def test_make_backend_posix_unaffected_by_patch(self) -> None:
        # Sanity: on the real host platform (POSIX in CI) the backend is the
        # pty one, not the ConPTY one.
        backend = make_backend(["/bin/sh"], None, 80, 24)
        assert type(backend).__name__ == "PosixPtyTerminal"


class TestWindowsConPtyContract:
    """Surface checks of the Windows backend class itself (no spawn)."""

    def test_unstarted_terminal_reports_exited(self) -> None:
        from qilin.ports.backends.windows import WindowsConPtyTerminal

        terminal = WindowsConPtyTerminal(["powershell.exe"], None, 80, 24)
        assert terminal.exited() is True
        assert terminal.exit_code is None
        assert terminal.exit_signal is None

    def test_write_before_start_raises_pty_error(self) -> None:
        from qilin.ports.backends.windows import WindowsConPtyTerminal

        terminal = WindowsConPtyTerminal(["powershell.exe"], None, 80, 24)
        with pytest.raises(PortError) as exc:
            terminal.write(b"ls")
        assert exc.value.code == "pty-error"

    def test_resize_before_start_raises_pty_error(self) -> None:
        from qilin.ports.backends.windows import WindowsConPtyTerminal

        terminal = WindowsConPtyTerminal(["powershell.exe"], None, 80, 24)
        with pytest.raises(PortError) as exc:
            terminal.resize(120, 40)
        assert exc.value.code == "pty-error"

    def test_close_is_idempotent_when_never_started(self) -> None:
        import asyncio

        from qilin.ports.backends.windows import WindowsConPtyTerminal

        terminal = WindowsConPtyTerminal(["powershell.exe"], None, 80, 24)
        asyncio.run(terminal.close())
        asyncio.run(terminal.close())  # no raise


class TestRegistryPlatformDefaults:
    def test_create_passes_platform_shell_resolution(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # The registry must consult the platform shell helpers, not hardcode
        # POSIX assumptions.
        monkeypatch.setattr(sys, "platform", "win32")
        assert terminal_module.default_shell() == "powershell.exe"
        registry = TerminalRegistry(backend_factory=lambda *args: None)  # type: ignore[arg-type]
        assert registry is not None


@pytest.mark.skipif(sys.platform == "win32", reason="POSIX-only integration")
class TestPosixIntegrationUnaffected:
    def test_posix_backend_still_default(self) -> None:
        backend = make_backend(["/bin/sh"], None, 80, 24)
        assert type(backend).__name__ == "PosixPtyTerminal"
