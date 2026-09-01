"""ToolEventMiddleware — publish post-execute events for file-mutating
tools to the ports event ring (H5-b: the QiLin analogue of DSH's
"tools/post-execute" emitter, observability semantics across processes).

Only the event face lives here; content-level before/after capture needs
sandbox-aware reads and lands with the file-review install (H5-d).
"""
from __future__ import annotations

import logging
from typing import Any, override

from langchain.agents.middleware import AgentMiddleware
from langgraph.prebuilt.tool_node import ToolCallRequest

from qilin.ports.tool_events import publish_tool_event

logger = logging.getLogger(__name__)

_MUTATING_TOOLS = frozenset({"write_file", "str_replace", "edit_file"})


class ToolEventMiddleware(AgentMiddleware):
    _MUTATING = _MUTATING_TOOLS

    @override
    async def wrap_tool_call(self, request: ToolCallRequest, handler) -> Any:
        name = request.tool_call.get("name")
        logger.info("[tool-events] wrap name=%r", name)
        if name not in self._MUTATING:
            return await handler(request)
        result = await handler(request)
        try:
            args = request.tool_call.get("args") or {}
            path = args.get("path") or args.get("file_path")
            publish_tool_event(
                name=str(name),
                call_id=str(request.tool_call.get("id") or ""),
                thread_id=self._thread_id(request),
                path=str(path) if isinstance(path, str) else None,
            )
        except Exception:
            logger.exception("tool event publication failed")
        return result

    @staticmethod
    def _thread_id(request: ToolCallRequest) -> str:
        context = getattr(request.runtime, "context", None)
        if isinstance(context, dict):
            thread_id = context.get("thread_id")
            if isinstance(thread_id, str) and thread_id:
                return thread_id
        return "unknown"
