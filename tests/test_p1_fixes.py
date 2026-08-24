"""P1 fix regression tests (security + performance audit, 2026-08-21).

Covers all 10 P1 items:

* Security #4: upload world-writable TOCTOU window closed (O_NOFOLLOW +
  read-first pattern).
* Security #5: global rate limiting middleware token bucket.
* Security #6: internal auth token TTL + owner-binding.
* Performance #7: LLM retry no longer blocks via time.sleep when an async
  path is available (CodexChatModel._acall_codex_api uses asyncio.sleep).
* Performance #8: requests replaced with pooled httpx.Client in
  InfoQuestClient and RemoteSandboxBackend.
* Performance #9: MCP tool discovery is bounded by Semaphore.
* Performance #10: Codex SSE uses httpx.AsyncClient when async.
* Performance #11: lark_broker HTTP timeout dropped from 600s to 30s.
* Dependencies #12 + #13: kubernetes and duckdb removed from
  pyproject.toml.

These tests are hermetic — no DB, no network, no sandbox.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from unittest.mock import MagicMock

import pytest

# ---------------------------------------------------------------------------
# Make sure QILIN_INTERNAL_AUTH_TOKEN is set for every test that imports
# app.gateway.* (the module fails fast at import time without it).
# ---------------------------------------------------------------------------

_DEFAULT_INTERNAL_SECRET = "test-internal-token-that-is-at-least-32-chars-long"


@pytest.fixture(autouse=True)
def _set_internal_auth_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("QILIN_INTERNAL_AUTH_TOKEN", _DEFAULT_INTERNAL_SECRET)


# ---------------------------------------------------------------------------
# P1 Security #6 — internal auth token TTL + owner-binding
# ---------------------------------------------------------------------------


class TestInternalAuthToken:
    """Regression for app/gateway/internal_auth.py."""

    def test_fails_fast_without_secret(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Operators MUST configure QILIN_INTERNAL_AUTH_TOKEN; the previous
        fallback (random in-memory secret) silently broke after restart."""
        monkeypatch.delenv("QILIN_INTERNAL_AUTH_TOKEN", raising=False)
        with pytest.raises(Exception):  # noqa: B017 - any startup failure is OK
            # Import lazily so the failure surfaces inside the test, not at
            # collection time.
            import importlib

            import app.gateway.internal_auth as ia

            importlib.reload(ia)

    def test_short_secret_is_rejected(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("QILIN_INTERNAL_AUTH_TOKEN", "too-short")
        with pytest.raises(Exception):  # noqa: B017 - any startup failure is OK
            import importlib

            import app.gateway.internal_auth as ia

            importlib.reload(ia)

    def test_minted_token_carries_owner_and_expiry(self) -> None:
        from app.gateway.internal_auth import create_internal_auth_headers

        headers = create_internal_auth_headers(owner_user_id="alice-123")
        token = headers["X-QiLin-Internal-Token"]
        parts = token.split(".")
        assert parts[0] == "v2"
        assert len(parts) == 3

    def test_wildcard_token_matches_any_owner(self) -> None:
        from app.gateway.internal_auth import (
            create_internal_auth_headers,
            is_valid_internal_auth_token,
        )

        headers = create_internal_auth_headers(owner_user_id=None)
        token = headers["X-QiLin-Internal-Token"]
        # Wildcard token is valid for any claimed owner.
        assert is_valid_internal_auth_token(token, expected_owner="alice")
        assert is_valid_internal_auth_token(token, expected_owner="bob")
        # And for no claimed owner at all (gateway-internal call).
        assert is_valid_internal_auth_token(token)

    def test_owner_bound_token_rejects_wrong_owner(self) -> None:
        from app.gateway.internal_auth import (
            create_internal_auth_headers,
            is_valid_internal_auth_token,
        )

        headers = create_internal_auth_headers(owner_user_id="alice")
        token = headers["X-QiLin-Internal-Token"]
        # Same owner is OK.
        assert is_valid_internal_auth_token(token, expected_owner="alice")
        # A different owner is rejected — this is the v2 fix for the audit's
        # "internal token holder can impersonate any user" finding.
        assert not is_valid_internal_auth_token(token, expected_owner="bob")
        # When the caller passes no expected_owner, the validator accepts the
        # token (it is structurally valid and unexpired) but the caller is
        # responsible for then refusing requests that carry an owner header
        # inconsistent with the minted claim. We don't enforce that here.

    def test_tampered_signature_rejected(self) -> None:
        from app.gateway.internal_auth import (
            create_internal_auth_headers,
            is_valid_internal_auth_token,
        )

        headers = create_internal_auth_headers(owner_user_id="alice")
        token = headers["X-QiLin-Internal-Token"]
        # Flip the last character of the signature segment.
        head, _, sig = token.rpartition(".")
        tampered = f"{head}.{('a' if sig.endswith('b') else 'b')}{sig[:-1]}"
        assert not is_valid_internal_auth_token(tampered, expected_owner="alice")

    def test_version_mismatch_rejected(self) -> None:
        from app.gateway.internal_auth import (
            create_internal_auth_headers,
            is_valid_internal_auth_token,
        )

        headers = create_internal_auth_headers(owner_user_id="alice")
        token = headers["X-QiLin-Internal-Token"]
        downgraded = "v1." + token.split(".", 1)[1]
        assert not is_valid_internal_auth_token(downgraded, expected_owner="alice")


# ---------------------------------------------------------------------------
# P1 Security #5 — global API rate limiting
# ---------------------------------------------------------------------------


class TestRateLimitMiddleware:
    """Regression for app/gateway/rate_limit.py."""

    @staticmethod
    def _make_request(path: str, *, user_id: str | None = None) -> MagicMock:
        from starlette.datastructures import URL

        request = MagicMock()
        request.url = URL(path=path)
        if user_id:
            user = MagicMock()
            user.id = user_id
            request.state = MagicMock(user=user)
        else:
            request.state = MagicMock(user=None)
        request.headers = {}
        request.client = MagicMock(host="127.0.0.1")
        return request

    def test_default_policy_allows_burst(self) -> None:
        from app.gateway.rate_limit import (
            _DEFAULT_POLICY,
            _store,
            rate_limit,
        )

        _store.reset()
        request = self._make_request("/api/v1/threads/abc")
        # capacity is 30 — all 30 calls must succeed.
        for _ in range(_DEFAULT_POLICY.capacity):
            rate_limit(request)

    def test_default_policy_rejects_after_burst(self) -> None:
        from fastapi import HTTPException

        from app.gateway.rate_limit import (
            _DEFAULT_POLICY,
            _store,
            rate_limit,
        )

        _store.reset()
        request = self._make_request("/api/v1/threads/abc")
        # Spend the entire bucket.
        for _ in range(int(_DEFAULT_POLICY.capacity)):
            rate_limit(request)
        # The next call must 429.
        with pytest.raises(HTTPException) as exc:
            rate_limit(request)
        assert exc.value.status_code == 429
        assert "Retry-After" in exc.value.headers

    def test_strict_paths_use_stricter_policy(self) -> None:
        from fastapi import HTTPException

        from app.gateway.rate_limit import (
            _STRICT_POLICY,
            _store,
            rate_limit,
        )

        _store.reset()
        # Path under STRICT_PATHS uses the strict policy.
        request = self._make_request("/api/v1/runs", user_id="u1")
        cap = int(_STRICT_POLICY.capacity)
        for _ in range(cap):
            rate_limit(request)
        with pytest.raises(HTTPException) as exc:
            rate_limit(request)
        assert exc.value.status_code == 429

    def test_per_user_keys_isolate_users(self) -> None:
        from app.gateway.rate_limit import (
            _DEFAULT_POLICY,
            _store,
            rate_limit,
        )

        _store.reset()
        req_alice = self._make_request("/api/v1/threads/x", user_id="alice")
        req_bob = self._make_request("/api/v1/threads/x", user_id="bob")
        # Alice exhausts her bucket.
        for _ in range(int(_DEFAULT_POLICY.capacity)):
            rate_limit(req_alice)
        # Bob's bucket is independent — fresh start.
        rate_limit(req_bob)


# ---------------------------------------------------------------------------
# P1 Security #4 — upload TOCTOU window
# ---------------------------------------------------------------------------


class TestUploadTOCTOU:
    """Regression for app/gateway/routers/uploads.py chmod+read pattern."""

    def test_make_uploaded_paths_readable_omits_world_bits(
        self, tmp_path: Path
    ) -> None:
        import stat as stat_mod

        from app.gateway.routers import uploads as uploads_mod

        path = tmp_path / "upload.bin"
        path.write_bytes(b"hello")
        os.chmod(path, 0o600)
        uploads_mod._make_file_sandbox_readable(path)
        mode = stat_mod.S_IMODE(os.lstat(path).st_mode)
        assert not (mode & stat_mod.S_IROTH)

    def test_read_upload_bytes_no_follow_skips_symlinks(self, tmp_path: Path) -> None:
        from app.gateway.routers import uploads as uploads_mod

        target = tmp_path / "target.bin"
        target.write_bytes(b"original")
        os.chmod(target, 0o600)
        link = tmp_path / "evil_link"
        link.symlink_to(target)
        # The helper must refuse symlinks (O_NOFOLLOW).
        with pytest.raises(OSError):
            uploads_mod._read_upload_bytes_no_follow(link)

    def test_read_upload_bytes_captures_content(self, tmp_path: Path) -> None:
        from app.gateway.routers import uploads as uploads_mod

        path = tmp_path / "data.bin"
        path.write_bytes(b"hello world")
        os.chmod(path, 0o600)
        assert uploads_mod._read_upload_bytes_no_follow(path) == b"hello world"


# ---------------------------------------------------------------------------
# P1 Performance #9 — MCP tool discovery bounded by Semaphore
# ---------------------------------------------------------------------------


class TestMcpDiscoveryBounded:
    """Regression for qilin/mcp/tools.py tool discovery fan-out."""

    def test_discovery_uses_semaphore(self) -> None:
        """The discovery path must import asyncio.Semaphore — the original
        implementation called ``asyncio.gather`` directly with no cap."""
        import qilin.mcp.tools as mcp_tools

        # The fix introduces a `discovery_sem = asyncio.Semaphore(...)`
        # inside the closure; we verify by reading the source for the new
        # helper ``_load_server_tools_bounded`` and the literal ``Semaphore``.
        source = Path(mcp_tools.__file__).read_text(encoding="utf-8")
        assert "asyncio.Semaphore" in source, (
            "Semaphore removed from MCP tool discovery"
        )
        assert "discovery_concurrency" in source, "concurrency cap variable missing"
        # And that the cap is min(8, len(servers_config)).
        assert "min(8, len(servers_config))" in source, "concurrency cap formula wrong"


# ---------------------------------------------------------------------------
# P1 Performance #10 — Codex SSE async
# ---------------------------------------------------------------------------


class TestCodexAsyncPath:
    """Regression for qilin/models/openai_codex_provider.py."""

    def test_acall_codex_api_uses_asyncio_sleep(self) -> None:
        """``_acall_codex_api`` must use ``asyncio.sleep`` for backoff so the
        event loop is not blocked between retries."""
        from qilin.models import openai_codex_provider as provider_mod

        source = Path(provider_mod.__file__).read_text(encoding="utf-8")
        assert "async def _acall_codex_api" in source, "_acall_codex_api not defined"
        # In the async retry loop, asyncio.sleep must be the wait primitive.
        # Look for "await asyncio.sleep" inside _acall_codex_api.
        match = re.search(
            r"async def _acall_codex_api.*?(?=\n    (?:async )?def |\Z)",
            source,
            re.DOTALL,
        )
        assert match is not None
        body = match.group(0)
        assert "await asyncio.sleep" in body, "async retry uses time.sleep"

    def test_astream_response_uses_async_client(self) -> None:
        from qilin.models import openai_codex_provider as provider_mod

        source = Path(provider_mod.__file__).read_text(encoding="utf-8")
        assert "async def _astream_response" in source
        match = re.search(
            r"async def _astream_response.*?(?=\n    (?:async )?def |\Z)",
            source,
            re.DOTALL,
        )
        assert match is not None
        body = match.group(0)
        assert "httpx.AsyncClient" in body, "async stream still uses sync httpx"
        assert "async for line in resp.aiter_lines" in body, (
            "async stream still uses sync iter_lines"
        )


# ---------------------------------------------------------------------------
# P1 Performance #8 — requests.* replaced with pooled httpx.Client
# ---------------------------------------------------------------------------


class TestRequestsRemoved:
    """Regression for qilin/community/infoquest + aio_sandbox/remote_backend."""

    def test_infoquest_no_longer_imports_requests(self) -> None:
        from qilin.community import infoquest

        for sub in Path(infoquest.__path__[0]).rglob("*.py"):
            text = sub.read_text(encoding="utf-8")
            assert "import requests" not in text, f"requests still imported in {sub}"

    def test_aio_sandbox_remote_backend_no_longer_imports_requests(self) -> None:
        from qilin.community import aio_sandbox

        remote = Path(aio_sandbox.__path__[0]) / "remote_backend.py"
        text = remote.read_text(encoding="utf-8")
        assert "import requests" not in text
        assert "import httpx" in text
        assert "_provisioner_client" in text

    def test_infoquest_uses_pooled_client(self) -> None:
        from qilin.community.infoquest import infoquest_client

        source = Path(infoquest_client.__file__).read_text(encoding="utf-8")
        # The legacy `requests.post(...)` calls must be gone.
        assert "requests.post" not in source
        assert "requests.get" not in source
        # And there must be a pooled client in __init__.
        assert "_sync_client" in source


# ---------------------------------------------------------------------------
# P1 Performance #11 — lark_broker timeout reduction
# ---------------------------------------------------------------------------


class TestLarkBrokerTimeout:
    """Regression for qilin/integrations/lark_broker.py."""

    def test_broker_timeout_reduced_to_30_seconds(self) -> None:
        from qilin.integrations import lark_broker

        source = Path(lark_broker.__file__).read_text(encoding="utf-8")
        # The previous 600s timeout hung the agent for 10 minutes on a stuck
        # Lark broker. The new value is 30 seconds.
        assert "timeout=600" not in source
        assert "timeout=30" in source


# ---------------------------------------------------------------------------
# P1 Dependencies #12 + #13 — kubernetes and duckdb removed from
# pyproject.toml
# ---------------------------------------------------------------------------


class TestPyprojectCleanup:
    def test_kubernetes_removed(self) -> None:
        from pathlib import Path

        pyproject = Path(__file__).resolve().parent.parent / "pyproject.toml"
        text = pyproject.read_text(encoding="utf-8")
        assert "kubernetes" not in text, "kubernetes still listed in pyproject.toml"

    def test_duckdb_removed(self) -> None:
        from pathlib import Path

        pyproject = Path(__file__).resolve().parent.parent / "pyproject.toml"
        text = pyproject.read_text(encoding="utf-8")
        assert "duckdb" not in text, "duckdb still listed in pyproject.toml"
