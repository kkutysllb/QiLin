"""Mid-run message injection (插话) — gateway 到 agent 的进程内通道与消费端。

与 DSH agent-loop 的 steer（Inbox next-step 目标）同构：繁忙时用户补充的
消息**不打断当前 run**，在下一次模型调用前并入上下文。

通道形态（进程内、零持久化）：

- gateway POST /api/threads/{tid}/runs/{rid}/inject 校验 run 活动后调
  enqueue_injection 写入 per-thread 队列（本模块注册表，deque）；
- InjectMiddleware（装配进 lead agent 中间件链，见 lead_agent.agent.
  build_middlewares）在每次模型调用前（before_model/abefore_model）排空
  队列，把消息作为 HumanMessage 追加进图状态——经 add_messages reducer
  与 checkpoint 自然持久化，并随 SSE 消息流对前端可见。

ephemeral 边界：**未消费**的注入仅存进程内存；run 收尾时由 worker.py 的
finally 排空回写线程历史（防静默丢失）。gateway 进程重启即丢队列，与
前端队列的持久化等级（localStorage）对等，v1 明确接受。
"""

from __future__ import annotations

import logging
from collections import deque
from dataclasses import dataclass
from typing import Any, override

from langchain.agents import AgentState
from langchain.agents.middleware import AgentMiddleware
from langchain_core.messages import HumanMessage
from langgraph.runtime import Runtime

logger = logging.getLogger(__name__)

#: per-thread 注入队列注册表（进程内）。gateway 端点写、中间件读；线程级
#: 粒度即可——同一线程同一时刻至多一个活动 run（multitask_strategy=reject）。
#: 全部操作同步（单事件循环内无并发竞争），deque 两端 O(1)。
_INJECTIONS: dict[str, deque[InjectPayload]] = {}


@dataclass(frozen=True)
class InjectPayload:
    """One accepted injection, verbatim from the gateway request body."""

    content: str
    attachments: list[Any] | None = None
    message_id: str | None = None
    queued_at: int | None = None


def enqueue_injection(thread_id: str, payload: InjectPayload) -> int:
    """Queue *payload* for *thread_id*; returns the queue depth after join."""
    queue = _INJECTIONS.setdefault(thread_id, deque())
    queue.append(payload)
    return len(queue)


def drain_injections(thread_id: str) -> list[InjectPayload]:
    """Pop every pending injection for *thread_id* (oldest first).

    空队列从注册表摘除，避免长会话下 dict 无界增长。调用方：InjectMiddleware
    （模型调用前）与 worker 收尾（防静默丢失的回写路径）。
    """
    queue = _INJECTIONS.get(thread_id)
    if queue is None:
        return []
    items: list[InjectPayload] = []
    while queue:
        items.append(queue.popleft())
    _INJECTIONS.pop(thread_id, None)
    return items


def pending_injection_count(thread_id: str) -> int:
    """Current unconsumed depth for *thread_id* (observability/tests)."""
    queue = _INJECTIONS.get(thread_id)
    return len(queue) if queue is not None else 0


def injected_human_message(payload: InjectPayload) -> HumanMessage:
    """Build the HumanMessage for one payload.

    双方共用：InjectMiddleware（模型调用前消费）与 worker 收尾回写
    （run 结束仍未消费的防丢失路径）——同一 payload 落进历史的形态
    必须一致。additional_kwargs 保留来源标记供 UI/测试辨识。
    """
    return HumanMessage(
        content=payload.content,
        additional_kwargs={
            "injected": True,
            "inject_message_id": payload.message_id,
            "queued_at": payload.queued_at,
        },
    )


def _runtime_thread_id(runtime: Runtime | None) -> str | None:
    """Resolve thread_id the same way DurableContextMiddleware resolves
    run_id: prefer the gateway-stamped run context, fall back to the
    langgraph checkpointer configurable (single-process worker paths)."""
    context = getattr(runtime, "context", None)
    if isinstance(context, dict):
        thread_id = context.get("thread_id")
        if thread_id:
            return str(thread_id)
    config = getattr(runtime, "config", None) or {}
    configurable = config.get("configurable") or {}
    thread_id = configurable.get("thread_id")
    return str(thread_id) if thread_id else None


class InjectMiddleware(AgentMiddleware):
    """Consume pending gateway injections right before each model call.

    返回 {"messages": [HumanMessage, ...]}——经 add_messages reducer 追加到
    消息尾（紧贴上一轮 tool 结果之后、下一次模型调用之前），与 DSH 在
    step 边界并入用户消息的位置一致。空队列返回 None（零开销）。
    """

    @override
    def before_model(self, state: AgentState, runtime: Runtime) -> dict | None:
        return self._consume(runtime)

    @override
    async def abefore_model(
        self, state: AgentState, runtime: Runtime
    ) -> dict | None:
        return self._consume(runtime)

    def _consume(self, runtime: Runtime | None) -> dict | None:
        thread_id = _runtime_thread_id(runtime)
        if not thread_id:
            return None
        payloads = drain_injections(thread_id)
        if not payloads:
            return None
        messages = [injected_human_message(p) for p in payloads]
        logger.info(
            "[inject] consumed %d injected message(s) before next model call"
            " for thread %s",
            len(messages),
            thread_id,
        )
        return {"messages": messages}


# 便于 gateway 侧类型标注与测试断言的重导出。
__all__ = [
    "InjectMiddleware",
    "InjectPayload",
    "drain_injections",
    "enqueue_injection",
    "injected_human_message",
    "pending_injection_count",
]