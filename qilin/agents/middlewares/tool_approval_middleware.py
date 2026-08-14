"""Middleware gating risky tool calls behind a human approval prompt.

Before a risky tool call executes, the run is interrupted and the user is
asked to approve or deny it. The approval card reuses the exact
``ask_clarification`` human-input machinery (``artifact.human_input`` payload
on a ToolMessage + ``Command(goto=END)``), so the existing frontend card,
reply flow, and reply persistence all apply unchanged.

Loop prevention is fingerprint-based: the approval request id is derived from
``sha256(tool_name + canonical_json(args))``, NOT from the tool_call_id. When
the user approves, the next run's model re-issues the call with a NEW
tool_call_id, but the same (name, args) fingerprint — the middleware then
finds the approval reply in ``state["messages"]`` (a HumanMessage whose
``additional_kwargs.human_input_response.request_id`` matches) and lets the
call through exactly once. Without this, approval would prompt forever.

Non-interactive contexts (``disable_clarification`` in run context, e.g.
GitHub webhooks) cannot answer a synchronous prompt. Rather than dead-ending
the turn with an unanswerable card, a call that would prompt is DENIED with
an explanatory ToolMessage — for a risky operation, the unavailable human
judgement defaults to "no".
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Awaitable, Callable
from hashlib import sha256
from typing import Any, Literal, override

from langchain.agents import AgentState
from langchain.agents.middleware import AgentMiddleware
from langchain_core.messages import HumanMessage, ToolMessage
from langgraph.graph import END
from langgraph.prebuilt.tool_node import ToolCallRequest
from langgraph.types import Command

from qilin.agents.human_input import read_human_input_response
from qilin.config.tool_approval_config import DEFAULT_APPROVAL_TOOLS, ToolApprovalConfig

logger = logging.getLogger(__name__)

# Hard caps mirroring ClarificationMiddleware conventions so a runaway command
# or path can never publish an unbounded card.
MAX_ARG_DISPLAY_CHARS = 200

_APPROVE_VALUE = "approve"
_DENY_VALUE = "deny"

_HUMAN_INPUT_SOURCE = "ask_clarification"
_CLARIFICATION_TYPE = "tool_approval"

# Conservative bash risk heuristics. Word boundaries keep matches on real
# command tokens; anything unmatched passes through without a prompt.
_BASH_RISK_PATTERNS: tuple[re.Pattern[str], ...] = (
    # rm with short flags containing both r(ecursive) and f(orce), either order
    re.compile(r"\brm\s+(?:-[a-zA-Z]+\s+)*-(?:[a-zA-Z]*r[a-zA-Z]*f|[a-zA-Z]*f[a-zA-Z]*r)[a-zA-Z]*\b"),
    # privilege escalation
    re.compile(r"\bsudo\b"),
    # filesystem creation / raw device writes
    re.compile(r"\bmkfs(?:\.\w+)?\b"),
    re.compile(r"\bdd\s+if="),
    # power state
    re.compile(r"\b(?:shutdown|reboot|halt|poweroff)\b"),
    # pipe-to-shell: `curl ... | sh`, `wget -qO- ... | bash` (sudo-prefixed too)
    re.compile(r"\b(?:curl|wget)\b[^|;&]*\|\s*(?:sudo\s+)?(?:ba|z|da)?sh\b"),
    # world-writable recursion
    re.compile(r"\bchmod\s+(?:-[a-zA-Z]+\s+)*-[a-zA-Z]*R[a-zA-Z]*\s+777\b"),
    # history rewrite on a remote
    re.compile(r"\bgit\s+push\b[^;|&]*\s--force\b"),
    re.compile(r"\bnpm\s+publish\b"),
    # dotfile truncation: `:> ~/.bash_history`, `: > .env`, `> ~/.ssh/known_hosts`
    re.compile(r"(?:^|[\s;|&])(?::\s*)?>\s*(?:[\w~/.\-]+/)?\.[^/\s]+"),
)

# Sensitive write targets for file-modifying tools, matched against the
# normalized path string.
_SENSITIVE_PATH_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"(?:^|/)\.env(?:[./]|$)"),  # .env, .env.local, config/.env
    re.compile(r"(?:^|/)\.ssh(?:/|$)"),  # ~/.ssh/authorized_keys
    re.compile(r"(?:^|/)id_rsa(?:[.\-/]|$)"),  # SSH private keys
    re.compile(r"_history(?:[./]|$)"),  # .bash_history, zsh_history
    re.compile(r"(?:^|/)\.git/config$"),  # repo git config (remotes/credentials)
)

# Model-facing virtual root of the thread workspace/uploads/outputs inside the
# sandbox (sandbox/tools.py maps ``/mnt/user-data/*`` to the thread dirs).
# Absolute paths outside it are writes to system locations (/etc, /usr, ...).
_USER_DATA_ROOT = "/mnt/user-data"

# Args carrying the target path for file-modifying tools, in preference order.
_PATH_ARG_KEYS = ("path", "file_path")
# Args carrying the command for bash-like tools, in preference order.
_COMMAND_ARG_KEYS = ("command", "cmd", "script")

_APPROVAL_OPTIONS = (
    {"id": "approve", "label": "允许执行", "value": _APPROVE_VALUE},
    {"id": "deny", "label": "拒绝执行", "value": _DENY_VALUE},
)

_DENIAL_CONTENT = (
    "User denied this operation (human approval was requested and refused). "
    "Do not retry the same call. Continue the task a different way, or explain "
    "to the user what you intended to do and why."
)

_DISABLED_CONTENT = (
    "Error: {tool_name} blocked — this operation requires human approval, but "
    "the current context is non-interactive (no synchronous human is present). "
    "The operation was not executed. Continue with a safer alternative or "
    "explain what you intended to do."
)


class ToolApprovalMiddlewareState(AgentState):
    """Compatible with the `ThreadState` schema."""


class ToolApprovalMiddleware(AgentMiddleware[ToolApprovalMiddlewareState]):
    """Interrupt risky tool calls and ask the user to approve or deny them.

    Modes (``tool_approval.mode``):
    - ``off``: pure pass-through.
    - ``dangerous``: prompt only for calls matching the built-in risk rules.
    - ``all``: prompt for every call to the intercepted tools.
    """

    state_schema = ToolApprovalMiddlewareState

    def __init__(
        self,
        mode: Literal["off", "dangerous", "all"] = "dangerous",
        tool_names: list[str] | tuple[str, ...] | None = None,
    ) -> None:
        super().__init__()
        self.mode: Literal["off", "dangerous", "all"] = mode
        # NOT named ``tools``: that attribute is the AgentMiddleware convention
        # for tools a middleware *contributes* to the agent — create_agent would
        # try to register these name strings as real tools.
        self.tool_names: frozenset[str] = frozenset(tool_names) if tool_names is not None else frozenset(DEFAULT_APPROVAL_TOOLS)

    @classmethod
    def from_config(cls, config: ToolApprovalConfig) -> ToolApprovalMiddleware:
        """Construct from a Pydantic-validated config, trusting its validation."""
        return cls(mode=config.mode, tool_names=config.tools)

    # -- interception ------------------------------------------------------

    @override
    def wrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], ToolMessage | Command],
    ) -> ToolMessage | Command:
        decision = self._decide(request)
        if decision == "passthrough":
            return handler(request)
        if decision == "approved":
            logger.info("Tool approval: previously approved fingerprint for %r; executing", request.tool_call.get("name"))
            return handler(request)
        if decision == "denied":
            return self._denial_message(request)
        if decision == "suppressed":
            return self._suppressed_message(request)
        return self._prompt(request)

    @override
    async def awrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], Awaitable[ToolMessage | Command]],
    ) -> ToolMessage | Command:
        decision = self._decide(request)
        if decision == "passthrough":
            return await handler(request)
        if decision == "approved":
            logger.info("Tool approval: previously approved fingerprint for %r; executing", request.tool_call.get("name"))
            return await handler(request)
        if decision == "denied":
            return self._denial_message(request)
        if decision == "suppressed":
            return self._suppressed_message(request)
        return self._prompt(request)

    def _decide(self, request: ToolCallRequest) -> Literal["passthrough", "approved", "denied", "suppressed", "prompt"]:
        """Classify one tool call without executing it.

        Order matters: mode/tool gating first (cheap), then the fingerprint
        scan (O(messages)) only when a prompt would otherwise be shown, so
        safe calls never pay the history scan.
        """
        if self.mode == "off":
            return "passthrough"
        tool_call = request.tool_call
        name = tool_call.get("name")
        if name not in self.tool_names:
            return "passthrough"
        if self.mode != "all" and not self._is_risky(name, tool_call.get("args")):
            return "passthrough"

        request_id = self._request_id(name, tool_call.get("args"))
        prior = self._prior_decision(request.state, request_id)
        if prior == _APPROVE_VALUE:
            return "approved"
        if prior is not None:
            return "denied"

        if self._is_disabled(request):
            return "suppressed"
        return "prompt"

    # -- risk rules ----------------------------------------------------------

    @staticmethod
    def _normalize_args(raw_args: Any) -> dict[str, Any]:
        """Best-effort arg normalization.

        Some providers serialize tool-call ``args`` as a JSON string instead of
        a dict (see ``_normalize_tool_call_args`` in loop_detection_middleware).
        Normalizing here keeps both the risk rules and — critically — the
        approval fingerprint stable across the two spellings, so a reply can
        still be matched to a re-issued call.
        """
        if isinstance(raw_args, dict):
            return raw_args
        if isinstance(raw_args, str):
            try:
                parsed = json.loads(raw_args)
            except (TypeError, ValueError):
                return {}
            return parsed if isinstance(parsed, dict) else {}
        return {}

    @classmethod
    def _is_risky(cls, name: str, raw_args: Any) -> bool:
        """Whether this call matches the built-in risk rules (mode ``dangerous``)."""
        args = cls._normalize_args(raw_args)
        if name == "bash":
            command = cls._primary_argument(name, args)
            return any(pattern.search(command) for pattern in _BASH_RISK_PATTERNS)
        path = cls._target_path(args)
        if path is None:
            return False
        return cls._is_risky_path(path)

    @staticmethod
    def _is_risky_path(path: str) -> bool:
        """Sensitive dotfile/credential targets, or writes outside the user-data root."""
        if any(pattern.search(path) for pattern in _SENSITIVE_PATH_PATTERNS):
            return True
        # Absolute paths must live under the sandbox's thread user-data root;
        # relative paths are resolved by the tool itself and pass here.
        return path.startswith("/") and not path.startswith(_USER_DATA_ROOT)

    # -- helpers ----------------------------------------------------------

    @staticmethod
    def _target_path(args: dict[str, Any]) -> str | None:
        for key in _PATH_ARG_KEYS:
            value = args.get(key)
            if isinstance(value, str) and value:
                return value
        return None

    @staticmethod
    def _primary_argument(name: str, args: dict[str, Any]) -> str:
        """The command (bash) or target path (file tools) to show the user."""
        keys = _COMMAND_ARG_KEYS if name == "bash" else _PATH_ARG_KEYS
        for key in keys:
            value = args.get(key)
            if isinstance(value, str) and value:
                return value
        try:
            return json.dumps(args, sort_keys=True, ensure_ascii=False, default=str)
        except (TypeError, ValueError):
            return ""

    @classmethod
    def canonical_args(cls, raw_args: Any) -> str:
        """Canonical JSON serialization used for the approval fingerprint."""
        args: dict[str, Any] = cls._normalize_args(raw_args)
        if not args and raw_args is not None and not isinstance(raw_args, (dict, str)):
            args = {"args": raw_args}
        return json.dumps(args, sort_keys=True, ensure_ascii=False, default=str)

    @staticmethod
    def _request_id(name: str, raw_args: Any) -> str:
        """Stable approval id keyed by (tool, args), NOT by tool_call_id.

        The model re-issues an approved call with a fresh tool_call_id, so the
        id used to match the user's reply must depend only on the call content.
        """
        digest = sha256(f"{name}:{ToolApprovalMiddleware.canonical_args(raw_args)}".encode()).hexdigest()[:16]
        return f"approval-{digest}"

    @staticmethod
    def _prior_decision(state: Any, request_id: str) -> str | None:
        """Scan state messages for a human reply to this request id.

        Returns the reply value (``approve`` / other), or None when absent or
        malformed. Latest reply wins, matching how the model sees the thread.
        """
        messages = state.get("messages") if isinstance(state, dict) else getattr(state, "messages", None)
        if not messages:
            return None
        for message in reversed(messages):
            if not isinstance(message, HumanMessage):
                continue
            response = read_human_input_response(message.additional_kwargs)
            if response is not None and response["request_id"] == request_id:
                return response["value"]
        return None

    def _is_disabled(self, request: ToolCallRequest) -> bool:
        """Whether human input is suppressed for this run (non-interactive channel)."""
        runtime = getattr(request, "runtime", None)
        context = getattr(runtime, "context", None)
        if not context:
            return False
        return bool(context.get("disable_clarification"))

    # -- outputs ----------------------------------------------------------

    def _build_question(self, name: str, primary_arg: str) -> str:
        display = primary_arg[:MAX_ARG_DISPLAY_CHARS]
        if len(primary_arg) > MAX_ARG_DISPLAY_CHARS:
            display = f"{display}…"
        if display:
            return f"Agent 请求执行 {name}，该操作被判定为高风险，是否允许？\n{display}"
        return f"Agent 请求执行 {name}，该操作被判定为高风险，是否允许？"

    def _build_human_input_payload(self, *, request_id: str, question: str, tool_call_id: str) -> dict[str, Any]:
        """Build the structured UI payload, reusing the ask_clarification v1 shape.

        The frontend already renders ``ask_clarification``-sourced
        ``human_input_request`` payloads as an interactive card and replies
        with a ``human_input_response`` carrying the same ``request_id`` — this
        middleware deliberately changes nothing about that protocol.
        """
        payload: dict[str, Any] = {
            "version": 1,
            "kind": "human_input_request",
            "source": _HUMAN_INPUT_SOURCE,
            "request_id": request_id,
            "clarification_type": _CLARIFICATION_TYPE,
            "question": question,
            "input_mode": "single_choice",
            "options": [dict(option) for option in _APPROVAL_OPTIONS],
        }
        if tool_call_id:
            payload["tool_call_id"] = tool_call_id
        return payload

    def _prompt(self, request: ToolCallRequest) -> Command:
        """Interrupt the run and present the approval card (same shape as clarifications)."""
        tool_call = request.tool_call
        name = str(tool_call.get("name", ""))
        tool_call_id = str(tool_call.get("id", ""))
        args = self._normalize_args(tool_call.get("args"))
        request_id = self._request_id(name, tool_call.get("args"))
        question = self._build_question(name, self._primary_argument(name, args))

        logger.info("Tool approval: prompting for %r (request_id=%s)", name, request_id)
        logger.debug("Tool approval question: %s", question)

        tool_message = ToolMessage(
            id=f"tool-approval:{request_id}",
            content=question,
            tool_call_id=tool_call_id,
            # ``ask_clarification`` is the conventional name for any message
            # carrying a human_input artifact — the frontend groups
            # clarification/approval cards by this name. The ``tool_call_id``
            # above still pairs with the model's ORIGINAL tool call, so the
            # pending call is resolved correctly on the model side.
            name=_HUMAN_INPUT_SOURCE,
            artifact={
                "human_input": self._build_human_input_payload(
                    request_id=request_id,
                    question=question,
                    tool_call_id=tool_call_id,
                )
            },
        )
        # Same interrupt contract as ClarificationMiddleware: resolve the model's
        # pending call with a ToolMessage (original tool_call_id + tool name),
        # then end the run so the user can answer.
        return Command(
            update={"messages": [tool_message]},
            goto=END,
        )

    def _denial_message(self, request: ToolCallRequest) -> ToolMessage:
        """Resolve the call without executing it: the user said no."""
        tool_call = request.tool_call
        name = str(tool_call.get("name", ""))
        tool_call_id = str(tool_call.get("id", ""))
        logger.info("Tool approval: user denied %r (request_id=%s)", name, self._request_id(name, tool_call.get("args")))
        return ToolMessage(
            content=_DENIAL_CONTENT,
            tool_call_id=tool_call_id,
            name=name,
            status="error",
        )

    def _suppressed_message(self, request: ToolCallRequest) -> ToolMessage:
        """Non-interactive context: deny rather than dead-end on an unanswerable card."""
        tool_call = request.tool_call
        name = str(tool_call.get("name", ""))
        tool_call_id = str(tool_call.get("id", ""))
        logger.info("Tool approval: %r requires approval but human input is disabled; denying", name)
        return ToolMessage(
            content=_DISABLED_CONTENT.format(tool_name=name),
            tool_call_id=tool_call_id,
            name=name,
            status="error",
        )
