"""Goal round driver gateway wiring — hook chaining, flag gate, injection."""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.gateway import goal_activation
from app.gateway.goal_round_wiring import (
    compose_run_completed,
    make_goal_driver_observer,
)
from qilin.persistence.goal.sql import GoalRepository


def _record(thread_id: str, user_id: str = "u1") -> SimpleNamespace:
    return SimpleNamespace(
        run_id="r-1", thread_id=thread_id, assistant_id=None, user_id=user_id
    )


class TestCompose:
    async def test_chain_order_and_exception_containment(self):
        calls: list[str] = []

        async def base(rec):
            calls.append("base")
            raise RuntimeError("base blew up")

        async def extra(rec):
            calls.append("extra")

        chained = compose_run_completed(base, extra)
        await chained(_record("t"))
        assert calls == ["base", "extra"]  # worker already catches; chain keeps order

    async def test_single_side_passthrough(self):
        async def only(rec): ...

        assert compose_run_completed(None, only) is only
        assert compose_run_completed(only, None) is only


@pytest.fixture()
async def env():
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import StaticPool

    from qilin.persistence.base import Base

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sf = async_sessionmaker(engine, expire_on_commit=False)
    store = GoalRepository(sf)

    launched: list[dict] = []
    published: list[tuple[str, str, dict]] = []

    class FakeBroker:
        def publish(self, user_id, thread_id, payload):
            published.append((user_id, thread_id, payload))

    class FakeApp:
        state = SimpleNamespace(goal_store=store, goal_broker=FakeBroker())

    fake_app = FakeApp()

    import app.gateway.goal_round_wiring as wiring

    async def fake_launch(**kwargs):
        launched.append(kwargs)
        return {"run_id": "r-x"}

    import app.gateway.services as services_mod

    saved = services_mod.launch_scheduled_thread_run
    services_mod.launch_scheduled_thread_run = fake_launch
    yield SimpleNamespace(
        app=fake_app,
        store=store,
        launched=launched,
        published=published,
        env_flag=wiring,
        services_mod=services_mod,
    )
    services_mod.launch_scheduled_thread_run = saved
    await engine.dispose()


async def _seed_armed(env, thread_id: str = "t9"):
    created = await env.store.create(
        thread_id, objective="keep going", max_goal_rounds=5, user_id="u1"
    )
    goal_activation.set_activation("u1", thread_id, "armed")
    return created


class TestObserver:
    async def test_flag_off_is_noop(self, env, monkeypatch):
        await _seed_armed(env, "t-off")
        monkeypatch.setenv("QILIN_GOAL_ROUND_DRIVER", "")
        observer = make_goal_driver_observer(env.app)
        await observer(_record("t-off"))
        assert not env.launched

    async def test_flag_on_drives_injection_and_records_round(self, env, monkeypatch):
        created = await _seed_armed(env, "t-on")
        monkeypatch.setenv("QILIN_GOAL_ROUND_DRIVER", "1")
        observer = make_goal_driver_observer(env.app)
        await observer(_record("t-on"))

        assert len(env.launched) == 1
        kw = env.launched[0]
        assert kw["thread_id"] == "t-on"
        assert "<goal_round>" in kw["prompt"]
        meta = kw["metadata"]["goal_round"]
        assert meta["kind"] == "goal" and meta["round"] == 1
        assert meta["id"] == created["view"]["goal"]["id"]
        proj = await env.store.projection("t-on")
        assert proj["rounds_started"] == 1
        assert env.published and env.published[0][2]["operation"] == "round"

    async def test_disarmed_goal_never_drives(self, env, monkeypatch):
        await env.store.create(
            "t-dis", objective="x", max_goal_rounds=3, user_id="u1"
        )  # activation stays disarmed
        monkeypatch.setenv("QILIN_GOAL_ROUND_DRIVER", "1")
        observer = make_goal_driver_observer(env.app)
        await observer(_record("t-dis"))
        assert not env.launched

    async def test_observer_survives_store_errors(self, env, monkeypatch):
        monkeypatch.setenv("QILIN_GOAL_ROUND_DRIVER", "1")

        async def boom(*a, **k):
            raise RuntimeError("store down")

        monkeypatch.setattr(type(env.store), "projection", boom)
        observer = make_goal_driver_observer(env.app)
        await observer(_record("t-any"))  # must not raise
