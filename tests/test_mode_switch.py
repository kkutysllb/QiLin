"""Unit tests for CFG: single/multi orchestration mode switch in make_lead_agent."""

import threading
import time
from types import SimpleNamespace

import pytest
from langgraph.graph.state import CompiledStateGraph

from qilin.agents.lead_agent import agent as lead_agent_module
from qilin.agents.lead_agent.agent import (
    _resolve_orchestration_mode,
    make_lead_agent,
)
from qilin.agents.lead_agent.orchestration_cache import FingerprintedGraphCache
from qilin.config.app_config import AppConfig
from qilin.config.orchestration_config import (
    AgentSpec,
    OrchestrationConfig,
    OrchestrationMode,
)


def _make_app_config(
    mode: OrchestrationMode, workers: list[AgentSpec]
) -> AppConfig:
    app_config = AppConfig.model_validate(
        {
            "sandbox": {"use": "qilin.sandbox.local:LocalSandboxProvider"},
            "models": [
                {
                    "name": "test-model",
                    "use": "langchain_openai.chat_models:ChatOpenAI",
                    "model": "gpt-4o-mini",
                }
            ],
        }
    )
    app_config.orchestration = OrchestrationConfig(
        mode=mode, max_concurrency=2, workers=workers
    )
    return app_config


def _lead_config(app_config: AppConfig) -> dict:
    # make_lead_agent 通过 runtime config 的 app_config 键注入已解析配置。
    return {"configurable": {"app_config": app_config}, "context": {}}


@pytest.fixture(autouse=True)
def _clear_orchestrator_graph_cache():
    """Isolate the process-wide fingerprint cache between tests."""
    lead_agent_module._orchestrator_graph_cache.clear()
    yield
    lead_agent_module._orchestrator_graph_cache.clear()


@pytest.fixture
def fake_chat_model(monkeypatch):
    """Stub create_chat_model so the v1 lead path builds without API keys."""

    from langchain_core.language_models.fake_chat_models import (
        GenericFakeChatModel,
    )

    def _stub(*args, **kwargs) -> GenericFakeChatModel:
        return GenericFakeChatModel(messages=iter([]))

    monkeypatch.setattr(
        "qilin.agents.lead_agent.agent.create_chat_model", _stub
    )


@pytest.fixture
def build_counter(monkeypatch):
    """Replace _build_orchestrator_graph with a counting fake.

    Returns a mutable counter dict; each build yields a distinct fake graph
    object so cache hits (same identity) are distinguishable from rebuilds.
    """
    counter = {"builds": 0}

    def _fake_build(config, *, app_config, model_name, user_id, max_concurrency):
        counter["builds"] += 1
        return SimpleNamespace(
            build_no=counter["builds"],
            model_name=model_name,
            user_id=user_id,
            max_concurrency=max_concurrency,
        )

    monkeypatch.setattr(
        lead_agent_module, "_build_orchestrator_graph", _fake_build
    )
    return counter


class TestResolveOrchestrationMode:
    def test_defaults_to_app_config_mode(self) -> None:
        orchestration = OrchestrationConfig()  # mode=single

        assert (
            _resolve_orchestration_mode({}, orchestration)
            == OrchestrationMode.SINGLE
        )

    def test_runtime_override_wins(self) -> None:
        orchestration = OrchestrationConfig()  # mode=single

        mode = _resolve_orchestration_mode(
            {"orchestration_mode": "multi"}, orchestration
        )

        assert mode == OrchestrationMode.MULTI

    def test_invalid_runtime_override_falls_back(self) -> None:
        orchestration = OrchestrationConfig(mode=OrchestrationMode.MULTI)

        mode = _resolve_orchestration_mode(
            {"orchestration_mode": "bogus"}, orchestration
        )

        assert mode == OrchestrationMode.MULTI


class TestMakeLeadAgentModeSwitch:
    def test_single_mode_builds_v1_lead_graph(
        self, fake_chat_model
    ) -> None:
        app_config = _make_app_config(OrchestrationMode.SINGLE, [])

        graph = make_lead_agent(_lead_config(app_config))

        assert isinstance(graph, CompiledStateGraph)
        # v1 图没有 orchestrator/worker 编排节点。
        assert "orchestrator" not in graph.get_graph().nodes

    def test_multi_mode_builds_orchestrator_graph(self) -> None:
        app_config = _make_app_config(
            OrchestrationMode.MULTI,
            [AgentSpec(name="coder", description="writes code")],
        )

        graph = make_lead_agent(_lead_config(app_config))

        assert isinstance(graph, CompiledStateGraph)
        nodes = set(graph.get_graph().nodes)
        assert "orchestrator" in nodes
        assert "coder" in nodes

    def test_multi_mode_requires_workers(
        self, fake_chat_model
    ) -> None:
        # mode=multi 但 workers 为空：回退 v1 lead graph。
        app_config = _make_app_config(OrchestrationMode.MULTI, [])

        graph = make_lead_agent(_lead_config(app_config))

        assert isinstance(graph, CompiledStateGraph)
        assert "orchestrator" not in graph.get_graph().nodes

    def test_runtime_override_enables_multi(self) -> None:
        # app 配置 single，但单次请求通过 runtime config 覆盖为 multi。
        app_config = _make_app_config(
            OrchestrationMode.SINGLE,
            [AgentSpec(name="coder", description="writes code")],
        )
        config = _lead_config(app_config)
        config["configurable"]["orchestration_mode"] = "multi"

        graph = make_lead_agent(config)

        assert "orchestrator" in graph.get_graph().nodes


class TestFingerprintedGraphCache:
    """Component contract: fingerprint equality -> reuse, change -> rebuild."""

    def test_same_fingerprint_reuses_entry(self) -> None:
        cache: FingerprintedGraphCache[object] = FingerprintedGraphCache()
        builds: list[int] = []

        def builder() -> object:
            builds.append(1)
            return object()

        first = cache.get_or_build("k", "fp-1", builder)
        second = cache.get_or_build("k", "fp-1", builder)

        assert first is second
        assert len(builds) == 1

    def test_fingerprint_change_rebuilds(self) -> None:
        cache: FingerprintedGraphCache[object] = FingerprintedGraphCache()
        builds: list[object] = []

        def _build() -> object:
            graph = object()
            builds.append(graph)
            return graph

        first = cache.get_or_build("k", "fp-1", _build)
        second = cache.get_or_build("k", "fp-2", _build)

        assert first is not second
        assert len(builds) == 2

    def test_clear_forces_rebuild(self) -> None:
        cache: FingerprintedGraphCache[object] = FingerprintedGraphCache()
        builds: list[int] = []

        def builder() -> object:
            builds.append(1)
            return object()

        cache.get_or_build("k", "fp-1", builder)
        cache.clear()
        cache.get_or_build("k", "fp-1", builder)

        assert len(builds) == 2
        assert len(cache) == 1


class TestOrchestrationHotSwitch:
    """Mode/workers changes take effect on the NEXT RUN without restart."""

    def test_unchanged_config_does_not_rebuild(self, build_counter) -> None:
        # (a) 指纹不变 -> 复用已编译图，不重复构建。
        app_config = _make_app_config(
            OrchestrationMode.MULTI,
            [AgentSpec(name="coder", description="writes code")],
        )

        first = make_lead_agent(_lead_config(app_config))
        second = make_lead_agent(_lead_config(app_config))

        assert build_counter["builds"] == 1
        assert first is second

    def test_new_app_config_object_builds_fresh_graph(self, build_counter) -> None:
        # config.yaml 热重载会构造新的 AppConfig 对象（键中的配置身份失效）
        # -> 重建，绝不复用闭包持有旧配置的图。
        first_config = _make_app_config(
            OrchestrationMode.MULTI,
            [AgentSpec(name="coder", description="writes code")],
        )
        second_config = _make_app_config(
            OrchestrationMode.MULTI,
            [AgentSpec(name="coder", description="writes code")],
        )

        first = make_lead_agent(_lead_config(first_config))
        second = make_lead_agent(_lead_config(second_config))

        assert build_counter["builds"] == 2
        assert first is not second

    def test_worker_registry_change_rebuilds(self, build_counter) -> None:
        # 就地修改 orchestration 段（同一 AppConfig 对象）也要被指纹捕获。
        app_config = _make_app_config(
            OrchestrationMode.MULTI,
            [AgentSpec(name="coder", description="writes code")],
        )
        first = make_lead_agent(_lead_config(app_config))

        app_config.orchestration = OrchestrationConfig(
            mode=OrchestrationMode.MULTI,
            max_concurrency=2,
            workers=[
                AgentSpec(name="coder", description="writes code"),
                AgentSpec(name="reviewer", description="reviews code"),
            ],
        )
        second = make_lead_agent(_lead_config(app_config))

        assert build_counter["builds"] == 2
        assert first is not second

    def test_mode_change_switches_graph_type_next_run(self, fake_chat_model) -> None:
        # (b) 模式切换 -> 下一次 run 直接使用新图类型（无重启）。
        app_config = _make_app_config(
            OrchestrationMode.MULTI,
            [AgentSpec(name="coder", description="writes code")],
        )

        multi_graph = make_lead_agent(_lead_config(app_config))
        assert "orchestrator" in multi_graph.get_graph().nodes

        # single <-> multi：就地翻转 mode，下一次调用返回 v1 lead 图。
        app_config.orchestration = OrchestrationConfig(
            mode=OrchestrationMode.SINGLE,
            max_concurrency=2,
            workers=app_config.orchestration.workers,
        )
        single_graph = make_lead_agent(_lead_config(app_config))
        assert "orchestrator" not in single_graph.get_graph().nodes

        # 翻回 multi：再次返回 orchestrator 图。
        app_config.orchestration = OrchestrationConfig(
            mode=OrchestrationMode.MULTI,
            max_concurrency=2,
            workers=app_config.orchestration.workers,
        )
        multi_again = make_lead_agent(_lead_config(app_config))
        assert "orchestrator" in multi_again.get_graph().nodes

    def test_runtime_override_reuses_cached_orchestrator(
        self, build_counter, fake_chat_model
    ) -> None:
        # 临时 runtime 覆盖 multi：覆盖期间使用缓存的 orchestrator 图，
        # 无覆盖时回到 v1 图，再次覆盖仍然复用（不重复构建）。
        app_config = _make_app_config(
            OrchestrationMode.SINGLE,
            [AgentSpec(name="coder", description="writes code")],
        )

        override_config = _lead_config(app_config)
        override_config["configurable"]["orchestration_mode"] = "multi"
        first = make_lead_agent(override_config)
        assert build_counter["builds"] == 1

        single_graph = make_lead_agent(_lead_config(app_config))
        assert "orchestrator" not in single_graph.get_graph().nodes
        assert build_counter["builds"] == 1  # v1 路径不走 orchestrator 构建

        override_again = _lead_config(app_config)
        override_again["configurable"]["orchestration_mode"] = "multi"
        assert make_lead_agent(override_again) is first
        assert build_counter["builds"] == 1

    def test_concurrent_dispatch_builds_once(self, monkeypatch) -> None:
        # (c) 并发 run 分派不会重复构建：锁保证同一 key 只构建一次。
        app_config = _make_app_config(
            OrchestrationMode.MULTI,
            [AgentSpec(name="coder", description="writes code")],
        )
        builds: list[int] = []
        build_lock = threading.Lock()

        def _slow_build(config, *, app_config, model_name, user_id, max_concurrency):
            with build_lock:
                builds.append(1)
            # 放大竞争窗口：无锁时并发线程几乎必然各自进入 builder。
            time.sleep(0.05)
            return SimpleNamespace(model_name=model_name)

        monkeypatch.setattr(
            lead_agent_module, "_build_orchestrator_graph", _slow_build
        )

        thread_count = 8
        barrier = threading.Barrier(thread_count)
        results: list[object] = [None] * thread_count
        errors: list[BaseException] = []

        def _dispatch(index: int) -> None:
            try:
                barrier.wait(timeout=5)
                results[index] = make_lead_agent(_lead_config(app_config))
            except BaseException as exc:  # collected and asserted below
                errors.append(exc)

        threads = [
            threading.Thread(target=_dispatch, args=(i,)) for i in range(thread_count)
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=10)

        assert not errors
        assert len(builds) == 1
        assert all(result is results[0] for result in results)
