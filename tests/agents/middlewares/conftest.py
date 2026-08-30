"""Shared ToolCallRequest fake-builder fixture for the middleware decision tests."""

from typing import Any

import pytest
from langgraph.prebuilt.tool_node import ToolCallRequest


@pytest.fixture()
def make_request():
    """Factory: build a ToolCallRequest fake shaped like the ToolNode dispatch payload.

    ``args`` forms (preserving both middleware suites' call conventions):

    - dict: used verbatim (tool-approval suite);
    - str starting with ``{``: used verbatim (providers that serialize args
      as a JSON string);
    - other str: wrapped as ``{"path": ...}`` (read-before-write suite);
    - None: falls back to ``{"command": "ls"}`` (ungated-tool placeholder).

    ``state`` defaults to ``{"messages": messages or []}``.
    """

    def _make_request(
        name: str,
        args: dict[str, Any] | str | None = None,
        state: dict[str, Any] | None = None,
        *,
        tool_call_id: str = "call-1",
        messages: list[Any] | None = None,
        runtime: Any = None,
    ) -> ToolCallRequest:
        if args is None:
            args = {"command": "ls"}
        elif isinstance(args, str) and not args.lstrip().startswith("{"):
            args = {"path": args}
        return ToolCallRequest(
            tool_call={"name": name, "args": args, "id": tool_call_id},
            tool=None,
            state=state if state is not None else {"messages": messages or []},
            runtime=runtime,
        )

    return _make_request
