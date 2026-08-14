"""Configuration for the tool-approval human gate middleware."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ToolApprovalMode = Literal["off", "dangerous", "all"]

DEFAULT_APPROVAL_TOOLS: tuple[str, ...] = ("bash", "write_file", "str_replace")


class ToolApprovalConfig(BaseModel):
    """Human-approval gate for risky tool calls.

    When active, a call to one of the intercepted tools that matches the
    built-in risk rules (or any call, in ``all`` mode) is interrupted before
    execution: the run ends with an ``ask_clarification``-style human-input
    card asking the user to approve or deny, and execution resumes from the
    user's reply. ``off`` makes the middleware a pure pass-through.
    """

    mode: ToolApprovalMode = Field(
        default="dangerous",
        description=(
            "off = pass every call through (no-op); "
            "dangerous = prompt only for calls matching the built-in risk rules "
            "(destructive bash commands, writes to sensitive paths, writes outside the sandbox user-data root); "
            "all = prompt for every call to the intercepted tools."
        ),
    )
    tools: list[str] = Field(
        default_factory=lambda: list(DEFAULT_APPROVAL_TOOLS),
        description=(
            "Tool names whose calls are gated by the approval middleware. "
            "The built-in risk rules cover bash commands (``command`` arg) and "
            "file writes (``path`` / ``file_path`` args); other tool names only "
            "take effect in ``all`` mode."
        ),
    )
