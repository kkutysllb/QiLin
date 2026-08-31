"""Surface port tests: delivery, queueing, drain-on-attach, and the
sidebar_open LangChain tool wrapper.

The registry is exercised through real asyncio queues (subscribe returns a
loop-bound queue; tests drive it via asyncio.run). The tool wrapper is
tested through its .coroutine entry point with a stub runtime, mirroring
how the LangChain layer invokes it.
"""

import asyncio
import json

from qilin.ports.protocol.surface import SurfaceOpenResult
from qilin.ports.surface import (
    SURFACE_QUEUE_LIMIT,
    SurfaceRegistry,
    get_default_surface_registry,
    set_default_surface_registry,
)


class TestSurfaceRegistry:
    def test_open_without_adapter_queues_and_reports_undelivered(self) -> None:
        registry = SurfaceRegistry()
        result = asyncio.run(
            registry.open("t1", "file", "/tmp/plan.md", "plan.md")
        )
        assert result == SurfaceOpenResult(
            kind="file", target="/tmp/plan.md", title="plan.md", delivered=False
        )
        assert registry.pending_count("t1") == 1

    def test_open_with_subscriber_delivers_immediately(self) -> None:
        registry = SurfaceRegistry()
        asyncio.run(registry.open("t1", "url", "https://x.y", "x.y"))  # queued
        queue = registry.subscribe("t1")
        assert queue.qsize() == 1  # drained on attach
        while not queue.empty():
            queue.get_nowait()  # clear the drained backlog

        result = asyncio.run(
            registry.open("t1", "file", "/tmp/a.md", "a.md")
        )
        assert result.delivered is True
        kind, event = queue.get_nowait()
        assert kind == "surface"
        assert event.target == "/tmp/a.md"

    def test_detach_requeues_future_opens(self) -> None:
        registry = SurfaceRegistry()
        queue = registry.subscribe("t1")
        registry.unsubscribe("t1", queue)
        result = asyncio.run(
            registry.open("t1", "url", "https://again.test", "again.test")
        )
        assert result.delivered is False

    def test_queue_bounded_drops_oldest(self) -> None:
        registry = SurfaceRegistry(queue_limit=3)
        for i in range(5):
            asyncio.run(
                registry.open("t1", "file", f"/tmp/f{i}.md", f"f{i}")
            )
        assert registry.pending_count("t1") == 3
        queue = registry.subscribe("t1")
        targets = []
        while not queue.empty():
            _kind, event = queue.get_nowait()
            targets.append(event.target)
        # Oldest two dropped; newest three survive in order.
        assert targets == ["/tmp/f2.md", "/tmp/f3.md", "/tmp/f4.md"]

    def test_sessions_are_isolated(self) -> None:
        registry = SurfaceRegistry()
        queue_a = registry.subscribe("a")
        result = asyncio.run(
            registry.open("b", "file", "/tmp/b.md", "b")
        )
        assert result.delivered is False  # b has no subscriber
        assert queue_a.empty()


class SimpleNamespaceRuntime:
    """Minimal Runtime stand-in: only .context is consulted by the tool."""

    def __init__(self, thread_id: str | None) -> None:
        self.context = {"thread_id": thread_id} if thread_id else {}
        self.config = {}
        self.state = None


class TestSidebarOpenTool:
    def test_tool_reports_delivered_for_attached_session(self, tmp_path) -> None:
        from qilin.tools.builtins.sidebar_open_tool import sidebar_open_tool

        registry = SurfaceRegistry()
        queue = registry.subscribe("thr-tool")
        set_default_surface_registry(registry)
        try:
            target = tmp_path / "plan.md"
            target.write_text("# plan", encoding="utf-8")
            runtime = SimpleNamespaceRuntime(thread_id="thr-tool")
            raw = asyncio.run(
                sidebar_open_tool.coroutine(runtime, str(target), "")
            )
            payload = json.loads(raw)
            assert payload == {
                "kind": "file",
                "target": str(target),
                "title": "plan.md",
                "delivered": True,
            }
            kind, event = queue.get_nowait()
            assert kind == "surface"
            assert event.target == str(target)
        finally:
            set_default_surface_registry(None)

    def test_tool_urls_bypass_fs_resolution(self) -> None:
        from qilin.tools.builtins.sidebar_open_tool import sidebar_open_tool

        registry = SurfaceRegistry()
        set_default_surface_registry(registry)
        try:
            runtime = SimpleNamespaceRuntime(thread_id="thr-url")
            raw = asyncio.run(
                sidebar_open_tool.coroutine(
                    runtime, "https://example.com/docs", ""
                )
            )
            payload = json.loads(raw)
            assert payload["kind"] == "url"
            assert payload["title"] == "example.com"
        finally:
            set_default_surface_registry(None)

    def test_missing_thread_id_returns_error_string(self) -> None:
        from qilin.tools.builtins.sidebar_open_tool import sidebar_open_tool

        runtime = SimpleNamespaceRuntime(thread_id=None)
        raw = asyncio.run(sidebar_open_tool.coroutine(runtime, "/tmp/x", ""))
        assert raw.startswith("Error:")


def test_queue_limit_constant_is_bounded() -> None:
    assert 1 <= SURFACE_QUEUE_LIMIT <= 64


def teardown_function() -> None:
    # Keep singletons isolated between tests.
    set_default_surface_registry(None)


def test_get_default_registry_is_singleton() -> None:
    assert get_default_surface_registry() is get_default_surface_registry()


def test_registry_open_passes_read_path_to_event() -> None:
    registry = SurfaceRegistry()
    queue = registry.subscribe("thr-rp")
    asyncio.run(registry.open("thr-rp", "file", "/abs/x.md", "x.md", read_path="x.md"))
    _, event = queue.get_nowait()
    assert event.read_path == "x.md"
    assert event.model_dump(by_alias=True)["readPath"] == "x.md"


class TestOpenSurfaceHelper:
    def test_url_target_skips_fs_and_has_no_read_path(self) -> None:
        import qilin.ports.surface as surface_module

        registry = SurfaceRegistry()
        queue = registry.subscribe("thr-help")
        result = asyncio.run(
            surface_module.open_surface(
                "thr-help", "https://example.com/docs", registry=registry
            )
        )
        assert result.model_dump(by_alias=True) == {
            "kind": "url",
            "target": "https://example.com/docs",
            "title": "example.com",
            "delivered": True,
        }
        kind, event = queue.get_nowait()
        assert kind == "surface"
        assert event.surface == "url"
        assert event.read_path is None

    def test_workspace_relative_file_carries_read_path(self, tmp_path, monkeypatch) -> None:
        import qilin.ports.surface as surface_module

        monkeypatch.setattr(surface_module, "_workspace_dir", lambda _tid: tmp_path)
        docs = tmp_path / "docs"
        docs.mkdir()
        plan = docs / "plan.md"
        plan.write_text("# plan", encoding="utf-8")

        registry = SurfaceRegistry()
        queue = registry.subscribe("thr-ws")
        result = asyncio.run(
            surface_module.open_surface("thr-ws", "docs/plan.md", registry=registry)
        )
        payload = result.model_dump(by_alias=True)
        assert payload["kind"] == "file"
        assert payload["target"] == str(plan.resolve())
        assert payload["title"] == "plan.md"
        _, event = queue.get_nowait()
        assert event.read_path == "docs/plan.md"

    def test_absolute_outside_workspace_has_no_read_path(self, tmp_path, monkeypatch) -> None:
        import qilin.ports.surface as surface_module

        ws = tmp_path / "ws"
        ws.mkdir()
        outside = tmp_path / "outside.txt"
        outside.write_text("hi", encoding="utf-8")
        monkeypatch.setattr(surface_module, "_workspace_dir", lambda _tid: ws)

        registry = SurfaceRegistry()
        queue = registry.subscribe("thr-out")
        asyncio.run(
            surface_module.open_surface("thr-out", str(outside), registry=registry)
        )
        _, event = queue.get_nowait()
        assert event.read_path is None

    def test_missing_target_raises_bad_request(self, monkeypatch) -> None:
        import qilin.ports.surface as surface_module
        from qilin.ports.errors import PortError

        monkeypatch.setattr(surface_module, "_workspace_dir", lambda _tid: None)
        registry = SurfaceRegistry()
        try:
            asyncio.run(
                surface_module.open_surface(
                    "thr-x", "/nope/missing.md", registry=registry
                )
            )
        except PortError as exc:
            assert exc.code == "bad-request"
            assert "missing.md" in exc.message
        else:
            raise AssertionError("expected PortError")

    def test_cwd_fallback_resolves_relative_target(self, tmp_path, monkeypatch) -> None:
        import qilin.ports.surface as surface_module

        monkeypatch.setattr(surface_module, "_workspace_dir", lambda _tid: None)
        marker = tmp_path / "cwd-file.md"
        marker.write_text("x", encoding="utf-8")
        monkeypatch.chdir(tmp_path)

        registry = SurfaceRegistry()
        queue = registry.subscribe("thr-cwd")
        result = asyncio.run(
            surface_module.open_surface("thr-cwd", "cwd-file.md", registry=registry)
        )
        assert result.target == str(marker.resolve())
        _, event = queue.get_nowait()
        assert event.read_path is None
