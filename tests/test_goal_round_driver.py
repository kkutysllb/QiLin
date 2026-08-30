"""Goal round driver — DSH prompt parity and quiescence-gate matrix."""

from __future__ import annotations

import pytest

from app.gateway.goal_round_driver import (
    drive,
    render_goal_round_prompt,
)
from qilin.persistence.goal.sql import GoalRepository

EXPECTED_PROMPT = (
    "<goal_round>\n"
    '"objective": placed by json.dumps\n'
    "Round: 1/8\n\n"
    "Continue working toward the objective in this same session. Treat the current workspace, "
    "tool results, and durable session state as authoritative; inspect them instead of assuming "
    "earlier narration is still current. Make concrete progress and verify the result. Before "
    "claiming completion, gather evidence that the whole objective is achieved, read the current "
    "goal, and mark it complete. If work remains, leave the goal active for the next round. Follow "
    "the configured goal-tool policy before reporting a blocker.\n"
    "</goal_round>"
)


def _template_skeleton() -> str:
    """The fixed body with objective/round slots blanked for parity check."""
    return render_goal_round_prompt("\x00SLOT\x00", 0, 0).replace(
        '"\\u0000SLOT\\u0000"', "<OBJ>"
    ).replace("Round: 0/0", "Round: <R>/<M>")


class TestPromptParity:
    def test_fixed_paragraph_matches_dsh_prompt_ts(self):
        skeleton = _template_skeleton()
        assert skeleton == (
            "<goal_round>\n"
            'Objective: <OBJ>\n'
            "Round: <R>/<M>\n\n"
            "Continue working toward the objective in this same session. Treat the current workspace, "
            "tool results, and durable session state as authoritative; inspect them instead of assuming "
            "earlier narration is still current. Make concrete progress and verify the result. Before "
            "claiming completion, gather evidence that the whole objective is achieved, read the current "
            "goal, and mark it complete. If work remains, leave the goal active for the next round. Follow "
            "the configured goal-tool policy before reporting a blocker.\n"
            "</goal_round>"
        )

    def test_objective_is_json_stringified_without_spaces(self):
        text = render_goal_round_prompt("say hi", 2, 9)
        assert 'Objective: "say hi"' in text
        assert "Round: 2/9" in text


@pytest.fixture()
async def repo():
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
    yield GoalRepository(async_sessionmaker(engine, expire_on_commit=False))
    await engine.dispose()


async def _seed_goal(repo: GoalRepository, thread_id: str, *, rounds_cap: int = 3):
    created = await repo.create(
        thread_id,
        objective="ship it",
        max_goal_rounds=rounds_cap,
        user_id="u1",
    )
    return created["view"], created


class TestQuiescenceGate:
    async def test_no_projection_and_clear_drop(self, repo):
        assert (await drive(repo, "t", None, "armed", inject=_noop)).status == "dropped"
        tomb = {"operation": "clear", "cleared": {"id": "g", "revision": 2}}
        out = await drive(repo, "t", tomb, "armed", inject=_noop)
        assert out.status == "dropped" and out.reason == "no-current-goal"

    async def test_non_active_or_disarmed_drop(self, repo):
        _view, created = await _seed_goal(repo, "t1")
        ref = created["view"]["last_ref"]
        paused = await repo.pause("t1", ref=ref, user_id="u1")
        proj = paused["view"]
        out = await drive(repo, "t1", {**proj}, "armed", inject=_noop)
        assert out.status == "dropped" and out.reason == "phase=paused"
        active = {"operation": "create", "goal": {"id": ref["id"], "revision": 1, "phase": "active", "objective": "ship it", "max_goal_rounds": 3}}
        out = await drive(repo, "t1", active, "disarmed", inject=_noop)
        assert out.status == "dropped" and out.reason == "disarmed"

    async def test_budget_exhaustion_auto_blocks_with_round_limit(self, repo):
        await _seed_goal(repo, "t2", rounds_cap=1)
        # simulate one admitted round directly, then drive → must block
        head = await repo.projection("t2")
        await repo.admit_round("t2", ref=head["last_ref"], round=1)
        proj = await repo.projection("t2")
        delivered: list[tuple[str, int]] = []

        async def inject(prompt_text: str, rnd: int) -> None:
            delivered.append((prompt_text, rnd))

        out = await drive(repo, "t2", proj, "armed", inject=inject)
        assert out.status == "blocked-limit"
        assert not delivered
        after = await repo.projection("t2")
        assert after["goal"]["phase"] == "blocked"
        assert after["goal"]["blocked_reason"]["code"] == "round-limit"
        assert after["goal"]["blocked_reason"]["message"].endswith("limit of 1 rounds.")

    async def test_successful_drive_injects_and_admits(self, repo):
        await _seed_goal(repo, "t3")
        proj = await repo.projection("t3")
        got: list[int] = []

        async def inject(prompt_text: str, rnd: int) -> None:
            got.append(rnd)

        out = await drive(repo, "t3", proj, "armed", inject=inject)
        assert out.status == "injected"
        assert got == [1] and "<goal_round>" in render_goal_round_prompt("ship it", 1, 3)
        after = await repo.projection("t3")
        assert after["rounds_started"] == 1
        # second pass admits round 2 within cap 3
        out = await drive(repo, "t3", after, "armed", inject=inject)
        assert out.status == "injected" and got == [1, 2]

    async def test_injection_failure_leaves_counter_untouched(self, repo):
        await _seed_goal(repo, "t4")
        proj = await repo.projection("t4")

        async def boom(_prompt_text: str, _rnd: int) -> None:
            raise RuntimeError("channel down")

        out = await drive(repo, "t4", proj, "armed", inject=boom)
        assert out.status == "dropped" and out.reason == "inject-failed"
        assert (await repo.projection("t4"))["rounds_started"] == 0


async def _noop(_prompt_text: str, _rnd: int) -> None:  # pragma: no cover - trivial
    raise AssertionError("inject must not be called on dropped decisions")
