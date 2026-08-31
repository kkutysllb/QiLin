"""P0 audit fix: POST /api/skills/custom/{name}/support-files.

The frontend skill wizard (``core/skills/api.ts uploadSupportFiles``) calls
this endpoint; it never existed server-side, so the "from scripts" wizard
flow always failed with 404. These tests pin the implemented contract:
stage → static scan → content scan → persist, the backend subdir whitelist,
traversal rejection, and scan-block rollback (nothing is written).
"""

from __future__ import annotations

import os
from types import SimpleNamespace

# Importing app.gateway.* requires the internal auth token at module import.
os.environ.setdefault(
    "QILIN_INTERNAL_AUTH_TOKEN", "unit-test-secret-0123456789abcdef"
)

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

import app.gateway.routers.skills as skills_module
from qilin.config.paths import Paths
from qilin.skills.storage.user_scoped_skill_storage import (
    UserScopedSkillStorage,
)

SKILL_NAME = "test-skill"
SKILL_MD = "---\nname: test-skill\ndescription: test skill\n---\n\nhello\n"


async def _noop_async(*args, **kwargs):
    return None


def _fake_scan(decision: str):
    async def _scan(*args, **kwargs):
        return SimpleNamespace(decision=decision, reason="unit-test")

    return _scan


@pytest.fixture
def client(tmp_path, monkeypatch):
    home = tmp_path / ".qilin"
    home.mkdir()
    skills_root = tmp_path / "skills-root"
    skills_root.mkdir()
    monkeypatch.setattr("qilin.config.paths.get_paths", lambda: Paths(home))

    storage = UserScopedSkillStorage(
        user_id="user-a",
        host_path=str(skills_root),
        container_path=str(skills_root / "container"),
    )
    storage.write_custom_skill(SKILL_NAME, "SKILL.md", SKILL_MD)

    monkeypatch.setattr(
        skills_module, "_get_user_skill_storage", lambda config: storage
    )
    # Auth + prompt-cache side effects are out of scope here.
    monkeypatch.setattr(
        skills_module, "require_admin_user", _noop_async
    )
    monkeypatch.setattr(
        skills_module,
        "refresh_user_skills_system_prompt_cache_async",
        _noop_async,
    )
    # Static scanner: disabled in unit tests (covered by its own suite).
    monkeypatch.setattr(skills_module, "enforce_static_scan", lambda *a, **k: [])

    app = FastAPI()
    app.include_router(skills_module.router)
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _post(client: AsyncClient, *, subdir: str, files: list[tuple]):
    return await client.post(
        f"/api/skills/custom/{SKILL_NAME}/support-files",
        files=files,
        data={"subdir": subdir},
    )


async def test_upload_writes_text_and_binary_files(client, tmp_path, monkeypatch):
    async def allow_scan(*args, **kwargs):
        return SimpleNamespace(decision="allow", reason="ok")

    monkeypatch.setattr(skills_module, "scan_skill_content", allow_scan)
    async with client as c:
        response = await _post(
            c,
            subdir="references",
            files=[
                ("files", ("notes.txt", b"hello world", "text/plain")),
                ("files", ("asset.bin", b"\x00\xff\x01binary", "application/octet-stream")),
            ],
        )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["name"] == SKILL_NAME

    storage = skills_module._get_user_skill_storage(None)
    written_text = storage.get_custom_skill_dir(SKILL_NAME) / "references" / "notes.txt"
    written_bin = storage.get_custom_skill_dir(SKILL_NAME) / "references" / "asset.bin"
    assert written_text.read_text(encoding="utf-8") == "hello world"
    assert written_bin.read_bytes() == b"\x00\xff\x01binary"

    history = storage.read_history(SKILL_NAME)
    uploads = [h for h in history if h.get("action") == "human_support_file_upload"]
    assert {h["file_path"] for h in uploads} == {
        "references/notes.txt",
        "references/asset.bin",
    }
    scanned_flags = {h["file_path"]: h["scanner"]["content_scanned"] for h in uploads}
    assert scanned_flags["references/notes.txt"] is True
    assert scanned_flags["references/asset.bin"] is False


async def test_invalid_subdir_rejected(client):
    async with client as c:
        response = await _post(
            c,
            subdir="models",
            files=[("files", ("x.txt", b"data", "text/plain"))],
        )
    assert response.status_code == 400


async def test_traversal_subdir_rejected(client, tmp_path):
    async with client as c:
        response = await _post(
            c,
            subdir="..",
            files=[("files", ("evil.txt", b"data", "text/plain"))],
        )
    assert response.status_code == 400
    # Nothing escaped the skill directory.
    assert not (tmp_path / "evil.txt").exists()


async def test_scan_block_rejects_batch_without_writing(client, monkeypatch):
    monkeypatch.setattr(
        skills_module, "scan_skill_content", _fake_scan("block")
    )
    async with client as c:
        response = await _post(
            c,
            subdir="references",
            files=[("files", ("bad.txt", b"bad content", "text/plain"))],
        )
    assert response.status_code == 400
    storage = skills_module._get_user_skill_storage(None)
    target = storage.get_custom_skill_dir(SKILL_NAME) / "references" / "bad.txt"
    assert not target.exists()


async def test_scripts_subdir_rejects_warn_decision(client, monkeypatch):
    monkeypatch.setattr(
        skills_module, "scan_skill_content", _fake_scan("warn")
    )
    async with client as c:
        response = await _post(
            c,
            subdir="scripts",
            files=[("files", ("run.py", b"print('hi')", "text/x-python"))],
        )
    assert response.status_code == 400
    storage = skills_module._get_user_skill_storage(None)
    assert not (storage.get_custom_skill_dir(SKILL_NAME) / "scripts" / "run.py").exists()


async def test_missing_skill_returns_404(client):
    async with client as c:
        response = await c.post(
            "/api/skills/custom/no-such-skill/support-files",
            files=[("files", ("x.txt", b"data", "text/plain"))],
            data={"subdir": "references"},
        )
    assert response.status_code == 404
