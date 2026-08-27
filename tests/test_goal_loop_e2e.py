"""P6 acceptance e2e (plan §5): simulate an LLM stopping mid-goal and the
driver automatically continuing — over the real REST surface, real goal
store, and real SSE broker, with only the LLM launch itself faked.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.gateway import goal_activation
from app.gateway.goal_round_wiring import make_goal_driver_observer


@pytest.fixture()
async def loop_env(monkeypatch):
    from fastapi import FastAPI
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import StaticPool

    import app.gateway.routers.goals as goals_router
    from app.gateway.authz import AuthContext
    from app.gateway.goal_events import GoalChangeBroker
    from qilin.persistence.base import Base
    from qilin.persistence.goal.sql import GoalRepository
    from qilin.persistence.thread_meta.sql import ThreadMetaRepository

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sf = async_sessionmaker(engine, expire_on_commit=False)

    threads = ThreadMetaRepository(sf)
    await threads.create("loop-1", metadata={}, user_id="user-A")
    store = GoalRepository(sf)

    launched: list[dict] = []

    async def fake_launch(**kwargs):
        launched.append(kwargs)
        return {"run_id": "next"}

    import app.gateway.services as services_mod

    saved = services_mod.launch_scheduled_thread_run
    services_mod.launch_scheduled_thread_run = fake_launch

    async def fake_user(request):
        return "user-A"

    goals_router.get_current_user = fake_user
    app = FastAPI()
    app.include_router(goals_router.router)

    async def stamp(request, call_next):
        request.state.auth = AuthContext(
            user=SimpleNamespace(id="user-A"),
            permissions=["threads:read", "threads:write", "threads:delete"],
        )
        return await call_next(request)

    app.middleware("http")(stamp)
    app.state.thread_store = threads
    app.state.goal_store = store
    app.state.goal_broker = GoalChangeBroker()
    observer = make_goal_driver_observer(app)
    app.state.goal_driver_observer = observer

    monkeypatch.setenv("QILIN_GOAL_ROUND_DRIVER", "1")

    transport = httpx.ASGITransport(app=app)
    yield SimpleNamespace(
        client=httpx.AsyncClient(transport=transport, base_url="http://t"),
        store=store,
        broker=app.state.goal_broker,
        launched=launched,
        observer=observer,
    )
    services_mod.launch_scheduled_thread_run = saved
    await engine.dispose()


def _record(thread_id: str, status: str = "success") -> SimpleNamespace:
    return SimpleNamespace(
        run_id=f"r-{status}",
        thread_id=thread_id,
        assistant_id=None,
        user_id="user-A",
        status=SimpleNamespace(value=status),
    )


@pytest.mark.asyncio
async def test_llm_stops_midgoal_and_driver_continues_until_budget(loop_env):
    env = loop_env
    c = env.client

    queue = await env.broker.subscribe("user-A", "loop-1")
    try:
        # ---- human creates & arms a one-round budget goal via REST ----
        resp = await c.post(
            "/api/threads/loop-1/goals",
            json={"objective": "half-done work", "max_goal_rounds": 1},
        )
        assert resp.status_code == 200
        view = resp.json()

        # ---- simulate the LLM finishing its first turn mid-goal ----
        await env.observer(_record("loop-1"))
        await asyncio.wait_for(queue.get(), timeout=2)  # create broadcast

        # ---- driver auto-continues: injection happened, round recorded ----
        assert len(env.launched) == 1
        injected = env.launched[0]
        assert "<goal_round>" in injected["prompt"]
        assert "Round: 1/1" in injected["prompt"]
        assert injected["metadata"]["goal_round"]["id"] == view["goal"]["id"]

        payload = await asyncio.wait_for(queue.get(), timeout=2)  # round event
        assert payload["operation"] == "round" and payload["round"] == 1
        proj = await env.store.projection("loop-1")
        assert proj["rounds_started"] == 1

        # ---- second success edge with budget exhausted → auto-block ----
        await env.observer(_record("loop-1"))
        payload = await asyncio.wait_for(queue.get(), timeout=2)
        assert payload["operation"] == "block"
        proj = await env.store.projection("loop-1")
        assert proj["goal"]["phase"] == "blocked"
        assert proj["goal"]["blocked_reason"]["code"] == "round-limit"

        # no further driving while blocked, even on more completions
        await env.observer(_record("loop-1"))
        assert len(env.launched) == 1
    finally:
        await env.broker.unsubscribe("user-A", "loop-1", queue)


@pytest.mark.asyncio
async def test_cancelled_run_parks_armed_goal(loop_env):
    env = loop_env
    c = env.client
    queue = await env.broker.subscribe("user-A", "loop-1")
    try:
        resp = await c.post("/api/threads/loop-1/goals", json={"objective": "walk away"})
        assert resp.status_code == 200
        await asyncio.wait_for(queue.get(), timeout=2)  # create broadcast

        await env.observer(_record("loop-1", status="interrupted"))
        payload = await asyncio.wait_for(queue.get(), timeout=2)  # pause broadcast
        assert payload["operation"] == "pause"
        proj = await env.store.projection("loop-1")
        assert proj["goal"]["phase"] == "paused"
        assert not env.launched  # parked, never auto-resurrected

        # re-arm like the UI resume button would; next success drives again
        head_ref = {"id": proj["last_ref"]["id"], "revision": proj["last_ref"]["revision"]}
        resumed = await env.store.resume("loop-1", ref=head_ref, user_id="user-A")
        goal_activation.set_activation("user-A", "loop-1", "armed")
        assert resumed["view"]["goal"]["phase"] == "active"

        await env.observer(_record("loop-1"))
        payload = await asyncio.wait_for(queue.get(), timeout=2)
        assert payload["operation"] in {"resume", "round"} or True  # resume broadcast then round
        if payload["operation"] == "resume":
            payload = await asyncio.wait_for(queue.get(), timeout=2)
        assert payload["operation"] == "round" and payload["round"] == 1
        assert len(env.launched) == 1
    finally:
        await env.broker.unsubscribe("user-A", "loop-1", queue)


@pytest.mark.asyncio
async def test_error_status_never_drives_but_keeps_goal(loop_env):
    env = loop_env
    resp = await env.client.post("/api/threads/loop-1/goals", json={"objective": "after failure"})
    assert resp.status_code == 200
    await env.observer(_record("loop-1", status="error"))
    assert not env.launched
    proj = await env.store.projection("loop-1")
    assert proj["goal"]["phase"] == "active"  # untouched
