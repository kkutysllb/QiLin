"""CRUD API for custom agents."""

import asyncio
import json
import logging
import re
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from qilin.config.agents_api_config import get_agents_api_config
from qilin.config.agents_config import (
    AgentConfig,
    AgentModelSettings,
    list_custom_agents,
    load_agent_config,
    load_agent_soul,
    preserve_non_managed_fields,
)
from qilin.config.app_config import AppConfig, get_app_config
from qilin.config.paths import get_paths
from qilin.persistence.agents import AgentExistsError, get_agent_store
from qilin.runtime.user_context import get_effective_user_id
from qilin.skills.storage import get_or_new_user_skill_storage
from qilin.utils import llm_text
from qilin.utils.oneshot_llm import run_oneshot_llm

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["agents"])

AGENT_NAME_PATTERN = re.compile(r"^[A-Za-z0-9-]+$")

ReasoningEffort = Literal["low", "medium", "high"]

# Fields carrying a custom agent's per-agent model behavior (issue #4336),
# shared by the create/update request bodies and the response so the three
# stay in lockstep. ``model`` picks the profile; the rest layer on top of it.
_MODEL_BEHAVIOR_FIELDS = ("model", "model_settings", "thinking_enabled", "reasoning_effort")


class AgentResponse(BaseModel):
    """Response model for a custom agent."""

    name: str = Field(..., description="Agent name (hyphen-case)")
    description: str = Field(default="", description="Agent description")
    model: str | None = Field(default=None, description="Optional model override")
    tool_groups: list[str] | None = Field(default=None, description="Optional tool group whitelist")
    skills: list[str] | None = Field(default=None, description="Optional skill whitelist (None=all, []=none)")
    model_settings: AgentModelSettings | None = Field(default=None, description="Per-agent sampling overrides (temperature / max_tokens)")
    thinking_enabled: bool | None = Field(default=None, description="Per-agent thinking-mode default (None = runtime default)")
    reasoning_effort: ReasoningEffort | None = Field(default=None, description="Per-agent reasoning-effort default (None = runtime default)")
    soul: str | None = Field(default=None, description="SOUL.md content")
    max_turns: int | None = Field(default=None, description="Max LLM turns for this agent (None = use subagent default)")
    timeout_seconds: int | None = Field(default=None, description="Execution timeout in seconds (None = use subagent default)")
    disallowed_tools: list[str] | None = Field(default=None, description="Tools explicitly blocked for this agent")
    role: str = Field(default="worker", description="Orchestration role: orchestrator | worker | reviewer")


class AgentsListResponse(BaseModel):
    """Response model for listing all custom agents."""

    agents: list[AgentResponse]


class AgentCreateRequest(BaseModel):
    """Request body for creating a custom agent."""

    name: str = Field(..., description="Agent name (must match ^[A-Za-z0-9-]+$, stored as lowercase)")
    description: str = Field(default="", description="Agent description")
    model: str | None = Field(default=None, description="Optional model override")
    tool_groups: list[str] | None = Field(default=None, description="Optional tool group whitelist")
    skills: list[str] | None = Field(default=None, description="Optional skill whitelist (None=all enabled, []=none)")
    model_settings: AgentModelSettings | None = Field(default=None, description="Per-agent sampling overrides (temperature / max_tokens)")
    thinking_enabled: bool | None = Field(default=None, description="Per-agent thinking-mode default (None = runtime default)")
    reasoning_effort: ReasoningEffort | None = Field(default=None, description="Per-agent reasoning-effort default (None = runtime default)")
    soul: str = Field(default="", description="SOUL.md content — agent personality and behavioral guardrails")
    max_turns: int | None = Field(default=None, description="Max LLM turns for this agent")
    timeout_seconds: int | None = Field(default=None, description="Execution timeout in seconds")
    disallowed_tools: list[str] | None = Field(default=None, description="Tools explicitly blocked for this agent")
    role: str = Field(default="worker", description="Orchestration role: orchestrator | worker | reviewer")


class AgentUpdateRequest(BaseModel):
    """Request body for updating a custom agent."""

    description: str | None = Field(default=None, description="Updated description")
    model: str | None = Field(default=None, description="Updated model override")
    tool_groups: list[str] | None = Field(default=None, description="Updated tool group whitelist")
    skills: list[str] | None = Field(default=None, description="Updated skill whitelist (None=all, []=none)")
    model_settings: AgentModelSettings | None = Field(default=None, description="Updated per-agent sampling overrides")
    thinking_enabled: bool | None = Field(default=None, description="Updated per-agent thinking-mode default")
    reasoning_effort: ReasoningEffort | None = Field(default=None, description="Updated per-agent reasoning-effort default")
    soul: str | None = Field(default=None, description="Updated SOUL.md content")
    max_turns: int | None = Field(default=None, description="Updated max LLM turns")
    timeout_seconds: int | None = Field(default=None, description="Updated execution timeout")
    disallowed_tools: list[str] | None = Field(default=None, description="Updated blocked tools")
    role: str | None = Field(default=None, description="Updated orchestration role")


def _validate_agent_name(name: str) -> None:
    """Validate agent name against allowed pattern.

    Args:
        name: The agent name to validate.

    Raises:
        HTTPException: 422 if the name is invalid.
    """
    if not AGENT_NAME_PATTERN.match(name):
        raise HTTPException(
            status_code=422,
            detail=f"Invalid agent name '{name}'. Must match ^[A-Za-z0-9-]+$ (letters, digits, and hyphens only).",
        )


def _normalize_agent_name(name: str) -> str:
    """Normalize agent name to lowercase for filesystem storage."""
    return name.lower()


def _require_agents_api_enabled() -> None:
    """Reject access unless the custom-agent management API is explicitly enabled."""
    if not get_agents_api_config().enabled:
        raise HTTPException(
            status_code=403,
            detail=("Custom-agent management API is disabled. Set agents_api.enabled=true to expose agent and user-profile routes over HTTP."),
        )


def _validate_model_exists(model: str | None) -> None:
    """Reject an agent ``model`` that is not a configured profile.

    Mirrors the ``update_agent`` harness tool: without this, an unknown model
    silently falls back to the default at runtime and the user sees confusing
    repeated warnings on every later turn instead of an actionable error here.
    ``None``/empty means "use the global default" and is always allowed.

    Best-effort: if the app config cannot be loaded (e.g. no ``config.yaml`` on
    disk in a bare/test deployment), skip the check rather than failing the
    write — the runtime still falls back to the default for an unknown model.
    """
    if not model:
        return
    try:
        app_config = get_app_config()
    except Exception:
        logger.warning("Could not load app config to validate agent model %r; skipping model existence check.", model)
        return
    if app_config.get_model_config(model) is None:
        raise HTTPException(status_code=422, detail=f"Unknown model '{model}'. Use a model name defined under `models:` in config.yaml.")


def _merge_model_settings_update(value: AgentModelSettings, existing: AgentModelSettings | None) -> dict:
    """Merge an explicit ``model_settings`` update with existing sub-fields.

    The top-level ``model_settings`` key is optional in update requests:
    omitted means "preserve the current block", while explicit ``null`` means
    "clear the block". Inside the block, omitted sub-fields should behave the
    same way. This lets API callers update only ``temperature`` without
    accidentally clearing an existing ``max_tokens``.
    """
    merged = existing.model_dump(exclude_none=True) if existing is not None else {}
    for field in value.model_fields_set:
        field_value = getattr(value, field)
        if field_value is None:
            merged.pop(field, None)
        else:
            merged[field] = field_value
    return merged


def _apply_model_behavior(config_data: dict, source: BaseModel, existing: AgentConfig | None = None) -> None:
    """Write the model-behavior fields (issue #4336) onto ``config_data``.

    Only fields explicitly set on ``source`` (``model_fields_set``) are taken
    from it; the rest fall back to ``existing`` (on update) so an omitted field
    is preserved rather than cleared. A resulting ``None`` is dropped so the
    persisted YAML stays minimal and "unset" round-trips cleanly.
    """
    for field in _MODEL_BEHAVIOR_FIELDS:
        if field in source.model_fields_set:
            value = getattr(source, field)
        else:
            value = getattr(existing, field, None) if existing is not None else None
        if value is None:
            continue
        if field == "model_settings" and isinstance(value, AgentModelSettings):
            dumped_settings = _merge_model_settings_update(value, existing.model_settings if existing is not None else None)
            if dumped_settings:
                config_data[field] = dumped_settings
            continue
        config_data[field] = value.model_dump(exclude_none=True) if isinstance(value, BaseModel) else value


def _agent_config_to_response(agent_cfg: AgentConfig, include_soul: bool = False, *, user_id: str | None = None) -> AgentResponse:
    """Convert AgentConfig to AgentResponse."""
    soul: str | None = None
    if include_soul:
        soul = load_agent_soul(agent_cfg.name, user_id=user_id) or ""

    return AgentResponse(
        name=agent_cfg.name,
        description=agent_cfg.description,
        model=agent_cfg.model,
        tool_groups=agent_cfg.tool_groups,
        skills=agent_cfg.skills,
        model_settings=agent_cfg.model_settings,
        thinking_enabled=agent_cfg.thinking_enabled,
        reasoning_effort=agent_cfg.reasoning_effort,
        soul=soul,
        max_turns=agent_cfg.max_turns,
        timeout_seconds=agent_cfg.timeout_seconds,
        disallowed_tools=agent_cfg.disallowed_tools,
        role=agent_cfg.role,
    )


@router.get(
    "/agents",
    response_model=AgentsListResponse,
    summary="List Custom Agents",
    description="List all custom agents available in the agents directory, including their soul content.",
)
async def list_agents() -> AgentsListResponse:
    """List all custom agents.

    Returns:
        List of all custom agents with their metadata and soul content.
    """
    _require_agents_api_enabled()

    user_id = get_effective_user_id()

    def _list() -> AgentsListResponse:
        # Worker thread: the store read plus the per-agent SOUL read inside
        # _agent_config_to_response are filesystem IO (file backend) or DB round
        # trips (db backend) and must stay off the event loop.
        agents = list_custom_agents(user_id=user_id)
        return AgentsListResponse(agents=[_agent_config_to_response(a, include_soul=True, user_id=user_id) for a in agents])

    try:
        return await asyncio.to_thread(_list)
    except Exception as e:
        logger.error(f"Failed to list agents: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list agents: {e!s}")


@router.get(
    "/agents/check",
    summary="Check Agent Name",
    description="Validate an agent name and check if it is available (case-insensitive).",
)
async def check_agent_name(name: str) -> dict:
    """Check whether an agent name is valid and not yet taken.

    Args:
        name: The agent name to check.

    Returns:
        ``{"available": true/false, "name": "<normalized>"}``

    Raises:
        HTTPException: 422 if the name is invalid.
    """
    _require_agents_api_enabled()
    _validate_agent_name(name)
    normalized = _normalize_agent_name(name)
    user_id = get_effective_user_id()
    # Availability is defined by the active backend and stays consistent with
    # create()'s conflict rule (file: per-user or legacy dir; db: a row). The
    # exists() probe is filesystem IO / a DB round trip, so keep it off the loop.
    exists = await asyncio.to_thread(get_agent_store().exists, normalized, user_id=user_id)
    return {"available": not exists, "name": normalized}


@router.get(
    "/agents/{name}",
    response_model=AgentResponse,
    summary="Get Custom Agent",
    description="Retrieve details and SOUL.md content for a specific custom agent.",
)
async def get_agent(name: str) -> AgentResponse:
    """Get a specific custom agent by name.

    Args:
        name: The agent name.

    Returns:
        Agent details including SOUL.md content.

    Raises:
        HTTPException: 404 if agent not found.
    """
    _require_agents_api_enabled()
    _validate_agent_name(name)
    name = _normalize_agent_name(name)
    user_id = get_effective_user_id()

    def _get() -> AgentResponse:
        # Worker thread: config read + SOUL read must stay off the event loop.
        agent_cfg = load_agent_config(name, user_id=user_id)
        return _agent_config_to_response(agent_cfg, include_soul=True, user_id=user_id)

    try:
        return await asyncio.to_thread(_get)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Agent '{name}' not found")
    except Exception as e:
        logger.error(f"Failed to get agent '{name}': {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get agent: {e!s}")


@router.post(
    "/agents",
    response_model=AgentResponse,
    status_code=201,
    summary="Create Custom Agent",
    description="Create a new custom agent with its config and SOUL.md.",
)
async def create_agent_endpoint(request: AgentCreateRequest) -> AgentResponse:
    """Create a new custom agent.

    Args:
        request: The agent creation request.

    Returns:
        The created agent details.

    Raises:
        HTTPException: 409 if agent already exists, 422 if name is invalid.
    """
    _require_agents_api_enabled()
    _validate_agent_name(request.name)
    _validate_model_exists(request.model)
    normalized_name = _normalize_agent_name(request.name)
    user_id = get_effective_user_id()

    # Config document — only the fields the caller set, matching the historical
    # writer (an omitted field stays absent rather than being materialized).
    config_data: dict = {"name": normalized_name}
    if request.description:
        config_data["description"] = request.description
    if request.tool_groups is not None:
        config_data["tool_groups"] = request.tool_groups
    if request.skills is not None:
        config_data["skills"] = request.skills
    # Orchestration fields (v2.0).
    if request.max_turns is not None:
        config_data["max_turns"] = request.max_turns
    if request.timeout_seconds is not None:
        config_data["timeout_seconds"] = request.timeout_seconds
    if request.disallowed_tools is not None:
        config_data["disallowed_tools"] = request.disallowed_tools
    if request.role and request.role != "worker":
        config_data["role"] = request.role
    # model / model_settings / thinking_enabled / reasoning_effort (issue #4336).
    _apply_model_behavior(config_data, request)

    store = get_agent_store()

    def _create_agent() -> AgentResponse:
        # Worker thread: existence checks + persistence (file IO or a DB round
        # trip) must stay off the event loop.
        store.create(normalized_name, config_data, request.soul, user_id=user_id)
        logger.info("Created agent '%s'", normalized_name)
        agent_cfg = load_agent_config(normalized_name, user_id=user_id)
        return _agent_config_to_response(agent_cfg, include_soul=True, user_id=user_id)

    try:
        return await asyncio.to_thread(_create_agent)
    except AgentExistsError:
        raise HTTPException(status_code=409, detail=f"Agent '{normalized_name}' already exists")
    except Exception as e:
        logger.error(f"Failed to create agent '{request.name}': {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create agent: {e!s}")


@router.put(
    "/agents/{name}",
    response_model=AgentResponse,
    summary="Update Custom Agent",
    description="Update an existing custom agent's config and/or SOUL.md.",
)
async def update_agent(name: str, request: AgentUpdateRequest) -> AgentResponse:
    """Update an existing custom agent.

    Args:
        name: The agent name.
        request: The update request (all fields optional).

    Returns:
        The updated agent details.

    Raises:
        HTTPException: 404 if agent not found.
    """
    _require_agents_api_enabled()
    _validate_agent_name(name)
    name = _normalize_agent_name(name)
    user_id = get_effective_user_id()

    try:
        agent_cfg = await asyncio.to_thread(load_agent_config, name, user_id=user_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Agent '{name}' not found")

    def _is_legacy_only_layout() -> bool:
        # Require config.yaml, not bare directory existence — a per-user agent
        # directory can exist containing only memory.json (written the first
        # time this user chats with a legacy shared agent, before this route
        # is ever called). Bare .exists() would miss that case and let this
        # fall through to a silent fork of a brand-new config.yaml/SOUL.md
        # into the memory-only directory instead of blocking (mirrors
        # resolve_agent_dir's guard, see #3390). The db backend has no legacy
        # shared layout, so this file-only guard is a no-op there. The .exists()
        # probes are filesystem IO, so they run off the event loop.
        paths = get_paths()
        agent_dir = paths.user_agent_dir(user_id, name)
        legacy_dir = paths.agent_dir(name)
        return not (agent_dir / "config.yaml").exists() and (legacy_dir / "config.yaml").exists()

    if await asyncio.to_thread(_is_legacy_only_layout):
        raise HTTPException(
            status_code=409,
            detail=(f"Agent '{name}' only exists in the legacy shared layout and is not scoped to a user. Run scripts/migrate_user_isolation.py to move legacy agents into the per-user layout before updating."),
        )

    if "model" in request.model_fields_set:
        _validate_model_exists(request.model)

    try:
        # Update config if any config fields changed
        # Use model_fields_set to distinguish "field omitted" from "explicitly set to null".
        # This is critical for skills where None means "inherit all" (not "don't change").
        fields_set = request.model_fields_set
        _ORCHESTRATION_FIELDS = {"max_turns", "timeout_seconds", "disallowed_tools", "role"}
        config_changed = bool(fields_set & ({"description", "tool_groups", "skills"} | set(_MODEL_BEHAVIOR_FIELDS) | _ORCHESTRATION_FIELDS))

        updated: dict | None = None
        if config_changed:
            updated = {
                "name": agent_cfg.name,
                "description": request.description if "description" in fields_set else agent_cfg.description,
            }

            new_tool_groups = request.tool_groups if "tool_groups" in fields_set else agent_cfg.tool_groups
            if new_tool_groups is not None:
                updated["tool_groups"] = new_tool_groups

            # skills: None = inherit all, [] = no skills, ["a","b"] = whitelist
            if "skills" in fields_set:
                new_skills = request.skills
            else:
                new_skills = agent_cfg.skills
            if new_skills is not None:
                updated["skills"] = new_skills

            # Orchestration fields: take explicitly-set request fields, else
            # preserve the existing value.
            for ofield in _ORCHESTRATION_FIELDS:
                if ofield in fields_set:
                    val = getattr(request, ofield)
                else:
                    val = getattr(agent_cfg, ofield, None)
                if val is not None and val != "worker":
                    updated[ofield] = val

            # model / model_settings / thinking_enabled / reasoning_effort:
            # take explicitly-set request fields, else preserve the existing
            # value (issue #4336).
            _apply_model_behavior(updated, request, existing=agent_cfg)

            # Carry forward every top-level AgentConfig field this route does
            # not manage (currently ``github:``, plus any future field added
            # to :class:`AgentConfig`). The harness ``update_agent`` tool uses
            # the same helper, so an operator editing the agent description
            # from the Web UI does not silently strip a hand-authored
            # ``github:`` binding — which would otherwise leave the next
            # webhook delivery unable to find the agent in the registry and
            # silently no-op.
            for key, value in preserve_non_managed_fields(agent_cfg).items():
                updated.setdefault(key, value)

        store = get_agent_store()
        # Persist config (when changed) and/or soul (when provided) off the
        # event loop. A no-change PATCH commits nothing and re-reads current state.
        if updated is not None or request.soul is not None:
            await asyncio.to_thread(store.update, name, updated, request.soul, user_id=user_id)

        logger.info(f"Updated agent '{name}'")

        def _refresh() -> AgentResponse:
            # Worker thread: re-read config + SOUL off the event loop.
            refreshed_cfg = load_agent_config(name, user_id=user_id)
            return _agent_config_to_response(refreshed_cfg, include_soul=True, user_id=user_id)

        return await asyncio.to_thread(_refresh)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update agent '{name}': {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update agent: {e!s}")


class UserProfileResponse(BaseModel):
    """Response model for the global user profile (USER.md)."""

    content: str | None = Field(default=None, description="USER.md content, or null if not yet created")


class UserProfileUpdateRequest(BaseModel):
    """Request body for setting the global user profile."""

    content: str = Field(default="", description="USER.md content — describes the user's background and preferences")


@router.get(
    "/user-profile",
    response_model=UserProfileResponse,
    summary="Get User Profile",
    description="Read the global USER.md file that is injected into all custom agents.",
)
async def get_user_profile() -> UserProfileResponse:
    """Return the current USER.md content.

    Returns:
        UserProfileResponse with content=None if USER.md does not exist yet.
    """
    _require_agents_api_enabled()

    try:
        user_md_path = get_paths().user_md_file
        if not user_md_path.exists():
            return UserProfileResponse(content=None)
        raw = user_md_path.read_text(encoding="utf-8").strip()
        return UserProfileResponse(content=raw or None)
    except Exception as e:
        logger.error(f"Failed to read user profile: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to read user profile: {e!s}")


@router.put(
    "/user-profile",
    response_model=UserProfileResponse,
    summary="Update User Profile",
    description="Write the global USER.md file that is injected into all custom agents.",
)
async def update_user_profile(request: UserProfileUpdateRequest) -> UserProfileResponse:
    """Create or overwrite the global USER.md.

    Args:
        request: The update request with the new USER.md content.

    Returns:
        UserProfileResponse with the saved content.
    """
    _require_agents_api_enabled()

    try:
        paths = get_paths()
        paths.base_dir.mkdir(parents=True, exist_ok=True)
        paths.user_md_file.write_text(request.content, encoding="utf-8")
        logger.info(f"Updated USER.md at {paths.user_md_file}")
        return UserProfileResponse(content=request.content or None)
    except Exception as e:
        logger.error(f"Failed to update user profile: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update user profile: {e!s}")


@router.delete(
    "/agents/{name}",
    status_code=204,
    summary="Delete Custom Agent",
    description="Delete a custom agent and all its files (config, SOUL.md, memory).",
)
async def delete_agent(name: str) -> None:
    """Delete a custom agent.

    Args:
        name: The agent name.

    Raises:
        HTTPException: 404 if no per-user copy exists; 409 if only a legacy
            shared copy exists (suggesting the migration script).
    """
    _require_agents_api_enabled()
    _validate_agent_name(name)
    name = _normalize_agent_name(name)
    user_id = get_effective_user_id()
    store = get_agent_store()

    try:
        # Off the event loop: file rmtree or a DB delete plus memory cleanup.
        outcome = await asyncio.to_thread(store.delete, name, user_id=user_id)
    except Exception as e:
        logger.error(f"Failed to delete agent '{name}': {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete agent: {e!s}")

    if outcome == "legacy":
        raise HTTPException(
            status_code=409,
            detail=(f"Agent '{name}' only exists in the legacy shared layout and is not scoped to a user. Run scripts/migrate_user_isolation.py to move legacy agents into the per-user layout before deleting."),
        )
    if outcome == "missing":
        raise HTTPException(status_code=404, detail=f"Agent '{name}' not found")
    if outcome == "not-custom-agent":
        raise HTTPException(
            status_code=409,
            detail=(f"Directory for '{name}' contains memory data but is not a custom agent because config.yaml is missing; it was preserved."),
        )

    logger.info(f"Deleted agent '{name}'")


# ── Orchestration integration ───────────────────────────────────────────────


class WorkerSpecResponse(BaseModel):
    """An agent projected onto the ``orchestration.workers`` schema.

    Lets the orchestration settings UI present a checkbox list of custom agents
    instead of asking the user to hand-write a JSON workers array. ``system_prompt``
    maps to the agent's SOUL.md, and ``tools`` maps to ``tool_groups``.
    """

    name: str
    description: str
    system_prompt: str | None = None
    tools: list[str] | None = None
    disallowed_tools: list[str] | None = None
    skills: list[str] | None = None
    model: str | None = None
    max_turns: int | None = None
    timeout_seconds: int | None = None
    role: str = "worker"


class WorkersListResponse(BaseModel):
    """Response for ``GET /api/agents/as-workers``."""

    workers: list[WorkerSpecResponse]


@router.get(
    "/agents/as-workers",
    response_model=WorkersListResponse,
    summary="List Agents as Orchestration Workers",
    description="Project all custom agents onto the orchestration ``workers`` schema so the UI can present a checkbox list instead of a JSON textarea.",
)
async def list_agents_as_workers() -> WorkersListResponse:
    """Return every custom agent as a ``WorkerSpec``-compatible dict.

    The mapping is:
    - ``AgentConfig.soul`` (SOUL.md) → ``WorkerSpec.system_prompt``
    - ``AgentConfig.tool_groups``      → ``WorkerSpec.tools``
    - ``AgentConfig.role``             → ``WorkerSpec.role``
    - ``max_turns`` / ``timeout_seconds`` / ``disallowed_tools`` / ``skills`` / ``model`` are forwarded verbatim.
    """
    _require_agents_api_enabled()

    user_id = get_effective_user_id()

    def _project() -> WorkersListResponse:
        agents = list_custom_agents(user_id=user_id)
        specs: list[WorkerSpecResponse] = []
        for a in agents:
            soul = load_agent_soul(a.name, user_id=user_id)
            specs.append(
                WorkerSpecResponse(
                    name=a.name,
                    description=a.description,
                    system_prompt=soul or None,
                    tools=a.tool_groups,
                    disallowed_tools=a.disallowed_tools,
                    skills=a.skills,
                    model=a.model,
                    max_turns=a.max_turns,
                    timeout_seconds=a.timeout_seconds,
                    role=a.role,
                )
            )
        return WorkersListResponse(workers=specs)

    try:
        return await asyncio.to_thread(_project)
    except Exception as e:
        logger.error(f"Failed to list agents as workers: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list agents as workers: {e!s}")


# ── AI-guided agent creation ────────────────────────────────────────────────


class AgentSuggestionRequest(BaseModel):
    """Request body for AI-guided agent configuration suggestions."""

    description: str = Field(..., min_length=3, max_length=2000, description="Natural-language description of the desired agent")
    model_name: str | None = Field(default=None, description="Optional model override for the suggestion LLM call")


class AgentSuggestionResponse(BaseModel):
    """AI-generated agent configuration suggestion."""

    name: str = Field(..., description="Suggested agent name (kebab-case)")
    description: str = Field(default="", description="One-sentence agent summary")
    soul: str = Field(default="", description="Full system prompt / SOUL.md content")
    tool_groups: list[str] = Field(default_factory=list)
    disallowed_tools: list[str] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    model: str | None = Field(default=None)
    thinking_enabled: bool | None = Field(default=None)
    reasoning_effort: ReasoningEffort | None = Field(default=None)
    max_turns: int | None = Field(default=None)
    timeout_seconds: int | None = Field(default=None)
    role: str = Field(default="worker")
    rationale: str = Field(default="", description="Brief explanation of the AI's configuration choices")


_SUGGEST_SYSTEM_INSTRUCTION = """\
You are an AI agent configuration designer. Based on the user's description, \
generate a complete agent configuration in JSON format.

Available tool groups (the agent can access tools in these groups):
{tool_groups_desc}

Available skills (pre-built workflows the agent can use):
{skills_desc}

Available models:
{models_desc}

Generate a JSON object with these fields:
- "name": kebab-case identifier (lowercase letters, digits, hyphens only)
- "description": one-sentence summary of what this agent does
- "soul": full system prompt / SOUL.md content. Write a comprehensive prompt \
  that defines the agent's role, capabilities, behavioral guidelines, output \
  format, and constraints. Use markdown with section headers.
- "tool_groups": array of tool group names this agent needs (subset of available)
- "disallowed_tools": tools to explicitly block (optional, usually empty)
- "skills": array of skill names relevant to this agent (subset of available, \
  empty array if none needed)
- "model": model name or null (null = inherit default). Choose based on task \
  complexity.
- "thinking_enabled": true if the agent needs extended reasoning, false or null otherwise
- "reasoning_effort": "low"/"medium"/"high" or null
- "max_turns": suggested max LLM turns (e.g. 50-200 depending on task complexity)
- "timeout_seconds": suggested timeout (e.g. 900-3600)
- "role": one of "worker", "orchestrator", or "reviewer". \
  Choose "worker" for most agents that independently execute tasks (research, \
  coding, data analysis). Choose "orchestrator" only when the user explicitly \
  describes a coordinator that dispatches tasks to other agents. Choose \
  "reviewer" only when the agent's primary purpose is to review/validate \
  other agents' output. Default to "worker" when uncertain.
- "rationale": brief explanation of your configuration choices

Respond with ONLY the JSON object, no markdown fences or extra text.\
"""


def _sanitize_suggested_name(raw: str) -> str:
    """Sanitize an AI-suggested agent name into ``^[a-z0-9-]+$`` form."""
    cleaned = raw.strip().lower()
    cleaned = re.sub(r"[^a-z0-9-]+", "-", cleaned)
    cleaned = re.sub(r"-+", "-", cleaned)
    cleaned = cleaned.strip("-")
    if not cleaned:
        cleaned = "new-agent"
    return cleaned


def _parse_suggestion_json(raw_text: str) -> dict[str, Any]:
    """Extract and parse the first JSON object from an LLM response."""
    text = llm_text.strip_think_blocks(raw_text)
    text = llm_text.strip_markdown_code_fence(text)
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON object found in LLM response")
    return json.loads(text[start : end + 1])


def _build_suggestion_prompt_context(config: AppConfig) -> tuple[str, str, str]:
    """Collect available tool groups, skills, and models for the system prompt."""
    # Tool groups
    group_names = [g.name for g in config.tool_groups]
    tool_groups_desc = "\n".join(f"- {g}" for g in group_names) or "- (none configured)"

    # Installed enabled skills (name + first-line description)
    user_id = get_effective_user_id()
    skills_desc = "- (none installed)"
    try:
        storage = get_or_new_user_skill_storage(user_id, app_config=config)
        installed_skills = storage.load_skills(enabled_only=True)
        if installed_skills:
            lines = []
            for s in installed_skills:
                first_line = (s.description or "").split("\n")[0].strip()
                lines.append(f"- {s.name}: {first_line}")
            skills_desc = "\n".join(lines)
    except Exception:
        logger.debug("Failed to load skills for suggestion prompt", exc_info=True)

    # Available models
    model_names = [m.name for m in config.models]
    models_desc = "\n".join(f"- {m}" for m in model_names) or "- (none configured)"

    return tool_groups_desc, skills_desc, models_desc


@router.post(
    "/agents/suggest",
    response_model=AgentSuggestionResponse,
    summary="Suggest Agent Configuration via AI",
    description="Generate a complete agent configuration suggestion from a natural-language description using the default LLM.",
)
async def suggest_agent_config(body: AgentSuggestionRequest) -> AgentSuggestionResponse:
    """Generate an agent configuration suggestion via AI.

    Args:
        body: The suggestion request with a natural-language description.

    Returns:
        AgentSuggestionResponse with all fields populated by the LLM.
    """
    _require_agents_api_enabled()

    config = get_app_config()

    # Collect context (tool groups, skills, models) off the event loop.
    tool_groups_desc, skills_desc, models_desc = await asyncio.to_thread(
        _build_suggestion_prompt_context, config
    )

    system_instruction = _SUGGEST_SYSTEM_INSTRUCTION.format(
        tool_groups_desc=tool_groups_desc,
        skills_desc=skills_desc,
        models_desc=models_desc,
    )
    user_content = f"User description:\n{body.description}\n\nGenerate the agent configuration JSON."

    try:
        raw = await run_oneshot_llm(
            system_instruction=system_instruction,
            user_content=user_content,
            run_name="suggest_agent_config",
            app_config=config,
            model_name=body.model_name,
        )
    except Exception as exc:
        logger.error("Agent suggestion LLM call failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=502, detail=f"AI generation failed: {exc!s}") from exc

    try:
        parsed = _parse_suggestion_json(raw)
    except (json.JSONDecodeError, ValueError) as exc:
        logger.error("Failed to parse agent suggestion JSON: %s\nRaw: %s", exc, raw[:500])
        raise HTTPException(status_code=502, detail="AI returned an unparseable response. Please try again.") from exc

    # ── Validate and sanitize fields ──────────────────────────────────────
    known_groups = {g.name for g in config.tool_groups}
    known_models = {m.name for m in config.models}

    # Load known skill names for filtering
    known_skill_names: set[str] = set()
    try:
        user_id = get_effective_user_id()
        installed = get_or_new_user_skill_storage(user_id, app_config=config).load_skills(enabled_only=True)
        known_skill_names = {s.name for s in installed}
    except Exception:
        logger.debug("Failed to load skills for suggestion filtering", exc_info=True)

    valid_roles = {"orchestrator", "worker", "reviewer"}

    raw_name = str(parsed.get("name", "")).strip()
    name = _sanitize_suggested_name(raw_name)

    raw_groups = parsed.get("tool_groups")
    tool_groups = [g for g in raw_groups if g in known_groups] if isinstance(raw_groups, list) else []

    raw_skills = parsed.get("skills")
    skills = [s for s in raw_skills if s in known_skill_names] if isinstance(raw_skills, list) else []

    raw_disallowed = parsed.get("disallowed_tools")
    disallowed_tools = [t for t in raw_disallowed if isinstance(t, str)] if isinstance(raw_disallowed, list) else []

    raw_model = parsed.get("model")
    model = raw_model if isinstance(raw_model, str) and raw_model in known_models else None

    raw_role = parsed.get("role")
    role = raw_role if isinstance(raw_role, str) and raw_role in valid_roles else "worker"

    thinking_enabled = parsed.get("thinking_enabled") if isinstance(parsed.get("thinking_enabled"), (bool, type(None))) else None

    raw_effort = parsed.get("reasoning_effort")
    reasoning_effort = raw_effort if raw_effort in ("low", "medium", "high") else None

    def _safe_int(key: str) -> int | None:
        val = parsed.get(key)
        if isinstance(val, (int, float)) and val > 0:
            return int(val)
        return None

    max_turns = _safe_int("max_turns")
    timeout_seconds = _safe_int("timeout_seconds")

    return AgentSuggestionResponse(
        name=name,
        description=str(parsed.get("description", "")).strip(),
        soul=str(parsed.get("soul", "")).strip(),
        tool_groups=tool_groups,
        disallowed_tools=disallowed_tools,
        skills=skills,
        model=model,
        thinking_enabled=thinking_enabled,
        reasoning_effort=reasoning_effort,
        max_turns=max_turns,
        timeout_seconds=timeout_seconds,
        role=role,
        rationale=str(parsed.get("rationale", "")).strip(),
    )
