"""Configuration read/write router.

Provides GET (full + section) and PUT (section) endpoints for config.yaml,
plus a POST /restart to trigger gateway self-restart (dev/web mode only).

Validation: each section payload is validated against the engine's pydantic
Config class before writing, so invalid configs cannot crash the engine on
hot-reload. Sensitive values (postgres_url etc.) are masked on GET.
"""

from __future__ import annotations

import importlib
import logging
import os
import threading
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ValidationError

from app.gateway.config_yaml_io import (
    mask_sensitive_value,
    read_config_yaml,
    resolve_config_path,
    write_config_yaml,
)
from app.gateway.deps import require_admin_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/config", tags=["config"])

_ADMIN_REQUIRED_DETAIL = "Admin privileges required to manage gateway configuration."

# Section name → engine pydantic Config class (lazy import to avoid pulling
# the full engine at module load). Keys match the config.yaml top-level
# section names that have a dedicated pydantic model. Note:
# - "uploads" is a free-form dict on AppConfig (no pydantic class); PUT is
#   not supported for it. Use the YAML editor for uploads tuning.
# - "cron_management" (legacy front-end section name) is not recognised by
#   the engine; the real section is "scheduler".
SECTION_MODELS: dict[str, str] = {
    "database": "qilin.config.database_config:DatabaseConfig",
    "run_events": "qilin.config.run_events_config:RunEventsConfig",
    "memory": "qilin.config.memory_config:MemoryConfig",
    "sandbox": "qilin.config.sandbox_config:SandboxConfig",
    "summarization": "qilin.config.summarization_config:SummarizationConfig",
    "title": "qilin.config.title_config:TitleConfig",
    "token_usage": "qilin.config.token_usage_config:TokenUsageConfig",
    "loop_detection": "qilin.config.loop_detection_config:LoopDetectionConfig",
    "scheduler": "qilin.config.scheduler_config:SchedulerConfig",
}

# Sensitive field paths to mask on GET (section → list of nested keys).
_SENSITIVE_PATHS: dict[str, list[list[str]]] = {
    "database": [["postgres_url"]],
    "memory": [["backend_config", "model", "api_key"]],
}


def _resolve_model(dotted: str) -> type[BaseModel]:
    """Resolve "module.path:ClassName" → class."""
    module_path, _, class_name = dotted.partition(":")
    module = importlib.import_module(module_path)
    return getattr(module, class_name)  # type: ignore[no-any-return]


def validate_section_payload(section: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Validate a section payload against the engine pydantic class.

    Returns model_dump (with defaults filled). Raises ValidationError on
    invalid input, KeyError if the section is not in SECTION_MODELS.
    """
    if section not in SECTION_MODELS:
        raise KeyError(f"Unknown config section: {section}")
    model_cls = _resolve_model(SECTION_MODELS[section])
    instance = model_cls(**payload)
    return _sanitize_for_yaml(instance.model_dump())


def _sanitize_for_yaml(value: Any) -> Any:
    """Recursively convert pydantic model_dump to yaml-safe structures."""
    if isinstance(value, dict):
        return {k: _sanitize_for_yaml(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_sanitize_for_yaml(v) for v in value]
    return value


def _mask_section(section: str, data: dict[str, Any]) -> dict[str, Any]:
    """Mask sensitive fields in a section for GET responses."""
    sensitive_paths = _SENSITIVE_PATHS.get(section, [])
    if not sensitive_paths:
        return data
    masked = dict(data)
    for path in sensitive_paths:
        current = masked
        for key in path[:-1]:
            if not isinstance(current.get(key), dict):
                current = None  # type: ignore[assignment]
                break
            current = current[key]
        if current is not None and path[-1] in current:
            current[path[-1]] = mask_sensitive_value(current[path[-1]])
    return masked


class ConfigFullResponse(BaseModel):
    config: dict[str, Any]


class ConfigSectionResponse(BaseModel):
    section: str
    data: Any


class ConfigSectionUpdate(BaseModel):
    data: Any


@router.get("", response_model=ConfigFullResponse)
async def get_full_config(request: Request) -> ConfigFullResponse:
    """Read the full config.yaml with sensitive values masked."""
    await require_admin_user(request, detail=_ADMIN_REQUIRED_DETAIL)
    data = read_config_yaml()
    if not isinstance(data, dict):
        return ConfigFullResponse(config={})
    masked_config = {
        k: _mask_section(k, v) if isinstance(v, dict) else v
        for k, v in data.items()
    }
    return ConfigFullResponse(config=masked_config)


@router.get("/{section}", response_model=ConfigSectionResponse)
async def get_config_section(section: str, request: Request) -> ConfigSectionResponse:
    """Read a single config section with sensitive values masked."""
    await require_admin_user(request, detail=_ADMIN_REQUIRED_DETAIL)
    data = read_config_yaml()
    if not isinstance(data, dict) or section not in data:
        # Return defaults by instantiating the model with no overrides.
        if section in SECTION_MODELS:
            model_cls = _resolve_model(SECTION_MODELS[section])
            defaults = _sanitize_for_yaml(model_cls().model_dump())
            return ConfigSectionResponse(section=section, data=defaults)
        raise HTTPException(
            status_code=404, detail=f"Config section '{section}' not found"
        )
    section_data = data[section]
    if not isinstance(section_data, dict):
        return ConfigSectionResponse(section=section, data=section_data)
    return ConfigSectionResponse(section=section, data=_mask_section(section, section_data))


@router.put("/{section}", response_model=ConfigSectionResponse)
async def put_config_section(
    section: str,
    body: ConfigSectionUpdate,
    request: Request,
) -> ConfigSectionResponse:
    """Write a single config section (validated + atomic)."""
    await require_admin_user(request, detail=_ADMIN_REQUIRED_DETAIL)
    if section not in SECTION_MODELS:
        raise HTTPException(
            status_code=404, detail=f"Config section '{section}' not writable"
        )
    payload = body.data if isinstance(body.data, dict) else {}
    try:
        validated = validate_section_payload(section, payload)
    except ValidationError as exc:
        errors = [
            {
                "field": ".".join(str(p) for p in err["loc"]),
                "message": err["msg"],
                "type": err["type"],
            }
            for err in exc.errors()
        ]
        raise HTTPException(
            status_code=400,
            detail={
                "code": "validation_failed",
                "message": f"{section} 配置校验失败",
                "errors": errors,
            },
        ) from exc

    config_path = resolve_config_path()
    data = read_config_yaml(config_path)
    if not isinstance(data, dict):
        data = {}  # type: ignore[assignment]
    data[section] = validated
    write_config_yaml(config_path, data)

    logger.info("Config section '%s' updated via admin API", section)
    return ConfigSectionResponse(section=section, data=_mask_section(section, validated))


@router.post("/restart")
async def restart_gateway_endpoint(request: Request) -> dict[str, str]:
    """Trigger gateway self-restart (dev/web mode; managed mode uses Electron IPC)."""
    await require_admin_user(request, detail=_ADMIN_REQUIRED_DETAIL)
    # Schedule exit on a background thread so the HTTP 200 response flushes first.
    def _exit_after_delay() -> None:
        import time

        time.sleep(0.5)
        logger.info("Gateway self-restarting via /api/config/restart")
        os._exit(0)

    threading.Thread(target=_exit_after_delay, daemon=True).start()
    return {"status": "restarting"}
