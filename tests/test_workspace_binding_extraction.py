"""Regression: workspace binding from the web client's ``config.context``.

The web demo ships the picker's selection inside ``config.context``
(LangGraph >=0.6 style). Before the fix the gateway read the raw
``body.config.configurable`` (never populated by that client), so the
binding was silently dropped: the thread stayed in Ungrouped and the
sandbox never anchored to the real directory — the agent then reported
"the workspace is empty".
"""

from __future__ import annotations

import inspect
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.gateway.services import (
    build_run_config,
    merge_run_context_overrides,
)


def _simulate_frontend_run_config() -> dict:
    """Reproduce the gateway pipeline for the web demo's exact payload shape."""
    body_config = {
        "recursion_limit": 100,
        "context": {
            "thread_id": "t-web",
            "workspace_id": "ws-tests",
            "sandbox_mode": "workspace-write",
            "user_workspace_path": "/tmp/tests",
        },
    }
    config = build_run_config("t-web", body_config, None)
    # top-level body.context is absent in this payload shape; the fixed start_run
    # falls back to body_config["context"] as the whitelist-merge source
    merge_source = (
        None or body_config.get("context")  # getattr(body, "context", None) or ...
    )
    merge_run_context_overrides(config, merge_source, internal=False)
    return config


class TestBindingExtraction:
    def test_whitelisted_keys_reach_configurable(self):
        config = _simulate_frontend_run_config()
        assert config["configurable"]["workspace_id"] == "ws-tests"
        assert config["configurable"]["sandbox_mode"] == "workspace-write"
        # non-whitelisted client keys stay out of configurable
        assert "user_workspace_path" not in config["configurable"]

    def test_extraction_expression_finds_binding(self):
        """Mirror of the start_run extraction: configurable first, context fallback."""
        config = _simulate_frontend_run_config()
        cfg_configurable = (
            config.get("configurable")
            if isinstance(config.get("configurable"), dict)
            else {}
        )
        cfg_context = (
            config.get("context") if isinstance(config.get("context"), dict) else {}
        )
        raw = cfg_configurable.get("workspace_id") or cfg_context.get("workspace_id")
        assert raw == "ws-tests"

    def test_extraction_falls_back_to_context(self):
        config = {"configurable": {"thread_id": "t"}, "context": {"workspace_id": "ws-x"}}
        cfg_configurable = (
            config.get("configurable")
            if isinstance(config.get("configurable"), dict)
            else {}
        )
        cfg_context = (
            config.get("context") if isinstance(config.get("context"), dict) else {}
        )
        assert (cfg_configurable.get("workspace_id") or cfg_context.get("workspace_id")) == "ws-x"


class TestWiring:
    def test_merge_source_covers_config_context(self):
        """The merge call must consult body.config.context, not just body.context."""
        import app.gateway.services as services

        src = inspect.getsource(services)
        assert 'body_config.get("context")' in src
        # and the extraction must read the merged config, not the raw request
        assert 'config.get("configurable")' in src
        assert 'body_config.get("configurable")\n' not in src.split("run_workspace_id: str | None = None")[1].split("async def")[0]
