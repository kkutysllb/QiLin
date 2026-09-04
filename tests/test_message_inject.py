"""Mid-run message injection (插话): registry, middleware consumer, endpoint guards.

覆盖三段链路：
1. 进程内注入注册表（enqueue/drain/count，FIFO 与摘除语义）;
2. InjectMiddleware——模型调用前排空并产出 HumanMessage 状态更新;
3. gateway /inject 裸处理函数（经 functools.wraps 的 __wrapped__ 直调，
   鉴权装饰器之外的守卫矩阵：404 / 409 run_not_active / 属主 409 / 202)。
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from langchain_core.messages import HumanMessage

from app.gateway.routers.thread_runs import InjectRequest, inject_into_run
from qilin.agents.middlewares.inject_middleware import (
    _INJECTIONS,
    InjectMiddleware,
    InjectPayload,
    drain_injections,
    enqueue_injection,
    injected_human_message,
    pending_injection_count,
)
from qilin.runtime import RunStatus


@pytest.fixture(autouse=True)
def _clean_registry():
    """Isolate the process-local registry between tests."""
    _INJECTIONS.clear()
    yield
    _INJECTIONS.clear()


# ---------------------------------------------------------------------------
# 1. registry
# ---------------------------------------------------------------------------


def test_enqueue_returns_depth_and_drains_fifo() -> None:
    assert enqueue_injection("t", InjectPayload(content="a")) == 1
    assert enqueue_injection("t", InjectPayload(content="b")) == 2
    assert pending_injection_count("t") == 2

    drained = drain_injections("t")
    assert [p.content for p in drained] == ["a", "b"]
    # 空队列摘除：count 归零，重复 drain 安全返回空
    assert pending_injection_count("t") == 0
    assert drain_injections("t") == []


def test_registry_is_per_thread() -> None:
    enqueue_injection("t1", InjectPayload(content="x"))
    enqueue_injection("t2", InjectPayload(content="y"))
    assert [p.content for p in drain_injections("t1")] == ["x"]
    assert pending_injection_count("t2") == 1


def test_injected_human_message_stamps_provenance() -> None:
    msg = injected_human_message(
        InjectPayload(
            content="补充上下文",
            message_id="qm_1",
            queued_at=1234,
        )
    )
    assert isinstance(msg, HumanMessage)
    assert msg.content == "补充上下文"
    assert msg.additional_kwargs["injected"] is True
    assert msg.additional_kwargs["inject_message_id"] == "qm_1"
    assert msg.additional_kwargs["queued_at"] == 1234


# ---------------------------------------------------------------------------
# 2. InjectMiddleware
# ---------------------------------------------------------------------------


def _runtime(thread_id: str | None) -> SimpleNamespace:
    return SimpleNamespace(
        context={"thread_id": thread_id} if thread_id else {},
        config={},
    )


async def test_middleware_empty_queue_is_noop() -> None:
    mw = InjectMiddleware()
    assert mw.before_model({}, _runtime("t")) is None
    assert await mw.abefore_model({}, _runtime("t")) is None


async def test_middleware_drains_into_human_messages_in_order() -> None:
    enqueue_injection("t", InjectPayload(content="first"))
    enqueue_injection("t", InjectPayload(content="second"))
    mw = InjectMiddleware()

    update = mw.before_model({}, _runtime("t"))
    assert update is not None
    msgs = update["messages"]
    assert [m.content for m in msgs] == ["first", "second"]
    assert all(m.additional_kwargs["injected"] is True for m in msgs)
    # 消费即清空：第二次调用回到 no-op
    assert mw.before_model({}, _runtime("t")) is None

    # 异步路径同步语义
    enqueue_injection("t", InjectPayload(content="third"))
    update = await mw.abefore_model({}, _runtime("t"))
    assert update is not None and update["messages"][0].content == "third"


async def test_middleware_unknown_thread_is_noop() -> None:
    mw = InjectMiddleware()
    assert mw.before_model({}, _runtime(None)) is None


# ---------------------------------------------------------------------------
# 3. endpoint guards (裸处理函数，鉴权装饰器不在覆盖范围)
# ---------------------------------------------------------------------------


def _fake_request(record: SimpleNamespace | None, worker_id: str = "w1"):
    class _State:
        pass

    async def _get(run_id: str, user_id=None):
        if record is not None and record.run_id == run_id:
            return record
        return None

    manager = SimpleNamespace(worker_id=worker_id, get=_get)
    request = SimpleNamespace()
    request.app = SimpleNamespace(state=SimpleNamespace(run_manager=manager))
    return request


def _running_record(
    run_id: str = "r1",
    thread_id: str = "t1",
    *,
    status: RunStatus = RunStatus.running,
    finalizing: bool = False,
    owner_worker_id: str | None = "w1",
) -> SimpleNamespace:
    return SimpleNamespace(
        run_id=run_id,
        thread_id=thread_id,
        status=status,
        finalizing=finalizing,
        owner_worker_id=owner_worker_id,
    )


async def _call(thread_id: str, run_id: str, request) -> object:
    handler = inject_into_run.__wrapped__
    body = InjectRequest(content="插话内容", message_id="qm_9", queued_at=42)
    return await handler(thread_id, run_id, body, request)


async def test_endpoint_accepts_into_running_owned_run() -> None:
    request = _fake_request(_running_record())
    response = await _call("t1", "r1", request)
    assert response.status == "accepted"
    assert response.run_id == "r1"
    assert response.message_id == "qm_9"
    assert pending_injection_count("t1") == 1
    payload = drain_injections("t1")[0]
    assert payload.content == "插话内容"
    assert payload.message_id == "qm_9"


async def test_endpoint_404_on_unknown_run_or_wrong_thread() -> None:
    request = _fake_request(_running_record())
    with pytest.raises(HTTPException) as exc:
        await _call("t1", "missing", request)
    assert exc.value.status_code == 404

    with pytest.raises(HTTPException) as exc:
        await _call("other-thread", "r1", request)
    assert exc.value.status_code == 404


@pytest.mark.parametrize(
    "record",
    [
        _running_record(status=RunStatus.success),
        _running_record(status=RunStatus.pending),
        _running_record(finalizing=True),
    ],
)
async def test_endpoint_409_run_not_active_when_not_consuming(record) -> None:
    request = _fake_request(record)
    with pytest.raises(HTTPException) as exc:
        await _call("t1", "r1", request)
    assert exc.value.status_code == 409
    detail = exc.value.detail
    assert detail["code"] == "run_not_active"
    assert "run_status" in detail
    assert pending_injection_count("t1") == 0


async def test_endpoint_409_when_owned_by_other_worker() -> None:
    request = _fake_request(_running_record(owner_worker_id="w2"))
    with pytest.raises(HTTPException) as exc:
        await _call("t1", "r1", request)
    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "run_not_active"
    assert pending_injection_count("t1") == 0


async def test_endpoint_409_when_local_record_has_no_owner() -> None:
    # store_only / 跨进程登记：owner_worker_id 为 None 时同样拒绝
    # ——注入队列是进程本地的，非属主进程入了队也永远无人消费。
    request = _fake_request(_running_record(owner_worker_id=None))
    with pytest.raises(HTTPException) as exc:
        await _call("t1", "r1", request)
    assert exc.value.status_code == 409
    assert pending_injection_count("t1") == 0