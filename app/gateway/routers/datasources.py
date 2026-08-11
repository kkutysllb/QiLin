"""Datasource credentials management router.

Provides CRUD for financial data API credentials (Tushare, iWencai).
Credentials are persisted to the user data space ``.env`` file and
injected into ``os.environ`` so agent skill scripts and MCP servers can read
them via ``os.environ``.

Security:
  - Values are never returned in plaintext from GET; masked with ``***`` suffix.
  - PUT accepts masked values (``***``) as "unchanged".
  - The test endpoint resolves the actual value from env or file before testing.
"""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.gateway.deps import require_admin_user
from app.gateway.routers.models import _resolve_env_file_path

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/datasources", tags=["datasources"])

_ADMIN_REQUIRED_DETAIL = "Admin privileges required to manage datasource credentials."

_MASK_SUFFIX = "***"

# ── Datasource catalogue ────────────────────────────────────────────────

_DATASOURCES: list[dict[str, Any]] = [
    {
        "key": "TUSHARE_TOKEN",
        "display_name": "Tushare Pro",
        "description": "中国金融市场数据（A股、基金、债券等），tushare-data 技能依赖此凭证。",
        "secret": True,
        "placeholder": "输入 Tushare Pro Token",
        "test_method": "tushare",
    },
    {
        "key": "IWENCAI_API_KEY",
        "display_name": "问财（iWencai）",
        "description": "同花顺问财 OpenAPI 凭证（openapi.iwencai.com），用于自然语言选股、智能投研等。",
        "secret": True,
        "placeholder": "输入问财 API Key",
        "test_method": "iwencai",
    },
]

_DATASOURCE_KEYS = {ds["key"] for ds in _DATASOURCES}


# ── Response models ─────────────────────────────────────────────────────

class DatasourceItem(BaseModel):
    key: str
    display_name: str
    description: str
    configured: bool
    masked_value: str
    secret: bool
    placeholder: str | None = None
    test_method: str | None = None


class DatasourcesResponse(BaseModel):
    datasources: list[DatasourceItem]
    env_file: str


class DatasourceUpdateRequest(BaseModel):
    values: dict[str, str] = Field(default_factory=dict)


class DatasourceTestRequest(BaseModel):
    key: str
    value: str | None = None


class TestResult(BaseModel):
    success: bool
    message: str


class EnvKeyItem(BaseModel):
    """A single key from the user ``.env`` file (value never exposed)."""

    key: str
    configured: bool
    is_secret: bool


class EnvKeysResponse(BaseModel):
    """All keys defined in the user ``.env`` file."""

    keys: list[EnvKeyItem]
    env_file: str


# ── .env file helpers ───────────────────────────────────────────────────

def _mask_value(value: str | None) -> str:
    """Return a masked representation of *value*."""
    if not value:
        return ""
    return _MASK_SUFFIX


def _read_env_value(env_path: Path, key: str) -> str | None:
    """Read ``key`` from the ``.env`` file (not from os.environ)."""
    if not env_path.exists():
        return None
    pattern = re.compile(rf"^\s*(?:export\s+)?{re.escape(key)}\s*=\s*(.+?)\s*$", re.IGNORECASE)
    for line in env_path.read_text(encoding="utf-8").splitlines():
        m = pattern.match(line)
        if m:
            val = m.group(1).strip()
            # Strip surrounding quotes
            if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                val = val[1:-1]
            return val
    return None


def _write_env_value(env_path: Path, key: str, value: str) -> None:
    """Write ``key=value`` into ``.env``, preserving all other lines.

    Also exports into ``os.environ`` so the value is immediately available to
    skill scripts and MCP servers without a gateway restart.
    """
    env_path.parent.mkdir(parents=True, exist_ok=True)

    lines: list[str] = []
    if env_path.exists():
        lines = env_path.read_text(encoding="utf-8").splitlines()

    pattern = re.compile(rf"^\s*(?:export\s+)?{re.escape(key)}\s*=", re.IGNORECASE)
    new_line = f"{key}={value}"
    replaced = False
    for i, ln in enumerate(lines):
        if pattern.match(ln):
            lines[i] = new_line
            replaced = True
            break
    if not replaced:
        if lines and lines[-1].strip() != "":
            lines.append("")
        lines.append(new_line)

    tmp_path = env_path.with_suffix(env_path.suffix + ".tmp")
    tmp_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    tmp_path.replace(env_path)

    os.environ[key] = value


def _is_masked(v: str) -> bool:
    return v.endswith(_MASK_SUFFIX) or v == _MASK_SUFFIX


# Regex matching a ``KEY=value`` line (comments / blanks excluded).
_ENV_KEY_RE = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$")

# Heuristic: variable names that look like they hold a secret. Mirrors the
# ``*KEY*`` / ``*TOKEN*`` / ``*SECRET*`` / ``*PASS*`` scrub patterns in
# ``qilin.sandbox.env_policy`` so the UI flag is consistent with the sandbox.
_SECRET_RE = re.compile(r"(KEY|TOKEN|SECRET|PASS|CREDENTIAL)", re.IGNORECASE)


def _scan_env_keys(env_path: Path) -> list[str]:
    """Return every key defined in the ``.env`` file (values excluded)."""
    if not env_path.exists():
        return []
    keys: list[str] = []
    seen: set[str] = set()
    for line in env_path.read_text(encoding="utf-8").splitlines():
        m = _ENV_KEY_RE.match(line)
        if not m:
            continue
        key = m.group(1)
        value = m.group(2).strip()
        # Strip surrounding quotes to check if the value is non-empty.
        if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
            value = value[1:-1]
        if value and key not in seen:
            keys.append(key)
            seen.add(key)
    return keys


# ── Endpoints ───────────────────────────────────────────────────────────

@router.get("", response_model=DatasourcesResponse, summary="List Datasource Credentials")
@router.get("/", response_model=DatasourcesResponse, include_in_schema=False)
async def list_datasources(request: Request) -> DatasourcesResponse:
    """Return all configured datasource credentials with masked values."""
    await require_admin_user(request, detail=_ADMIN_REQUIRED_DETAIL)

    env_path = _resolve_env_file_path()
    items: list[DatasourceItem] = []
    for ds in _DATASOURCES:
        raw_value = _read_env_value(env_path, ds["key"]) or os.environ.get(ds["key"])
        items.append(
            DatasourceItem(
                key=ds["key"],
                display_name=ds["display_name"],
                description=ds["description"],
                configured=bool(raw_value),
                masked_value=_mask_value(raw_value),
                secret=ds["secret"],
                placeholder=ds.get("placeholder"),
                test_method=ds.get("test_method"),
            )
        )
    return DatasourcesResponse(datasources=items, env_file=str(env_path))


@router.put("", response_model=DatasourcesResponse, summary="Save Datasource Credentials")
@router.put("/", response_model=DatasourcesResponse, include_in_schema=False)
async def save_datasources(body: DatasourceUpdateRequest, request: Request) -> DatasourcesResponse:
    """Persist credential values to the user ``.env`` file.

    Masked values (``***``) are treated as "unchanged" and skipped.
    Empty strings remove the entry from ``.env`` (and from ``os.environ``).
    """
    await require_admin_user(request, detail=_ADMIN_REQUIRED_DETAIL)

    env_path = _resolve_env_file_path()

    for key, value in body.values.items():
        if key not in _DATASOURCE_KEYS:
            continue
        if _is_masked(value):
            continue  # unchanged
        stripped = value.strip()
        if stripped:
            _write_env_value(env_path, key, stripped)
        else:
            # Empty value — remove from env file
            if env_path.exists():
                lines = env_path.read_text(encoding="utf-8").splitlines()
                pattern = re.compile(rf"^\s*(?:export\s+)?{re.escape(key)}\s*=", re.IGNORECASE)
                new_lines = [ln for ln in lines if not pattern.match(ln)]
                tmp_path = env_path.with_suffix(env_path.suffix + ".tmp")
                tmp_path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
                tmp_path.replace(env_path)
            os.environ.pop(key, None)

    logger.info("Datasource credentials updated by admin")

    # Re-read and return masked state
    return await list_datasources(request)


@router.post("/test", response_model=TestResult, summary="Test Datasource Credential")
async def test_datasource(body: DatasourceTestRequest, request: Request) -> TestResult:
    """Test a datasource credential.

    If ``value`` is provided and not masked, it is used for testing without
    persisting. Otherwise the current ``.env`` value is used.
    """
    await require_admin_user(request, detail=_ADMIN_REQUIRED_DETAIL)

    if body.key not in _DATASOURCE_KEYS:
        raise HTTPException(status_code=404, detail=f"Unknown datasource key: {body.key}")

    env_path = _resolve_env_file_path()

    # Resolve the actual value to test
    if body.value and not _is_masked(body.value):
        test_value = body.value.strip()
    else:
        test_value = _read_env_value(env_path, body.key) or os.environ.get(body.key, "")

    if not test_value:
        return TestResult(success=False, message=f"{body.key} 未配置，请先填写凭证。")

    ds = next(d for d in _DATASOURCES if d["key"] == body.key)
    method = ds.get("test_method")

    if method == "tushare":
        return await _test_tushare(test_value)
    elif method == "iwencai":
        return await _test_iwencai(test_value)
    else:
        # For datasources without a specific test method, just verify the value exists
        return TestResult(success=True, message=f"{body.key} 凭证已配置。")


async def _test_tushare(token: str) -> TestResult:
    """Test Tushare Pro token by calling the API."""
    import httpx

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                "https://api.tushare.pro",
                json={"api_name": "trade_cal", "token": token, "params": {"limit": 1}},
            )
            if resp.status_code == 200:
                data = resp.json()
                if data.get("code") == 0:
                    return TestResult(success=True, message="Tushare Pro 连接成功。")
                msg = data.get("msg", "未知错误")
                return TestResult(success=False, message=f"Tushare 返回错误：{msg}")
            return TestResult(success=False, message=f"Tushare HTTP {resp.status_code}")
    except Exception as e:
        return TestResult(success=False, message=f"连接失败：{e}")


async def _test_iwencai(api_key: str) -> TestResult:
    """Test iWencai (同花顺问财) API key.

    Requires Authorization: Bearer + X-Claw headers (SkillHub 2.0 enforced).
    """
    import secrets

    import httpx

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                "https://openapi.iwencai.com/v1/comprehensive/search",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "X-Claw-Call-Type": "normal",
                    "X-Claw-Skill-Id": "report-search",
                    "X-Claw-Skill-Version": "2.0.0",
                    "X-Claw-Plugin-Id": "none",
                    "X-Claw-Plugin-Version": "none",
                    "X-Claw-Trace-Id": secrets.token_hex(32),
                },
                json={
                    "channels": ["report"],
                    "app_id": "AIME_SKILL",
                    "query": "上证指数",
                    "size": 1,
                },
            )
            if resp.status_code == 200:
                return TestResult(success=True, message="问财 API 连接成功。")
            if resp.status_code in (401, 403):
                return TestResult(success=False, message=f"认证失败（HTTP {resp.status_code}），请检查 API Key。")
            return TestResult(success=False, message=f"问财 API 返回 HTTP {resp.status_code}")
    except Exception as e:
        return TestResult(success=False, message=f"连接失败：{e}")


@router.get("/env-keys", response_model=EnvKeysResponse, summary="List .env Keys")
async def list_env_keys(request: Request) -> EnvKeysResponse:
    """Return every key defined in the user ``.env`` file.

    Values are never exposed — only the key name, whether it has a non-empty
    value (``configured``), and whether it looks like a secret (``is_secret``).
    The sandbox settings UI uses this to render the credential-passthrough
    toggle list.
    """
    await require_admin_user(request, detail=_ADMIN_REQUIRED_DETAIL)

    env_path = _resolve_env_file_path()
    raw_keys = _scan_env_keys(env_path)
    items: list[EnvKeyItem] = []
    for key in raw_keys:
        value = _read_env_value(env_path, key) or os.environ.get(key, "")
        items.append(
            EnvKeyItem(
                key=key,
                configured=bool(value),
                is_secret=bool(_SECRET_RE.search(key)),
            )
        )
    return EnvKeysResponse(keys=items, env_file=str(env_path))
