"""Engine directory-mechanism alignment (plan §7.3):

1. whitelist carries the client-declared ``workspace_id`` reference;
2. gateway injects the server-resolved ``workspace_cwd`` (unforgeable);
3. ThreadDataMiddleware anchors ``workspace_path`` to that real directory
   while uploads/outputs stay on the per-thread staging area.
"""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from qilin.agents.middlewares.thread_data_middleware import (
    ThreadDataMiddleware,
)


def _runtime(context: dict) -> SimpleNamespace:
    return SimpleNamespace(context=context, store=None, config=None)


def _make_middleware(tmp_path: Path) -> ThreadDataMiddleware:
    return ThreadDataMiddleware(base_dir=str(tmp_path / "qdata"), lazy_init=False)


class TestWhitelistCarriesWorkspaceId:
    def test_workspace_id_is_admitted_context_key(self):
        from app.gateway.services import _CONTEXT_CONFIGURABLE_KEYS

        assert "workspace_id" in _CONTEXT_CONFIGURABLE_KEYS
        # The raw path is deliberately NOT client-trusted:
        assert "user_workspace_path" not in _CONTEXT_CONFIGURABLE_KEYS
        assert "workspace_cwd" not in _CONTEXT_CONFIGURABLE_KEYS


class TestMiddlewareAnchor:
    async def test_bound_thread_uses_real_dir_for_workspace_only(self, tmp_path):
        real = tmp_path / "real-project"
        real.mkdir()
        mw = _make_middleware(tmp_path)
        out = mw.before_agent(
            {},
            _runtime(
                {"thread_id": "t-anchor", "workspace_cwd": str(real)}
            ),
        )
        td = out["thread_data"]
        # real dir wins regardless of symlink resolution (/private prefix on macOS tmp)
        assert real.resolve().parts[-1] == Path(td["workspace_path"]).name
        assert Path(td["workspace_path"]) in {real, real.resolve()}
        assert "/uploads" in td["uploads_path"]
        assert "/outputs" in td["outputs_path"]

    async def test_unbound_threads_keep_staging_anchor(self, tmp_path):
        mw = _make_middleware(tmp_path)
        out = mw.before_agent({}, _runtime({"thread_id": "t-plain"}))
        staging = str(tmp_path / "qdata")
        assert out["thread_data"]["workspace_path"].startswith(staging)

    async def test_nonexistent_cwd_degrades_to_staging(self, tmp_path):
        mw = _make_middleware(tmp_path)
        out = mw.before_agent(
            {},
            _runtime(
                {
                    "thread_id": "t-missing",
                    "workspace_cwd": str(tmp_path / "ghost"),
                }
            ),
        )
        staging = str(tmp_path / "qdata")
        assert out["thread_data"]["workspace_path"].startswith(staging)

    async def test_empty_cwd_value_is_ignored(self, tmp_path):
        mw = _make_middleware(tmp_path)
        out = mw.before_agent(
            {}, _runtime({"thread_id": "t-empty", "workspace_cwd": ""})
        )
        staging = str(tmp_path / "qdata")
        assert out["thread_data"]["workspace_path"].startswith(staging)
