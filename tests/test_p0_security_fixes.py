"""P0 fix regression tests (security audit 2026-08-21).

Covers:

* ``app.gateway.routers.uploads._make_file_sandbox_readable / _writable`` must
  NOT grant S_IROTH / S_IWOTH (multi-user host leak + TOCTOU).
* ``qilin.persistence.channel_connections.cipher.load_channel_credential_cipher``
  must fail-fast when ``QILIN_CHANNEL_CREDENTIAL_KEY`` is missing/short.
* Round-trip encryption works through ``ChannelCredentialCipher.from_key``.
* ``qilin.authz.principal`` normalizers reject non-Mapping inputs and non-str
  agent identity values.

These tests are intentionally hermetic — no DB, no network, no sandbox.
"""

from __future__ import annotations

import os
import stat
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# P0-1: upload chmod must not grant world-readable/world-writable bits
# ---------------------------------------------------------------------------


class TestUploadChmodSecurity:
    """Regression for ``app/gateway/routers/uploads.py`` permission leak.

    Before the fix, every uploaded file was chmod'd to 0o666 / 0o644 after the
    upload completed (line 110/129 in the original code). This leaked documents
    to every local user on multi-user hosts and opened a TOCTOU window in the
    sandbox-sync path. The fix removes ``S_IROTH`` / ``S_IWOTH`` from the
    granted bitmask.
    """

    @staticmethod
    def _create_file(tmp_path: Path, *, initial_mode: int = 0o600) -> Path:
        path = tmp_path / "upload.bin"
        path.write_bytes(b"hello")
        os.chmod(path, initial_mode)
        return path

    @staticmethod
    def _import_chmod_fns():
        from app.gateway.routers import uploads as uploads_mod

        return (
            uploads_mod._make_file_sandbox_readable,  # type: ignore[attr-defined]
            uploads_mod._make_file_sandbox_writable,  # type: ignore[attr-defined]
        )

    def test_readable_chmod_does_not_grant_world_readable(self, tmp_path: Path) -> None:
        readable, _ = self._import_chmod_fns()
        path = self._create_file(tmp_path, initial_mode=0o600)
        readable(path)
        mode = stat.S_IMODE(os.lstat(path).st_mode)
        # S_IROTH must NOT be set after a "make readable" call.
        assert not (mode & stat.S_IROTH), (
            f"S_IROTH was set (final mode=0o{mode:o}); uploads leak user docs to other local accounts"
        )
        # The owner should still own the file; group read is allowed.
        assert mode & stat.S_IRUSR
        assert mode & stat.S_IWUSR
        assert mode & stat.S_IRGRP

    def test_writable_chmod_does_not_grant_world_writable(self, tmp_path: Path) -> None:
        _, writable = self._import_chmod_fns()
        path = self._create_file(tmp_path, initial_mode=0o600)
        writable(path)
        mode = stat.S_IMODE(os.lstat(path).st_mode)
        # S_IWOTH must NOT be set: world-writable opens a TOCTOU window where
        # any local user could swap the file before the sandbox reads it.
        assert not (mode & stat.S_IWOTH), (
            f"S_IWOTH was set (final mode=0o{mode:o}); world-writable upload files enable prompt injection via TOCTOU"
        )
        assert not (mode & stat.S_IROTH), (
            f"S_IROTH was set (final mode=0o{mode:o}); uploads must not be world-readable"
        )
        # Owner + group should retain write access so the sandbox runtime can
        # rewrite the mounted file when needed.
        assert mode & stat.S_IWUSR
        assert mode & stat.S_IWGRP

    def test_readable_chmod_skips_symlinks_safely(self, tmp_path: Path) -> None:
        """Defence against chmod-following-symlink attacks: the helper must
        not follow symlinks (would let an attacker chmod arbitrary files)."""
        readable, _ = self._import_chmod_fns()
        target = self._create_file(tmp_path, initial_mode=0o600)
        target_mode_before = stat.S_IMODE(os.lstat(target).st_mode)
        link = tmp_path / "evil_link"
        link.symlink_to(target)
        readable(link)
        # The link target must NOT have been chmod'd by way of the symlink.
        assert stat.S_IMODE(os.lstat(target).st_mode) == target_mode_before


# ---------------------------------------------------------------------------
# P0-2: Channel credential cipher must be loaded from env var, fail-fast
# ---------------------------------------------------------------------------


class TestChannelCipherBootstrap:
    """Regression for the broken ``ChannelConnectionRepository`` cipher.

    Before the fix, ``ChannelConnectionRepository(session_factory)`` was
    constructed without a cipher. The first ``store_credentials`` call would
    raise ``RuntimeError``, breaking every IM channel OAuth flow (Slack,
    Discord, Feishu, Telegram, WeChat, WeCom, DingTalk).

    The fix introduces ``load_channel_credential_cipher()`` which:

    * builds the cipher from ``QILIN_CHANNEL_CREDENTIAL_KEY``
    * raises ``ChannelCredentialKeyMissing`` if the env var is unset or too short
    * never falls back to an ephemeral key (which would silently lose the
      ability to decrypt existing rows on the next process restart)
    """

    @pytest.fixture(autouse=True)
    def _isolate_env(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # Ensure the env var is unset at the start of each test, regardless
        # of how the host environment is configured.
        monkeypatch.delenv("QILIN_CHANNEL_CREDENTIAL_KEY", raising=False)
        # Also bust the lru_cache so we re-read the env var each test.
        from qilin.persistence.channel_connections import cipher as cipher_mod

        cipher_mod.load_channel_credential_cipher.cache_clear()

    def test_missing_key_raises(self) -> None:
        from qilin.persistence.channel_connections import (
            ChannelCredentialKeyMissing,
            load_channel_credential_cipher,
        )

        with pytest.raises(ChannelCredentialKeyMissing) as exc:
            load_channel_credential_cipher()
        # Error message must guide the operator toward the fix.
        assert "QILIN_CHANNEL_CREDENTIAL_KEY" in str(exc.value)
        assert "secrets.token_urlsafe" in str(exc.value)

    def test_short_key_raises(self) -> None:
        from qilin.persistence.channel_connections import (
            ChannelCredentialKeyMissing,
            load_channel_credential_cipher,
        )

        os.environ["QILIN_CHANNEL_CREDENTIAL_KEY"] = "short"
        with pytest.raises(ChannelCredentialKeyMissing) as exc:
            load_channel_credential_cipher()
        assert "too short" in str(exc.value)

    def test_loaded_cipher_round_trips_secrets(self) -> None:
        from qilin.persistence.channel_connections import load_channel_credential_cipher

        os.environ["QILIN_CHANNEL_CREDENTIAL_KEY"] = (
            "this-is-a-test-key-with-enough-entropy-for-sha256"
        )
        cipher = load_channel_credential_cipher()
        token = cipher.encrypt_text("bot-token-value-X")
        assert token is not None
        assert token.startswith("fernet:v1:")
        # Decryption yields the plaintext exactly.
        assert cipher.decrypt_text(token) == "bot-token-value-X"

    def test_cipher_is_cached_across_calls(self) -> None:
        from qilin.persistence.channel_connections import cipher as cipher_mod

        os.environ["QILIN_CHANNEL_CREDENTIAL_KEY"] = (
            "another-test-key-with-enough-length-to-pass"
        )
        a = cipher_mod.load_channel_credential_cipher()
        b = cipher_mod.load_channel_credential_cipher()
        # Same instance — lru_cache hit on second call.
        assert a is b

    def test_channel_service_make_connection_repo_returns_none_without_key(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        """``_make_connection_repo`` must NOT raise; it must return ``None``
        so the channel service starts up and only fails when credentials
        actually need to be stored."""
        from app.channels.service import _make_connection_repo

        class _StubConnConfig:
            enabled = True

        # Sanity: env var is unset (autouse fixture already cleared it).
        assert "QILIN_CHANNEL_CREDENTIAL_KEY" not in os.environ

        result = _make_connection_repo(_StubConnConfig())  # type: ignore[arg-type]
        assert result is None

    def test_channel_connections_router_raises_503_without_key(self) -> None:
        """The HTTP endpoint must surface a 503 (not a 500) when the cipher
        env var is missing, so clients see a clear remediation message."""
        from fastapi import HTTPException

        from app.gateway.routers import channel_connections as router_mod

        class _StubConfig:
            enabled = True

        # Build a fake Request with the minimum surface used by _get_repository.
        class _StubApp:
            state = type("S", (), {})()

        class _StubRequest:
            app = _StubApp()

        # Patch get_session_factory so we don't need a real DB session.
        class _StubSF:
            pass

        monkeypatch = pytest.MonkeyPatch()
        try:
            monkeypatch.setattr(router_mod, "get_session_factory", lambda: _StubSF())
            with pytest.raises(HTTPException) as exc:
                router_mod._get_repository(_StubRequest(), _StubConfig())  # type: ignore[arg-type]
            assert exc.value.status_code == 503
            assert "QILIN_CHANNEL_CREDENTIAL_KEY" in exc.value.detail
        finally:
            monkeypatch.undo()


# ---------------------------------------------------------------------------
# P0-3: authz principal normalizers — quick security boundary tests
# ---------------------------------------------------------------------------


class TestAuthzPrincipalNormalization:
    """Regression for ``qilin.authz.principal``.

    The principal builder is the single sanctioned way to construct identity
    objects consumed by both Layer 1 (tool assembly) and Layer 2
    (GuardrailAuthorizationAdapter). Any TypeError bypass weakens the RBAC
    boundary.
    """

    def test_normalize_authz_attributes_accepts_none(self) -> None:
        from qilin.authz.principal import normalize_authz_attributes

        assert normalize_authz_attributes(None) == {}

    def test_normalize_authz_attributes_copies_mapping(self) -> None:
        from qilin.authz.principal import normalize_authz_attributes

        original = {"user_id": "u1"}
        copied = normalize_authz_attributes(original)
        copied["user_id"] = "mutated"
        # Original must not be mutated (no aliasing).
        assert original["user_id"] == "u1"

    def test_normalize_authz_attributes_rejects_non_mapping(self) -> None:
        from qilin.authz.principal import normalize_authz_attributes

        with pytest.raises(TypeError):
            normalize_authz_attributes(["not", "a", "mapping"])  # type: ignore[arg-type]
        with pytest.raises(TypeError):
            normalize_authz_attributes("string-not-mapping")  # type: ignore[arg-type]
        with pytest.raises(TypeError):
            normalize_authz_attributes(42)  # type: ignore[arg-type]

    def test_normalize_agent_identity_requires_str_values(self) -> None:
        from qilin.authz.principal import normalize_agent_identity

        # Valid: both keys present as strings.
        assert normalize_agent_identity(
            {"agent_id": "a1", "agent_role": "operator"}
        ) == {
            "agent_id": "a1",
            "agent_role": "operator",
        }
        # Empty strings must be filtered out (no empty agent identity).
        assert normalize_agent_identity({"agent_id": "", "agent_role": "operator"}) == {
            "agent_role": "operator"
        }
        # Non-str must raise (boundary enforcement).
        with pytest.raises(TypeError):
            normalize_agent_identity({"agent_id": 123})  # type: ignore[arg-type]
