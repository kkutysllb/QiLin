"""H5-c skills port — gateway route tests (materialize / unregister)."""
import tempfile
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.gateway.internal_auth import create_internal_auth_headers


def _client() -> TestClient:
    import app.gateway.routers.ports as ports

    app = FastAPI()
    app.include_router(ports.router)
    return TestClient(app)


def setup_function(_) -> None:
    """Point the storage singleton at a throwaway host dir.

    An injected singleton without a config identity short-circuits
    ``get_app_config()`` — the sanctioned test seam documented in
    ``qilin/skills/storage/__init__.py``.
    """
    import qilin.skills.storage as storage_mod
    from qilin.skills.storage.local_skill_storage import LocalSkillStorage

    tmp = tempfile.mkdtemp(prefix="qilin-skills-port-")
    storage_mod._default_skill_storage = LocalSkillStorage(host_path=tmp)
    storage_mod._default_skill_storage_config = None


def teardown_function(_) -> None:
    from qilin.skills.storage import reset_skill_storage

    reset_skill_storage()


def _skill_dir(name: str) -> Path:
    from qilin.skills.storage import get_or_new_skill_storage

    return get_or_new_skill_storage().get_custom_skill_dir(name)


def test_router_requires_internal_token() -> None:
    client = _client()
    resp = client.post(
        "/api/ports/skills",
        json={"name": "x", "files": [{"path": "SKILL.md", "content": "hi"}]},
    )
    assert resp.status_code == 403
    resp = client.delete("/api/ports/skills/x")
    assert resp.status_code == 403


def test_register_materializes_files_and_upserts() -> None:
    client = _client()
    headers = create_internal_auth_headers()
    payload = {
        "name": "port-e2e-skill",
        "files": [
            {
                "path": "SKILL.md",
                "content": "---\nname: port-e2e-skill\n---\n\nbody\n",
            },
            {"path": "references/guide.md", "content": "guide text"},
        ],
    }
    resp = client.post("/api/ports/skills", headers=headers, json=payload)
    assert resp.status_code == 200
    assert resp.json() == {"ok": True, "name": "port-e2e-skill", "files": 2}

    skill_dir = _skill_dir("port-e2e-skill")
    assert (skill_dir / "SKILL.md").read_text(encoding="utf-8").endswith("body\n")
    assert (skill_dir / "references" / "guide.md").read_text(
        encoding="utf-8"
    ) == "guide text"

    # Upsert: a second registration with fewer files overwrites SKILL.md
    # but leaves already-written support files in place.
    resp = client.post(
        "/api/ports/skills",
        headers=headers,
        json={
            "name": "port-e2e-skill",
            "files": [
                {
                    "path": "SKILL.md",
                    "content": "---\nname: port-e2e-skill\n---\n\nbody v2\n",
                }
            ],
        },
    )
    assert resp.status_code == 200
    assert (skill_dir / "SKILL.md").read_text(encoding="utf-8").endswith("v2\n")
    assert (skill_dir / "references" / "guide.md").exists()


def test_register_rejects_unsupported_paths() -> None:
    client = _client()
    headers = create_internal_auth_headers()
    for bad_path in ("evil.txt", "../escape.md", "scripts/../evil.md"):
        resp = client.post(
            "/api/ports/skills",
            headers=headers,
            json={
                "name": "port-e2e-skill",
                "files": [{"path": bad_path, "content": "x"}],
            },
        )
        assert resp.status_code == 400, bad_path
        assert "unsupported file path" in resp.json()["detail"]


def test_unregister_roundtrip() -> None:
    client = _client()
    headers = create_internal_auth_headers()
    resp = client.post(
        "/api/ports/skills",
        headers=headers,
        json={"name": "port-e2e-skill", "files": [{"path": "SKILL.md", "content": "---\nname: port-e2e-skill\n---\n\nbody\n"}]},
    )
    assert resp.status_code == 200
    assert _skill_dir("port-e2e-skill").exists()

    deleted = client.delete("/api/ports/skills/port-e2e-skill", headers=headers)
    assert deleted.status_code == 200
    assert deleted.json()["removed"] is True
    assert not _skill_dir("port-e2e-skill").exists()

    again = client.delete("/api/ports/skills/port-e2e-skill", headers=headers)
    assert again.json()["removed"] is False
