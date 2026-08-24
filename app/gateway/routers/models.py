"""Models API router.

Provides CRUD endpoints for managing AI model configurations stored in the
``models:`` section of ``config.yaml``. Writes preserve comments and formatting
via ``ruamel.yaml``; ``reload_app_config()`` is called after each mutation so
the change takes effect on the next request without a process restart.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.gateway.config_yaml_io import read_config_yaml, write_config_yaml
from app.gateway.deps import get_config
from qilin.config.app_config import AppConfig, reload_app_config
from qilin.config.model_config import ModelConfig

router = APIRouter(prefix="/api", tags=["models"])


# ---------------------------------------------------------------------------
# Response / Request models
# ---------------------------------------------------------------------------


class ModelResponse(BaseModel):
    """Response model for model information."""

    name: str = Field(..., description="Unique identifier for the model")
    model: str = Field(..., description="Actual provider model identifier")
    use: str = Field(
        default="", description="Provider class path, e.g. langchain_openai.ChatOpenAI"
    )
    display_name: str | None = Field(None, description="Human-readable name")
    description: str | None = Field(None, description="Model description")
    api_key: str | None = Field(
        None, description="API key (env var reference or masked literal)"
    )
    base_url: str | None = Field(
        None, description="Endpoint URL (from base_url/api_base/api_url)"
    )
    endpoint_field: str | None = Field(
        None,
        description="YAML key that carries the endpoint (base_url/api_base/api_url)",
    )
    supports_thinking: bool = Field(
        default=False, description="Whether model supports thinking mode"
    )
    supports_reasoning_effort: bool = Field(
        default=False, description="Whether model supports reasoning effort"
    )
    supports_vision: bool = Field(
        default=False, description="Whether model supports vision/image inputs"
    )


class TokenUsageResponse(BaseModel):
    """Token usage display configuration."""

    enabled: bool = Field(
        default=False, description="Whether token usage display is enabled"
    )


class ModelsListResponse(BaseModel):
    """Response model for listing all models."""

    models: list[ModelResponse]
    token_usage: TokenUsageResponse


class ModelCreateRequest(BaseModel):
    """Request body for creating or updating a model.

    Extra fields are allowed (``extra="allow"``) so provider-specific options
    such as ``api_base``, ``max_tokens`` or ``temperature`` pass through to
    ``config.yaml`` untouched.
    """

    name: str = Field(..., description="Unique identifier for the model")
    display_name: str | None = Field(
        default=None, description="Display name for the model"
    )
    description: str | None = Field(
        default=None, description="Description for the model"
    )
    use: str = Field(..., description="Class path of the model provider")
    model: str = Field(..., description="Model name")
    api_key: str | None = Field(
        default=None, description="API key literal or $ENV_VAR reference"
    )
    base_url: str | None = Field(default=None, description="Endpoint URL")
    endpoint_field: str | None = Field(
        default=None,
        description="YAML key to store base_url under (e.g. 'api_base' for DeepSeek). Defaults to 'base_url'.",
    )
    supports_thinking: bool = Field(
        default=False, description="Whether the model supports thinking"
    )
    supports_vision: bool = Field(
        default=False, description="Whether the model supports vision/image inputs"
    )
    supports_reasoning_effort: bool = Field(
        default=False, description="Whether the model supports reasoning effort"
    )

    model_config = ConfigDict(extra="allow")


# ---------------------------------------------------------------------------
# Config file helpers (preserve comments via ruamel.yaml)
# ---------------------------------------------------------------------------

_ENDPOINT_FIELD_CANDIDATES = ("base_url", "api_base", "api_url", "openai_api_base")


def _env_var_name_for_model(model_name: str) -> str:
    """Derive a stable ``ENV_VAR`` name from a model identifier.

    Examples: ``minimax`` → ``MINIMAX_API_KEY``, ``claude-sonnet`` →
    ``CLAUDE_SONNET_API_KEY``, ``deepseek-chat`` → ``DEEPSEEK_CHAT_API_KEY``.
    Only used when the caller submits a literal key; ``$VAR`` references
    pass through untouched.
    """
    sanitized = re.sub(r"[^A-Za-z0-9_]", "_", model_name.strip()).upper()
    sanitized = re.sub(r"_+", "_", sanitized).strip("_")
    if not sanitized:
        sanitized = "MODEL"
    return f"{sanitized}_API_KEY"


def _resolve_env_file_path() -> Path:
    """Return the ``.env`` path the desktop shell manages.

    Mirrors ``desktop/src/paths.ts::getSkillModelsEnvPath`` so keys written
    here are picked up by the desktop ``loadSkillModelsEnv()`` injector on
    the next gateway restart. Falls back to ``~/.kworks/.env`` when
    ``QILIN_HOME`` is unset (non-desktop harness).
    """
    home = os.environ.get("QILIN_HOME")
    if home:
        return Path(home) / ".env"
    return Path.home() / ".kworks" / ".env"


def _persist_api_key_to_env(env_var: str, plaintext: str) -> None:
    """Write ``env_var=plaintext`` into ``.env``, preserving all other lines.

    Atomic write via ``.tmp`` + ``replace``. The value is also exported into
    the current process's ``os.environ`` so ``reload_app_config`` can resolve
    the ``$env_var`` reference without a gateway restart — otherwise
    ``AppConfig.resolve_env_variables`` raises ``ValueError`` on the missing
    var and the gateway crashes on the next config read.
    """
    env_path = _resolve_env_file_path()
    env_path.parent.mkdir(parents=True, exist_ok=True)

    lines: list[str] = []
    if env_path.exists():
        lines = env_path.read_text(encoding="utf-8").splitlines()

    pattern = re.compile(rf"^\s*(?:export\s+)?{re.escape(env_var)}\s*=", re.IGNORECASE)
    new_line = f"{env_var}={plaintext}"
    replaced = False
    for i, ln in enumerate(lines):
        if pattern.match(ln):
            lines[i] = new_line
            replaced = True
            break
    if not replaced:
        # Separate the new key from the preceding content with a blank line
        # when the file is non-empty and doesn't already end with one.
        if lines and lines[-1].strip() != "":
            lines.append("")
        lines.append(new_line)

    tmp_path = env_path.with_suffix(env_path.suffix + ".tmp")
    tmp_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    tmp_path.replace(env_path)

    os.environ[env_var] = plaintext


def _materialize_api_key(
    req: ModelCreateRequest, existing_key: str | None = None
) -> None:
    """Convert a literal ``api_key`` on the request into a ``$ENV_VAR`` ref.

    - ``$VAR`` references pass through untouched.
    - ``"***"`` is the masked placeholder the GET endpoints return for
      plaintext keys; it means "unchanged" — restore ``existing_key`` and
      re-run so a legacy plaintext also gets migrated to ``.env`` on save.
    - ``None`` / blank means "not provided"; the YAML serialiser drops it.
    - Any other value is a plaintext secret: persist to ``.env`` and replace
      with ``$ENV_VAR``.
    """
    key = (req.api_key or "").strip()
    if not key:
        return
    if key.startswith("$"):
        return
    if key == "***":
        if not existing_key:
            # No prior value to restore — drop the field entirely.
            req.api_key = None
            return
        restored = str(existing_key).strip()
        if not restored or restored.startswith("$"):
            req.api_key = existing_key
            return
        # Legacy plaintext on disk — migrate it now.
        key = restored
    env_var = _env_var_name_for_model(req.name)
    _persist_api_key_to_env(env_var, key)
    req.api_key = f"${env_var}"


def _mask_api_key(value: Any) -> str | None:
    """Mask ``api_key`` if it looks like a literal secret.

    Values starting with ``$`` are treated as environment-variable references
    and returned as-is (they are safe to expose). Everything else is replaced
    with ``"***"`` so literal secrets never leak through the API.
    """
    if value is None:
        return None
    text = str(value).strip()
    if text == "":
        return None
    if text.startswith("$"):
        return text
    return "***"


def _extract_endpoint_info(extra: dict[str, Any]) -> tuple[str | None, str | None]:
    """Return ``(endpoint_value, endpoint_field_name)`` from common field names.

    Scans ``_ENDPOINT_FIELD_CANDIDATES`` in order and returns the first non-empty
    match, along with the YAML key it was found under (so the editor can write
    it back under the same key).
    """
    for field_name in _ENDPOINT_FIELD_CANDIDATES:
        val = extra.get(field_name)
        if val is not None and str(val).strip() != "":
            return str(val), field_name
    return None, None


def _read_config_yaml() -> tuple[Path, Any]:
    """Read ``config.yaml`` as a ruamel structure (preserves comments)."""
    config_path = AppConfig.resolve_config_path(None)
    return config_path, read_config_yaml(config_path)


def _write_config_yaml(config_path: Path, data: Any) -> None:
    """Write the ruamel structure back to ``config.yaml`` atomically."""
    write_config_yaml(config_path, data)


def _request_to_dict(req: ModelCreateRequest) -> dict[str, Any]:
    """Serialise a ``ModelCreateRequest`` to a config.yaml-ready dict.

    Drops ``None`` / empty values so the written YAML stays clean. Any extra
    fields (``extra="allow"``) are appended after the canonical core fields.
    """
    result: dict[str, Any] = {}
    core_keys = (
        "name",
        "display_name",
        "description",
        "use",
        "model",
        "base_url",
        "api_key",
        "supports_thinking",
        "supports_vision",
        "supports_reasoning_effort",
    )
    dump = req.model_dump(exclude_none=True)
    for key in core_keys:
        if key in dump:
            result[key] = dump[key]
    # endpoint_field overrides the YAML key for base_url. Pop base_url from the
    # result and re-key it, so DeepSeek writes ``api_base:`` instead of ``base_url:``.
    skip_keys: set[str] = set()
    endpoint_field = dump.get("endpoint_field")
    if endpoint_field and endpoint_field != "base_url" and "base_url" in result:
        result[endpoint_field] = result.pop("base_url")
        skip_keys.add("base_url")  # don't let the extras loop re-add it
    # Include any remaining extra fields not covered above.
    for key, value in dump.items():
        if key not in result and key != "endpoint_field" and key not in skip_keys:
            result[key] = value
    return result


def _model_config_to_response(model: ModelConfig) -> ModelResponse:
    """Build a ``ModelResponse`` from a ``ModelConfig``, masking secrets."""
    extra = model.__pydantic_extra__ or {}
    endpoint_value, endpoint_field = _extract_endpoint_info(extra)
    return ModelResponse(
        name=model.name,
        model=model.model,
        use=model.use,
        display_name=model.display_name,
        description=model.description,
        api_key=_mask_api_key(extra.get("api_key")),
        base_url=endpoint_value,
        endpoint_field=endpoint_field,
        supports_thinking=model.supports_thinking,
        supports_reasoning_effort=model.supports_reasoning_effort,
        supports_vision=model.supports_vision,
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get(
    "/models",
    response_model=ModelsListResponse,
    summary="List All Models",
    description="Retrieve a list of all available AI models configured in the system.",
)
async def list_models(config: AppConfig = Depends(get_config)) -> ModelsListResponse:
    """List all available models from configuration."""
    models = [_model_config_to_response(model) for model in config.models]
    return ModelsListResponse(
        models=models,
        token_usage=TokenUsageResponse(enabled=config.token_usage.enabled),
    )


@router.get(
    "/models/{model_name}",
    response_model=ModelResponse,
    summary="Get Model Details",
    description="Retrieve detailed information about a specific AI model by its name.",
)
async def get_model(
    model_name: str, config: AppConfig = Depends(get_config)
) -> ModelResponse:
    """Get a specific model by name. Raises 404 if not found."""
    model = config.get_model_config(model_name)
    if model is None:
        raise HTTPException(status_code=404, detail=f"Model '{model_name}' not found")
    return _model_config_to_response(model)


@router.post(
    "/models",
    response_model=ModelResponse,
    status_code=201,
    summary="Create Model",
    description="Add a new model entry to the `models:` section of config.yaml.",
)
async def create_model(
    req: ModelCreateRequest, config: AppConfig = Depends(get_config)
) -> ModelResponse:
    """Create a new model in config.yaml.

    Raises 409 if a model with the same name already exists.
    """
    if config.get_model_config(req.name) is not None:
        raise HTTPException(
            status_code=409, detail=f"Model '{req.name}' already exists"
        )

    # Persist any literal api_key to ~/.kworks/.env and replace it with a
    # $ENV_VAR reference before serialising to config.yaml, so secrets never
    # land on disk in plaintext. Also updates os.environ so the subsequent
    # reload_app_config() can resolve the reference without a restart.
    _materialize_api_key(req)

    config_path, data = _read_config_yaml()
    models_section = data.get("models")
    if models_section is None:
        data["models"] = []
        models_section = data["models"]
    elif not isinstance(models_section, list):
        raise HTTPException(
            status_code=500, detail="config.yaml `models:` section is not a list"
        )

    models_section.append(_request_to_dict(req))
    _write_config_yaml(config_path, data)
    reload_app_config()

    new_config = get_config()
    created = new_config.get_model_config(req.name)
    if created is None:
        raise HTTPException(
            status_code=500,
            detail="Model was written but could not be re-read from config",
        )
    return _model_config_to_response(created)


@router.put(
    "/models/{model_name}",
    response_model=ModelResponse,
    summary="Update Model",
    description="Replace an existing model entry in config.yaml.",
)
async def update_model(
    model_name: str,
    req: ModelCreateRequest,
    config: AppConfig = Depends(get_config),
) -> ModelResponse:
    """Replace an existing model. Raises 404 if not found.

    The ``name`` in the request body may differ from ``model_name`` in the path,
    allowing renames — but the new name must not collide with another model.
    """
    existing = config.get_model_config(model_name)
    if existing is None:
        raise HTTPException(status_code=404, detail=f"Model '{model_name}' not found")

    # If renaming, ensure the new name is not already taken by a different entry.
    if req.name != model_name and config.get_model_config(req.name) is not None:
        raise HTTPException(
            status_code=409, detail=f"Model '{req.name}' already exists"
        )

    # Same plaintext→$ENV_VAR migration as create_model. Pass the existing
    # key so the masked placeholder ("***") the UI sends back for an
    # unchanged secret is restored rather than treated as a new literal.
    existing_extra = existing.__pydantic_extra__ or {}
    _materialize_api_key(req, existing_key=existing_extra.get("api_key"))

    config_path, data = _read_config_yaml()
    models_section = data.get("models")
    if not isinstance(models_section, list):
        raise HTTPException(
            status_code=500, detail="config.yaml `models:` section is not a list"
        )

    new_dict = _request_to_dict(req)
    found = False
    for i, entry in enumerate(models_section):
        if isinstance(entry, dict) and entry.get("name") == model_name:
            models_section[i] = new_dict
            found = True
            break
    if not found:
        raise HTTPException(
            status_code=404, detail=f"Model '{model_name}' not found in config.yaml"
        )

    _write_config_yaml(config_path, data)
    reload_app_config()

    new_config = get_config()
    updated = new_config.get_model_config(req.name)
    if updated is None:
        raise HTTPException(
            status_code=500,
            detail="Model was updated but could not be re-read from config",
        )
    return _model_config_to_response(updated)


@router.delete(
    "/models/{model_name}",
    status_code=204,
    summary="Delete Model",
    description="Remove a model entry from config.yaml.",
)
async def delete_model(
    model_name: str, config: AppConfig = Depends(get_config)
) -> None:
    """Delete a model from config.yaml. Raises 404 if not found."""
    if config.get_model_config(model_name) is None:
        raise HTTPException(status_code=404, detail=f"Model '{model_name}' not found")

    config_path, data = _read_config_yaml()
    models_section = data.get("models")
    if not isinstance(models_section, list):
        raise HTTPException(
            status_code=500, detail="config.yaml `models:` section is not a list"
        )

    original_len = len(models_section)
    models_section[:] = [
        entry
        for entry in models_section
        if not (isinstance(entry, dict) and entry.get("name") == model_name)
    ]
    if len(models_section) == original_len:
        raise HTTPException(
            status_code=404, detail=f"Model '{model_name}' not found in config.yaml"
        )

    _write_config_yaml(config_path, data)
    reload_app_config()
