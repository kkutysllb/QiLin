"""Goal-domain seven-verb API behavior (DSH dsh-goal alignment).

Covers the transition matrix, CAS stale-ref rejection, validation codes,
activation arm/disarm side effects, clear tombstones, and SSE whole-
snapshot fan-out — all against the real router.
"""

from __future__ import annotations

from types import SimpleNamespace

import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.gateway.routers.goals as goals_router_module
from app.gateway import goal_activation
from app.gateway.authz import AuthContext
from app.gateway.goal_events import GoalChangeBroker
from qilin.persistence.base import Base
from qilin.persistence.goal.sql import GoalRepository
from qilin.persistence.thread_meta.sql import ThreadMetaRepository

OWNER = "user-A"
OTHER = "user-B"


@pytest_asyncio.fixture
async def client():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sf = async_sessionmaker(engine, expire_on_commit=False)
    goals = GoalRepository(sf)
    threads = ThreadMetaRepository(sf)

    from qilin.runtime.user_context import reset_current_user, set_current_user

    token = set_current_user(SimpleNamespace(id=OWNER))

    app = FastAPI()
    app.include_router(goals_router_module.router)

    async def _stamp_auth(request, call_next):
        request.state.auth = AuthContext(
            user=SimpleNamespace(id=OWNER),
            permissions=["threads:read", "threads:write", "threads:delete"],
        )
        return await call_next(request)

    app.middleware("http")(_stamp_auth)

    async def _fake_current_user(request):
        return OWNER

    originals = (
        goals_router_module.get_current_user,
    )
    goals_router_module.get_current_user = _fake_current_user

    app.state.thread_store = threads
    app.state.goal_store = goals
    app.state.goal_broker = GoalChangeBroker()

    transport = httpx.ASGITransport(app=app)
    try:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            yield c, goals, threads, app
    finally:
        (goals_router_module.get_current_user,) = originals
        reset_current_user(token)
        goal_activation._activation.clear()
        await engine.dispose()


pytestmark = pytest.mark.asyncio


def _base(thread_id: str) -> str:
    return f"/api/threads/{thread_id}/goals"


async def _make_thread(threads, thread_id: str, owner: str) -> None:
    await threads.create(thread_id, metadata={}, user_id=owner)


async def _create(c, thread_id: str, objective: str = "ship it", cap=None) -> dict:
    body: dict = {"objective": objective}
    if cap is not None:
        body["max_goal_rounds"] = cap
    resp = await c.post(_base(thread_id), json=body)
    assert resp.status_code == 200, resp.text
    return resp.json()


class TestCreateAndRead:
    async def test_create_returns_active_armed_view(self, client):
        c, _, threads, _ = client
        await _make_thread(threads, "t1", OWNER)
        view = await _create(c, "t1", "finish the refactor", 8)
        assert view["goal"]["phase"] == "active"
        assert view["goal"]["revision"] == 1
        assert view["goal"]["objective"] == "finish the refactor"
        assert view["goal"]["max_goal_rounds"] == 8
        assert view["rounds_started"] == 0
        assert view["activation"] == "armed"

    async def test_create_on_existing_non_complete_goal_is_409(self, client):
        c, _, threads, _ = client
        await _make_thread(threads, "t2", OWNER)
        await _create(c, "t2")
        dup = await c.post(_base("t2"), json={"objective": "again"})
        assert dup.status_code == 409
        assert dup.json()["detail"]["code"] == "GOAL_ALREADY_EXISTS"

    async def test_invalid_objective_and_cap_rejected(self, client):
        c, _, threads, _ = client
        await _make_thread(threads, "t3", OWNER)
        bad_obj = await c.post(_base("t3"), json={"objective": "   "})
        assert bad_obj.status_code == 400
        assert bad_obj.json()["detail"]["code"] == "GOAL_INVALID_OBJECTIVE"
        bad_cap = await c.post(_base("t3"), json={"objective": "x", "max_goal_rounds": 0})
        assert bad_cap.status_code == 400
        assert bad_cap.json()["detail"]["code"] == "GOAL_INVALID_MAX_ROUNDS"


class TestTransitions:
    async def _paused_view(self, c, threads, tid):
        await _make_thread(threads, tid, OWNER)
        created = await _create(c, tid)
        ref = {"id": created["goal"]["id"], "revision": created["goal"]["revision"]}
        paused = await c.post(f"{_base(tid)}/pause", json={"ref": ref})
        assert paused.status_code == 200, paused.text
        return created, paused.json()

    async def test_pause_resume_cycle_with_activation_side_effects(self, client):
        c, _, threads, _ = client
        _, paused = await self._paused_view(c, threads, "t10")
        assert paused["goal"]["phase"] == "paused"
        assert paused["activation"] == "disarmed"
        resumed = await c.post(
            f"{_base('t10')}/resume", json={"ref": paused["last_ref"]}
        )
        assert resumed.status_code == 200
        assert resumed.json()["goal"]["phase"] == "active"
        assert resumed.json()["activation"] == "armed"

    async def test_double_resume_is_invalid_transition(self, client):
        c, _, threads, _ = client
        _, paused = await self._paused_view(c, threads, "t11")
        first = await c.post(f"{_base('t11')}/resume", json={"ref": paused["last_ref"]})
        assert first.status_code == 200
        again = await c.post(f"{_base('t11')}/resume", json={"ref": first.json()["last_ref"]})
        assert again.status_code == 409
        assert again.json()["detail"]["code"] == "GOAL_INVALID_TRANSITION"

    async def test_complete_from_paused_then_clear_tombstone(self, client):
        c, _, threads, _ = client
        _, paused = await self._paused_view(c, threads, "t12")
        done = await c.post(f"{_base('t12')}/complete", json={"ref": paused["last_ref"]})
        assert done.status_code == 200
        assert done.json()["goal"]["phase"] == "complete"
        assert done.json()["activation"] == "disarmed"
        # create may replace a completed goal; the new id starts at revision 1? no — DSH replaces via fresh id revision 1
        replaced = await _create(c, "t12")
        assert replaced["goal"]["revision"] == 1

    async def test_block_requires_reason_and_only_from_active(self, client):
        c, _, threads, _ = client
        await _make_thread(threads, "t13", OWNER)
        created = await _create(c, "t13")
        blocked = await c.post(
            f"{_base('t13')}/block",
            json={
                "ref": created["last_ref"],
                "reason": {"code": "deps-missing", "message": "waiting on upstream"},
            },
        )
        assert blocked.status_code == 200
        assert blocked.json()["goal"]["phase"] == "blocked"
        assert blocked.json()["goal"]["blocked_reason"]["code"] == "deps-missing"
        reblocked = await c.post(
            f"{_base('t13')}/block",
            json={
                "ref": blocked.json()["last_ref"],
                "reason": {"code": "x", "message": "y"},
            },
        )
        assert reblocked.status_code == 409


class TestCASAndEdit:
    async def test_stale_revision_rejected_and_edit_bumps_revision(self, client):
        c, _, threads, _ = client
        await _make_thread(threads, "t20", OWNER)
        created = await _create(c, "t20")
        stale_ref = {"id": created["goal"]["id"], "revision": 99}
        stale = await c.patch(
            _base("t20"), json={"ref": stale_ref, "objective": "nope"}
        )
        assert stale.status_code == 409
        assert stale.json()["detail"]["code"] == "GOAL_STALE_REVISION"

        good_ref = {"id": created["goal"]["id"], "revision": created["goal"]["revision"]}
        edited = await c.patch(
            _base("t20"), json={"ref": good_ref, "max_goal_rounds": 5}
        )
        assert edited.status_code == 200
        assert edited.json()["goal"]["revision"] == 2
        assert edited.json()["goal"]["max_goal_rounds"] == 5
        # phase untouched by edit
        assert edited.json()["goal"]["phase"] == "active"

    async def test_empty_edit_is_invalid(self, client):
        c, _, threads, _ = client
        await _make_thread(threads, "t21", OWNER)
        created = await _create(c, "t21")
        empty = await c.patch(
            _base("t21"),
            json={"ref": {"id": created["goal"]["id"], "revision": 1}},
        )
        assert empty.status_code == 400
        assert empty.json()["detail"]["code"] == "GOAL_INVALID_EDIT"


class TestClearAndNotFound:
    async def test_clear_without_goal_is_404(self, client):
        c, _, threads, _ = client
        await _make_thread(threads, "t30", OWNER)
        missing = await c.request(
            "DELETE",
            _base("t30"),
            json={"ref": {"id": "goal-x", "revision": 1}},
        )
        assert missing.status_code == 404
        assert missing.json()["detail"]["code"] == "GOAL_NOT_FOUND"

    async def test_clear_tombstone_then_create_fresh_revision_one(self, client):
        c, _, threads, _ = client
        await _make_thread(threads, "t31", OWNER)
        created = await _create(c, "t31")
        cleared = await c.request(
            "DELETE",
            _base("t31"),
            json={"ref": created["last_ref"]},
        )
        assert cleared.status_code == 200
        tomb = cleared.json()
        assert tomb["goal"] is None
        assert tomb["cleared"]["id"] == created["goal"]["id"]
        assert tomb["cleared"]["revision"] == 2
        fresh = await _create(c, "t31", "second life")
        assert fresh["goal"]["revision"] == 1
        history = (await c.get(f"{_base('t31')}/events")).json()
        assert [h["operation"] for h in history] == ["create", "clear", "create"]

    async def test_cross_user_thread_denied_before_goal_logic(self, client):
        c, _, threads, _ = client
        await _make_thread(threads, "t-other", OTHER)
        denied = await c.post(_base("t-other"), json={"objective": "intrude"})
        assert denied.status_code == 404


class TestSSEBroadcast:
    async def test_change_event_reaches_subscriber_as_whole_snapshot(self, client):
        import asyncio

        c, _, threads, app = client
        await _make_thread(threads, "t40", OWNER)

        stream_queue = await app.state.goal_broker.subscribe(OWNER, "t40")
        try:
            await _create(c, "t40", "broadcast me")
            payload = await asyncio.wait_for(stream_queue.get(), timeout=2)
            assert payload["operation"] == "create"
            assert payload["goal"]["objective"] == "broadcast me"
            assert payload["goal"]["activation"] == "armed"
            assert payload["ref"] == {
                "id": payload["goal"]["id"],
                "revision": payload["goal"]["revision"],
            }
        finally:
            await app.state.goal_broker.unsubscribe(OWNER, "t40", stream_queue)
