import asyncio
import logging
import os
import tempfile
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from app.gateway.deps import get_config, require_admin_user
from app.gateway.path_utils import resolve_thread_virtual_path
from app.gateway.rate_limit import rate_limit
from qilin.agents.lead_agent.prompt import (
    clear_skills_system_prompt_cache,
    refresh_skills_system_prompt_cache_async,
    refresh_user_skills_system_prompt_cache_async,
)
from qilin.config.app_config import AppConfig
from qilin.config.extensions_config import (
    ExtensionsConfig,
    SkillStateConfig,
    atomic_write_extensions_config,
    extensions_config_write_lock,
    get_extensions_config,
    reload_extensions_config,
)
from qilin.runtime.user_context import get_effective_user_id
from qilin.skills import Skill
from qilin.skills.installer import (
    SkillAlreadyExistsError,
    SkillSecurityScanError,
    _is_code_file,
)
from qilin.skills.security_scanner import scan_skill_content
from qilin.skills.security_static_scanner import (
    StaticFinding,
    StaticScanBlockedError,
    StaticScannerError,
    enforce_static_scan,
)
from qilin.skills.storage import SkillStorage, get_or_new_user_skill_storage
from qilin.skills.types import SKILL_MD_FILE, SkillCategory

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["skills"])

_ADMIN_REQUIRED_DETAIL = "Admin privileges required to manage skills."


class SkillResponse(BaseModel):
    """Response model for skill information."""

    name: str = Field(..., description="Name of the skill")
    description: str = Field(..., description="Description of what the skill does")
    license: str | None = Field(None, description="License information")
    category: SkillCategory = Field(
        ..., description="Category of the skill (public, custom, or legacy)"
    )
    enabled: bool = Field(default=True, description="Whether this skill is enabled")
    editable: bool = Field(
        default=False,
        description="Whether this skill can be edited/deleted (true only for custom)",
    )


class SkillsListResponse(BaseModel):
    """Response model for listing all skills."""

    skills: list[SkillResponse]


class SkillUpdateRequest(BaseModel):
    """Request model for updating a skill."""

    enabled: bool = Field(..., description="Whether to enable or disable the skill")


class SkillInstallRequest(BaseModel):
    """Request model for installing a skill from a .skill file."""

    thread_id: str = Field(
        ..., description="The thread ID where the .skill file is located"
    )
    path: str = Field(
        ...,
        description="Virtual path to the .skill file (e.g., mnt/user-data/outputs/my-skill.skill)",
    )


class SkillInstallResponse(BaseModel):
    """Response model for skill installation."""

    success: bool = Field(..., description="Whether the installation was successful")
    skill_name: str = Field(..., description="Name of the installed skill")
    message: str = Field(..., description="Installation result message")


class SkillReloadResponse(BaseModel):
    """Response model for process-local skill cache invalidation."""

    success: bool = Field(..., description="Whether the skill caches were invalidated")
    scope: Literal["process"] = Field(
        ..., description="Reload scope; only the current Gateway process is affected"
    )
    message: str = Field(..., description="Human-readable reload status")


class CustomSkillContentResponse(SkillResponse):
    content: str = Field(..., description="Raw SKILL.md content")


class CustomSkillUpdateRequest(BaseModel):
    content: str = Field(..., description="Replacement SKILL.md content")


class CustomSkillHistoryResponse(BaseModel):
    history: list[dict]


class SkillRollbackRequest(BaseModel):
    history_index: int = Field(
        default=-1,
        description="History entry index to restore from, defaulting to the latest change.",
    )


def _skill_to_response(skill: Skill) -> SkillResponse:
    """Convert a Skill object to a SkillResponse."""
    return SkillResponse(
        name=skill.name,
        description=skill.description,
        license=skill.license,
        category=skill.category,
        enabled=skill.enabled,
        editable=skill.category == SkillCategory.CUSTOM,
    )


def _static_scan_http_detail(error: StaticScanBlockedError) -> dict:
    return {
        "message": str(error),
        "skill_name": error.skill_name,
        "findings": error.findings,
    }


async def _scan_static_skill_markdown_or_raise(
    skill_name: str, content: str, *, app_config: AppConfig
) -> list[StaticFinding]:
    def _scan_markdown() -> list[StaticFinding]:
        with tempfile.TemporaryDirectory() as tmp:
            skill_dir = Path(tmp) / skill_name
            skill_dir.mkdir(parents=True)
            (skill_dir / SKILL_MD_FILE).write_text(content, encoding="utf-8")
            return enforce_static_scan(
                skill_dir, skill_name=skill_name, app_config=app_config
            )

    try:
        return await asyncio.to_thread(_scan_markdown)
    except StaticScanBlockedError as e:
        raise HTTPException(status_code=400, detail=_static_scan_http_detail(e)) from e
    except StaticScannerError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Static security scan failed for skill '{skill_name}': {e}",
        ) from e


def _get_user_skill_storage(config: AppConfig) -> SkillStorage:
    """Return a user-scoped skill storage for custom skill operations.

    Uses the effective user_id from the request context (set by auth middleware).
    For public skill reads, the global singleton storage is still used.
    """
    return get_or_new_user_skill_storage(get_effective_user_id(), app_config=config)


@router.get(
    "/skills",
    response_model=SkillsListResponse,
    summary="List All Skills",
    description="Retrieve a list of all available skills from both public and custom directories.",
)
async def list_skills(config: AppConfig = Depends(get_config)) -> SkillsListResponse:
    try:
        # Use user-scoped storage: loads public (global) + custom (user-level + fallback)
        skills = _get_user_skill_storage(config).load_skills(enabled_only=False)
        return SkillsListResponse(
            skills=[_skill_to_response(skill) for skill in skills]
        )
    except Exception as e:
        logger.error(f"Failed to load skills: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to load skills: {e!s}")


@router.post(
    "/skills/install",
    response_model=SkillInstallResponse,
    summary="Install Skill",
    description="Install a skill from a .skill file (ZIP archive) located in the thread's user-data directory.",
    dependencies=[Depends(rate_limit)],
)
async def install_skill(
    request: Request, body: SkillInstallRequest, config: AppConfig = Depends(get_config)
) -> SkillInstallResponse:
    await require_admin_user(request, detail=_ADMIN_REQUIRED_DETAIL)
    try:
        skill_file_path = resolve_thread_virtual_path(body.thread_id, body.path)
        result = await _get_user_skill_storage(config).ainstall_skill_from_archive(
            skill_file_path
        )
        await refresh_user_skills_system_prompt_cache_async(get_effective_user_id())
        return SkillInstallResponse(**result)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except SkillAlreadyExistsError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except SkillSecurityScanError as e:
        if e.findings:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": str(e),
                    "skill_name": e.skill_name,
                    "findings": e.findings,
                },
            )
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to install skill: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to install skill: {e!s}")


# Maximum upload size for ``install-upload`` (512 MB — mirrors the hard
# limit enforced by ``safe_extract_skill_archive``).
_SKILL_UPLOAD_MAX_SIZE = 512 * 1024 * 1024


@router.post(
    "/skills/install-upload",
    response_model=SkillInstallResponse,
    summary="Install Skill from Upload",
    description="Install a skill from a directly-uploaded ``.skill`` or ``.zip`` archive (multipart). No thread context required.",
    dependencies=[Depends(rate_limit)],
)
async def install_skill_from_upload(
    request: Request,
    file: UploadFile = File(..., description="Skill archive (``.skill`` or ``.zip``)"),
    config: AppConfig = Depends(get_config),
) -> SkillInstallResponse:
    await require_admin_user(request, detail=_ADMIN_REQUIRED_DETAIL)

    original_name = file.filename or "upload.skill"
    suffix = Path(original_name).suffix.lower()
    if suffix not in {".skill", ".zip"}:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{suffix}'. Only .skill and .zip archives are accepted.",
        )

    # Write the upload to a temp file with a .skill suffix so the storage's
    # ``_prepare_skill_archive`` extension check passes unchanged. The
    # underlying format is identical (ZIP) — only the extension differs.
    tmp_fd, tmp_path_str = tempfile.mkstemp(suffix=".skill")
    tmp_path = Path(tmp_path_str)
    try:
        total = 0
        with os.fdopen(tmp_fd, "wb") as dst:
            while chunk := await file.read(65536):
                total += len(chunk)
                if total > _SKILL_UPLOAD_MAX_SIZE:
                    raise HTTPException(
                        status_code=413, detail="Skill archive is too large."
                    )
                dst.write(chunk)

        try:
            result = await _get_user_skill_storage(config).ainstall_skill_from_archive(
                tmp_path
            )
            await refresh_user_skills_system_prompt_cache_async(get_effective_user_id())
            return SkillInstallResponse(**result)
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except SkillAlreadyExistsError as e:
            raise HTTPException(status_code=409, detail=str(e))
        except SkillSecurityScanError as e:
            logger.warning(
                "Skill security scan failed during upload install: %s", e, exc_info=True
            )
            if e.findings:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "message": str(e),
                        "skill_name": e.skill_name,
                        "findings": e.findings,
                    },
                )
            raise HTTPException(status_code=400, detail=str(e))
        except ValueError as e:
            logger.warning(
                "Skill validation failed during upload install: %s", e, exc_info=True
            )
            raise HTTPException(status_code=400, detail=str(e))
        except HTTPException:
            raise
        except Exception as e:
            logger.error("Failed to install skill from upload: %s", e, exc_info=True)
            raise HTTPException(
                status_code=500, detail=f"Failed to install skill: {e!s}"
            )
    finally:
        try:
            tmp_path.unlink(missing_ok=True)  # noqa: ASYNC240 -- intentional sync temp-file cleanup in finally
        except OSError:
            pass


@router.post(
    "/skills/reload",
    response_model=SkillReloadResponse,
    summary="Reload Skills",
    description=(
        "Invalidate skill prompt caches for all users in the current Gateway process. Subsequent runs rescan the configured skill directories; running tasks and other Gateway processes are unaffected."
    ),
)
async def reload_skills(request: Request) -> SkillReloadResponse:
    """Invalidate process-local skill prompt caches after external file changes."""
    await require_admin_user(request, detail=_ADMIN_REQUIRED_DETAIL)
    try:
        await refresh_skills_system_prompt_cache_async()
    except Exception as exc:
        logger.exception("Failed to invalidate skills cache")
        raise HTTPException(
            status_code=500, detail="Failed to invalidate skills cache."
        ) from exc

    return SkillReloadResponse(
        success=True,
        scope="process",
        message="Skill caches invalidated; subsequent runs in this Gateway process will rescan the latest skills.",
    )


@router.get(
    "/skills/custom", response_model=SkillsListResponse, summary="List Custom Skills"
)
async def list_custom_skills(
    config: AppConfig = Depends(get_config),
) -> SkillsListResponse:
    """List only user-owned custom skills (SkillCategory.CUSTOM).

    Legacy shared skills (SkillCategory.LEGACY) are NOT included here —
    they are read-only and appear in the full ``list_skills`` endpoint.
    The frontend should use ``list_skills`` to display all available
    skills including legacy ones.
    """
    try:
        skills = [
            skill
            for skill in _get_user_skill_storage(config).load_skills(enabled_only=False)
            if skill.category == SkillCategory.CUSTOM
        ]
        return SkillsListResponse(
            skills=[_skill_to_response(skill) for skill in skills]
        )
    except Exception as e:
        logger.error("Failed to list custom skills: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Failed to list custom skills: {e!s}"
        )


@router.get(
    "/skills/custom/{skill_name}",
    response_model=CustomSkillContentResponse,
    summary="Get Custom Skill Content",
)
async def get_custom_skill(
    skill_name: str, request: Request, config: AppConfig = Depends(get_config)
) -> CustomSkillContentResponse:
    await require_admin_user(request, detail=_ADMIN_REQUIRED_DETAIL)
    return await _read_custom_skill_response(skill_name, config)


async def _read_custom_skill_response(
    skill_name: str, config: AppConfig
) -> CustomSkillContentResponse:
    try:
        skill_name = skill_name.replace("\r\n", "").replace("\n", "")
        storage = _get_user_skill_storage(config)
        skills = storage.load_skills(enabled_only=False)
        skill = next(
            (
                s
                for s in skills
                if s.name == skill_name and s.category == SkillCategory.CUSTOM
            ),
            None,
        )
        if skill is None:
            raise HTTPException(
                status_code=404, detail=f"Custom skill '{skill_name}' not found"
            )
        return CustomSkillContentResponse(
            **_skill_to_response(skill).model_dump(),
            content=storage.read_custom_skill(skill_name),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get custom skill %s: %s", skill_name, e, exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Failed to get custom skill: {e!s}"
        )


@router.put(
    "/skills/custom/{skill_name}",
    response_model=CustomSkillContentResponse,
    summary="Edit Custom Skill",
)
async def update_custom_skill(
    skill_name: str,
    body: CustomSkillUpdateRequest,
    request: Request,
    config: AppConfig = Depends(get_config),
) -> CustomSkillContentResponse:
    await require_admin_user(request, detail=_ADMIN_REQUIRED_DETAIL)
    try:
        skill_name = skill_name.replace("\r\n", "").replace("\n", "")
        storage = _get_user_skill_storage(config)
        storage.ensure_custom_skill_is_editable(skill_name)
        storage.validate_skill_markdown_content(skill_name, body.content)
        static_findings = await _scan_static_skill_markdown_or_raise(
            skill_name, body.content, app_config=config
        )
        scan = await scan_skill_content(
            body.content,
            executable=False,
            location=f"{skill_name}/{SKILL_MD_FILE}",
            app_config=config,
            static_findings=static_findings,
        )
        if scan.decision == "block":
            raise HTTPException(
                status_code=400, detail=f"Security scan blocked the edit: {scan.reason}"
            )
        prev_content = storage.read_custom_skill(skill_name)
        storage.write_custom_skill(skill_name, SKILL_MD_FILE, body.content)
        storage.append_history(
            skill_name,
            {
                "action": "human_edit",
                "author": "human",
                "thread_id": None,
                "file_path": SKILL_MD_FILE,
                "prev_content": prev_content,
                "new_content": body.content,
                "scanner": {
                    "decision": scan.decision,
                    "reason": scan.reason,
                    "static_findings": static_findings,
                },
            },
        )
        await refresh_user_skills_system_prompt_cache_async(get_effective_user_id())
        return await _read_custom_skill_response(skill_name, config)
    except HTTPException:
        raise
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(
            "Failed to update custom skill %s: %s", skill_name, e, exc_info=True
        )
        raise HTTPException(
            status_code=500, detail=f"Failed to update custom skill: {e!s}"
        )


# Per-file / per-request caps for support-file uploads. Support files are
# small companion assets (scripts, references, templates); 20 MB per file is
# generous and well below the 512 MB archive cap above.
_SUPPORT_FILE_MAX_SIZE = 20 * 1024 * 1024
_SUPPORT_FILE_TOTAL_MAX_SIZE = 64 * 1024 * 1024


@router.post(
    "/skills/custom/{skill_name}/support-files",
    response_model=CustomSkillContentResponse,
    summary="Upload Custom Skill Support Files",
    description=(
        "Upload one or more support files (scripts / references / templates / "
        "assets) into an existing custom skill. Text files go through the "
        "skill security scanner; ``scripts/`` uploads additionally require an "
        "explicit scanner ``allow`` (``warn`` is rejected). Binary files skip "
        "the LLM content scan."
    ),
    dependencies=[Depends(rate_limit)],
)
async def upload_custom_skill_support_files(
    skill_name: str,
    request: Request,
    files: list[UploadFile] = File(..., description="Support files to upload"),
    subdir: str = Form(..., description="Target support subdirectory"),
    config: AppConfig = Depends(get_config),
) -> CustomSkillContentResponse:
    await require_admin_user(request, detail=_ADMIN_REQUIRED_DETAIL)
    skill_name = skill_name.replace("\r\n", "").replace("\n", "")
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")
    if subdir not in {"references", "templates", "scripts", "assets"}:
        raise HTTPException(
            status_code=400,
            detail="subdir must be one of: assets, references, scripts, templates.",
        )
    storage = _get_user_skill_storage(config)
    try:
        storage.ensure_custom_skill_is_editable(skill_name)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Stage all uploads into a temp skill dir mirroring the target layout so
    # the scanners can inspect everything before anything is persisted; any
    # failure rejects the whole batch.
    staged: list[tuple[str, Path, bytes, bool]] = []  # (rel_path, path, data, llm_scanned)
    total_size = 0
    try:
        with tempfile.TemporaryDirectory() as tmp:
            stage_root = Path(tmp) / skill_name
            for file in files:
                original_name = Path(file.filename or "").name
                if not original_name or original_name in {".", ".."}:
                    raise HTTPException(
                        status_code=400, detail="Invalid support file name."
                    )
                relative_path = f"{subdir}/{original_name}"
                try:
                    # Defence in depth: subdir whitelist, traversal and
                    # containment are all enforced here.
                    storage.ensure_safe_support_path(skill_name, relative_path)
                except ValueError as e:
                    raise HTTPException(status_code=400, detail=str(e))
                data = await file.read()
                total_size += len(data)
                if len(data) > _SUPPORT_FILE_MAX_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail=f"Support file '{original_name}' is too large.",
                    )
                if total_size > _SUPPORT_FILE_TOTAL_MAX_SIZE:
                    raise HTTPException(
                        status_code=413, detail="Support file upload is too large."
                    )
                dest = stage_root / relative_path
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(data)
                staged.append((relative_path, dest, data, False))

            # Static scan first (mirrors the archive install flow); it also
            # covers binary payloads. Blocked findings reject the batch.
            static_findings: list[StaticFinding] = []
            try:
                static_findings = enforce_static_scan(
                    stage_root, skill_name=skill_name, app_config=config
                )
            except StaticScanBlockedError as e:
                raise HTTPException(
                    status_code=400, detail=_static_scan_http_detail(e)
                ) from e
            except StaticScannerError as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"Static security scan failed for skill '{skill_name}': {e}",
                ) from e

            # LLM content scan: UTF-8 text files only — binary uploads skip
            # it (content inspection is not meaningful there). Actual code
            # files get the executable scan policy; ``scripts/`` uploads must
            # be explicitly allowed by the scanner (``warn`` is rejected)
            # because of where they end up relative to execution.
            for index, (relative_path, path, _, _) in enumerate(staged):
                try:
                    content = path.read_text(encoding="utf-8")
                except UnicodeDecodeError:
                    continue  # binary file — keep llm_scanned=False
                executable = await _is_code_file(path, Path(relative_path))
                scan = await scan_skill_content(
                    content,
                    executable=executable,
                    location=f"{skill_name}/{relative_path}",
                    static_findings=(
                        [dict(f) for f in static_findings] if static_findings else None
                    ),
                )
                decision = getattr(scan, "decision", None)
                reason = str(getattr(scan, "reason", "") or "")
                if decision == "block" or (subdir == "scripts" and decision == "warn"):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Security scan blocked {skill_name}/{relative_path}: {reason}",
                    )
                rel, p, d, _ = staged[index]
                staged[index] = (rel, p, d, True)

            # All scans passed — persist and record history.
            for relative_path, _, data, llm_scanned in staged:
                storage.write_support_file(skill_name, relative_path, data)
                storage.append_history(
                    skill_name,
                    {
                        "action": "human_support_file_upload",
                        "author": "human",
                        "thread_id": None,
                        "file_path": relative_path,
                        "scanner": {
                            "content_scanned": llm_scanned,
                            "static_findings": static_findings,
                        },
                    },
                )
        await refresh_user_skills_system_prompt_cache_async(get_effective_user_id())
        return await _read_custom_skill_response(skill_name, config)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(
            "Failed to upload support files to custom skill %s: %s",
            skill_name,
            e,
            exc_info=True,
        )
        raise HTTPException(
            status_code=500, detail=f"Failed to upload support files: {e!s}"
        )


@router.delete("/skills/custom/{skill_name}", summary="Delete Custom Skill")
async def delete_custom_skill(
    skill_name: str, request: Request, config: AppConfig = Depends(get_config)
) -> dict[str, bool]:
    await require_admin_user(request, detail=_ADMIN_REQUIRED_DETAIL)
    try:
        skill_name = skill_name.replace("\r\n", "").replace("\n", "")
        storage = _get_user_skill_storage(config)
        storage.delete_custom_skill(
            skill_name,
            history_meta={
                "action": "human_delete",
                "author": "human",
                "thread_id": None,
                "file_path": SKILL_MD_FILE,
                "prev_content": None,
                "new_content": None,
                "scanner": {"decision": "allow", "reason": "Deletion requested."},
            },
        )
        await refresh_user_skills_system_prompt_cache_async(get_effective_user_id())
        return {"success": True}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(
            "Failed to delete custom skill %s: %s", skill_name, e, exc_info=True
        )
        raise HTTPException(
            status_code=500, detail=f"Failed to delete custom skill: {e!s}"
        )


@router.get(
    "/skills/custom/{skill_name}/history",
    response_model=CustomSkillHistoryResponse,
    summary="Get Custom Skill History",
)
async def get_custom_skill_history(
    skill_name: str, request: Request, config: AppConfig = Depends(get_config)
) -> CustomSkillHistoryResponse:
    await require_admin_user(request, detail=_ADMIN_REQUIRED_DETAIL)
    try:
        skill_name = skill_name.replace("\r\n", "").replace("\n", "")

        def _read_history() -> list[dict] | None:
            # Worker thread: storage construction, the existence probes, and the
            # history-file read are blocking filesystem IO that must stay off the
            # event loop. None signals 404 to the caller.
            storage = _get_user_skill_storage(config)
            if (
                not storage.custom_skill_exists(skill_name)
                and not storage.get_skill_history_file(skill_name).exists()
            ):
                return None
            return storage.read_history(skill_name)

        history = await asyncio.to_thread(_read_history)
        if history is None:
            raise HTTPException(
                status_code=404, detail=f"Custom skill '{skill_name}' not found"
            )
        return CustomSkillHistoryResponse(history=history)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to read history for %s: %s", skill_name, e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to read history: {e!s}")


@router.post(
    "/skills/custom/{skill_name}/rollback",
    response_model=CustomSkillContentResponse,
    summary="Rollback Custom Skill",
)
async def rollback_custom_skill(
    skill_name: str,
    body: SkillRollbackRequest,
    request: Request,
    config: AppConfig = Depends(get_config),
) -> CustomSkillContentResponse:
    await require_admin_user(request, detail=_ADMIN_REQUIRED_DETAIL)
    try:
        storage = _get_user_skill_storage(config)
        if (
            not storage.custom_skill_exists(skill_name)
            and not storage.get_skill_history_file(skill_name).exists()
        ):
            raise HTTPException(
                status_code=404, detail=f"Custom skill '{skill_name}' not found"
            )
        history = storage.read_history(skill_name)
        if not history:
            raise HTTPException(
                status_code=400, detail=f"Custom skill '{skill_name}' has no history"
            )
        record = history[body.history_index]
        target_content = record.get("prev_content")
        if target_content is None:
            raise HTTPException(
                status_code=400,
                detail="Selected history entry has no previous content to roll back to",
            )
        storage.validate_skill_markdown_content(skill_name, target_content)
        static_findings = await _scan_static_skill_markdown_or_raise(
            skill_name, target_content, app_config=config
        )
        scan = await scan_skill_content(
            target_content,
            executable=False,
            location=f"{skill_name}/{SKILL_MD_FILE}",
            app_config=config,
            static_findings=static_findings,
        )
        skill_file = storage.get_custom_skill_file(skill_name)
        current_content = (
            skill_file.read_text(encoding="utf-8") if skill_file.exists() else None
        )
        history_entry = {
            "action": "rollback",
            "author": "human",
            "thread_id": None,
            "file_path": SKILL_MD_FILE,
            "prev_content": current_content,
            "new_content": target_content,
            "rollback_from_ts": record.get("ts"),
            "scanner": {
                "decision": scan.decision,
                "reason": scan.reason,
                "static_findings": static_findings,
            },
        }
        if scan.decision == "block":
            storage.append_history(skill_name, history_entry)
            raise HTTPException(
                status_code=400,
                detail=f"Rollback blocked by security scanner: {scan.reason}",
            )
        storage.write_custom_skill(skill_name, SKILL_MD_FILE, target_content)
        storage.append_history(skill_name, history_entry)
        await refresh_user_skills_system_prompt_cache_async(get_effective_user_id())
        return await _read_custom_skill_response(skill_name, config)
    except HTTPException:
        raise
    except IndexError:
        raise HTTPException(status_code=400, detail="history_index is out of range")
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(
            "Failed to roll back custom skill %s: %s", skill_name, e, exc_info=True
        )
        raise HTTPException(
            status_code=500, detail=f"Failed to roll back custom skill: {e!s}"
        )


@router.get(
    "/skills/{skill_name}",
    response_model=SkillResponse,
    summary="Get Skill Details",
    description="Retrieve detailed information about a specific skill by its name.",
)
async def get_skill(
    skill_name: str, config: AppConfig = Depends(get_config)
) -> SkillResponse:
    try:
        skill_name = skill_name.replace("\r\n", "").replace("\n", "")
        skills = _get_user_skill_storage(config).load_skills(enabled_only=False)
        skill = next((s for s in skills if s.name == skill_name), None)

        if skill is None:
            raise HTTPException(
                status_code=404, detail=f"Skill '{skill_name}' not found"
            )

        return _skill_to_response(skill)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get skill {skill_name}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get skill: {e!s}")


def _write_extensions_skill_state(skill_name: str, enabled: bool) -> None:
    """Read-modify-write a skill's enabled state in the shared extensions_config.json.

    Blocking filesystem IO: always call this via ``asyncio.to_thread``. It takes
    ``extensions_config_write_lock`` itself, so that this router and the MCP
    router (which performs the same RMW on the same file) cannot interleave and
    drop each other's change. The lock is held by the worker rather than by the
    awaiting task, so cancelling the request cannot release it mid-write.
    """
    with extensions_config_write_lock:
        config_path = ExtensionsConfig.resolve_config_path()
        if config_path is None:
            config_path = Path.cwd().parent / "extensions_config.json"
            logger.info(
                f"No existing extensions config found. Creating new config at: {config_path}"
            )

        # Work on a deep copy rather than the cached singleton: mutating the
        # singleton in place would publish the new state to readers before it is
        # durable on disk, and leave it applied even if the write below fails.
        # to_file_dict() serializes the full extensions_config.json shape (all
        # top-level keys), so no field is dropped from the file.
        extensions_config = get_extensions_config().model_copy(deep=True)
        extensions_config.skills[skill_name] = SkillStateConfig(enabled=enabled)

        config_data = extensions_config.to_file_dict()

        atomic_write_extensions_config(config_path, config_data)

        logger.info(f"Skills configuration updated and saved to: {config_path}")
        reload_extensions_config()


@router.put(
    "/skills/{skill_name}",
    response_model=SkillResponse,
    summary="Update Skill",
    description="Update a skill's enabled status by modifying the extensions_config.json file.",
)
async def update_skill(
    skill_name: str,
    body: SkillUpdateRequest,
    request: Request,
    config: AppConfig = Depends(get_config),
) -> SkillResponse:
    # Enabling/disabling a skill writes the shared extensions_config.json and
    # refreshes the system prompt for every tenant, so it is a global mutation
    # (there is no per-user skill state). Guard it as admin-only like the other
    # global config writes, matching the MCP router.
    await require_admin_user(request, detail=_ADMIN_REQUIRED_DETAIL)
    try:
        skill_name = skill_name.replace("\r\n", "").replace("\n", "")

        def _load_storage_and_skills() -> tuple[SkillStorage, list[Skill]]:
            # Worker thread: storage construction and skill enumeration both walk
            # the filesystem.
            storage = _get_user_skill_storage(config)
            return storage, storage.load_skills(enabled_only=False)

        storage, skills = await asyncio.to_thread(_load_storage_and_skills)
        skill = next((s for s in skills if s.name == skill_name), None)

        if skill is None:
            raise HTTPException(
                status_code=404, detail=f"Skill '{skill_name}' not found"
            )

        # PUBLIC skills → global extensions_config.json (shared state).
        # CUSTOM / LEGACY skills → per-user _skill_states.json (isolated state)
        # so that two users with same-named custom skills can toggle independently.
        if skill.category == SkillCategory.PUBLIC:
            # Shared-file RMW. The worker takes extensions_config_write_lock for
            # the whole read→write window, so it stays serialized against the MCP
            # router even if this request is cancelled mid-write.
            await asyncio.to_thread(
                _write_extensions_skill_state, skill_name, body.enabled
            )
        else:
            # CUSTOM / LEGACY: write per-user state
            from qilin.skills.storage.user_scoped_skill_storage import (
                UserScopedSkillStorage,
            )

            if isinstance(storage, UserScopedSkillStorage):
                await asyncio.to_thread(
                    storage.set_skill_enabled_state, skill_name, body.enabled
                )
            else:
                # Fallback for non-user-scoped storage (unlikely in practice):
                # same shared-file RMW as the PUBLIC branch, same lock.
                await asyncio.to_thread(
                    _write_extensions_skill_state, skill_name, body.enabled
                )

        # PUBLIC skill enabled state lives in the global extensions_config.json
        # and affects every user, so the prompt cache for ALL users must be
        # invalidated. CUSTOM/LEGACY skill state is per-user so only that
        # user's cache needs to be dropped.
        if skill.category == SkillCategory.PUBLIC:
            # clear_skills_system_prompt_cache is sync; run it in a worker
            # thread to avoid blocking the event loop. The lock inside it is
            # cheap, but the async drop also keeps the test mock surface
            # consistent (tests patch the async variant).
            await asyncio.to_thread(clear_skills_system_prompt_cache)
        else:
            await refresh_user_skills_system_prompt_cache_async(get_effective_user_id())

        def _reload_skills() -> list[Skill]:
            return _get_user_skill_storage(config).load_skills(enabled_only=False)

        skills = await asyncio.to_thread(_reload_skills)
        updated_skill = next((s for s in skills if s.name == skill_name), None)

        if updated_skill is None:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to reload skill '{skill_name}' after update",
            )

        logger.info(f"Skill '{skill_name}' enabled status updated to {body.enabled}")
        return _skill_to_response(updated_skill)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update skill {skill_name}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update skill: {e!s}")
