"""Folded sandbox-mode gating (plan §7.3 item 3).

- gateway folds the per-thread event log and injects the mode as a
  server-owned context key (overriding anything a client sent);
- middleware relays it through thread_data;
- mutating tools (bash / write_file / str_replace) refuse when the folded
  value is read-only; workspace-write and danger-full-access pass.
"""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from qilin.sandbox.tools import (
    _enforce_sandbox_write_gate,
    _thread_sandbox_mode,
)


def _td(mode: str | None) -> dict:
    return {"workspace_path": "/tmp/w", "sandbox_mode": mode}


class TestGateUnit:
    def test_read_only_blocks_writes(self):
        assert _enforce_sandbox_write_gate(_td("read-only")) is not None
        assert "read-only" in _enforce_sandbox_write_gate(_td("read-only"))

    def test_other_modes_pass(self):
        for mode in ("workspace-write", "danger-full-access", None, ""):
            assert _enforce_sandbox_write_gate(_td(mode)) is None

    def test_default_for_missing_mode_is_danger(self):
        assert _thread_sandbox_mode({}) == "danger-full-access"
        assert _thread_sandbox_mode(None) == "danger-full-access"


class TestBashGate:
    def test_bash_refuses_in_read_only(self, tmp_path):
        import qilin.sandbox.tools as tools
        from qilin.agents.middlewares.thread_data_middleware import (
            ThreadDataMiddleware,
        )

        mw = ThreadDataMiddleware(base_dir=str(tmp_path / "q"), lazy_init=False)
        out = mw.before_agent(
            {},
            SimpleNamespace(
                context={"thread_id": "t-ro", "sandbox_mode": "read-only"}
            ),
        )
        thread_data = out["thread_data"]
        assert tools._enforce_sandbox_write_gate(thread_data) is not None

    def test_bash_allows_in_workspace_write(self, tmp_path):
        import qilin.sandbox.tools as tools
        from qilin.agents.middlewares.thread_data_middleware import (
            ThreadDataMiddleware,
        )

        mw = ThreadDataMiddleware(base_dir=str(tmp_path / "q"), lazy_init=False)
        out = mw.before_agent(
            {},
            SimpleNamespace(
                context={"thread_id": "t-ww", "sandbox_mode": "workspace-write"}
            ),
        )
        assert tools._enforce_sandbox_write_gate(out["thread_data"]) is None


class TestMiddlewareRelay:
    def test_mode_reaches_thread_data(self, tmp_path):
        from qilin.agents.middlewares.thread_data_middleware import (
            ThreadDataMiddleware,
        )

        mw = ThreadDataMiddleware(base_dir=str(tmp_path / "q"), lazy_init=False)
        out = mw.before_agent(
            {},
            SimpleNamespace(
                context={
                    "thread_id": "t-relay",
                    "sandbox_mode": "read-only",
                    "workspace_cwd": str(tmp_path),
                }
            ),
        )
        td = out["thread_data"]
        assert td["sandbox_mode"] == "read-only"
        # anchoring from the previous slice still works alongside
        assert td["workspace_path"] in {str(tmp_path), str(tmp_path.resolve())}

    def test_absent_mode_reads_empty_and_gate_defaults(self, tmp_path):
        from qilin.agents.middlewares.thread_data_middleware import (
            ThreadDataMiddleware,
        )

        mw = ThreadDataMiddleware(base_dir=str(tmp_path / "q"), lazy_init=False)
        out = mw.before_agent(
            {}, SimpleNamespace(context={"thread_id": "t-legacy"})
        )
        assert out["thread_data"]["sandbox_mode"] == ""
        assert _enforce_sandbox_write_gate(out["thread_data"]) is None


class TestGatewayInjection:
    def test_server_owned_overwrite_is_unconditional(self):
        """Wiring check: the gateway's mode write clobbers client values and
        runs after the whitelist merge in start_run."""
        import inspect

        import app.gateway.services as services

        src = inspect.getsource(services)
        assert "sandbox_mode_value = \"danger-full-access\"" in src
        assert 'config_configurable["sandbox_mode"] = sandbox_mode_value' in src
        # unconditional overwrite, not setdefault (which a client could pre-seed)
        assert 'cfg_ctx["sandbox_mode"] = sandbox_mode_value' in src
        # folded from the per-thread event log:
        assert "sandbox_store.folded(thread_id)" in src
