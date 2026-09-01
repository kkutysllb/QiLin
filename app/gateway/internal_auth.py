"""Authentication for trusted Gateway internal callers.

Security properties (v2 audit P1 #6 fix):

1. **Short TTL**: tokens minted by :func:`create_internal_auth_headers` carry
   an embedded expiry and are rejected after ``INTERNAL_TOKEN_TTL_SECONDS``.
   A leaked token is only useful for at most that window.

2. **Owner-binding**: tokens carry an ``owner_user_id`` claim. The auth
   middleware refuses to honour a token whose embedded owner does not match
   the ``X-QiLin-Owner-User-Id`` header on the request. A token minted for
   ``alice`` cannot be replayed with a header of ``bob`` — the previous
   implementation accepted any owner once the static token checked out.

3. **No fallback to a random in-memory secret** when ``QILIN_INTERNAL_AUTH_TOKEN``
   is unset. Operators MUST configure a stable shared secret (e.g. a
   Kubernetes Secret mounted into every gateway + channel worker pod). The
   module fails fast at import time so a misconfigured deploy cannot start
   with a single-process secret that will silently break after restart.

Token format: ``v2.<base64-claims>.<base64-hmac>`` where claims are::

    {"owner": "<owner_user_id|*>", "exp": <unix-seconds>}

and ``hmac`` is HMAC-SHA-256 over the claims, keyed by the shared secret.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import time
from types import SimpleNamespace
from typing import Any

from qilin.config.paths import make_safe_user_id
from qilin.runtime.user_context import DEFAULT_USER_ID

logger = logging.getLogger(__name__)

INTERNAL_AUTH_HEADER_NAME = "X-QiLin-Internal-Token"
INTERNAL_OWNER_USER_ID_HEADER_NAME = "X-QiLin-Owner-User-Id"
INTERNAL_AUTH_ENV_VAR = "QILIN_INTERNAL_AUTH_TOKEN"

INTERNAL_TOKEN_TTL_SECONDS = 300  # 5 minutes — short enough to limit blast radius.
INTERNAL_SYSTEM_ROLE = "internal"
_TOKEN_VERSION = "v2"


class InternalAuthNotConfigured(RuntimeError):
    """Raised when the gateway starts without a configured internal auth secret."""


def _load_internal_auth_secret() -> bytes:
    """Read the shared HMAC secret.

    Fails fast at startup when ``QILIN_INTERNAL_AUTH_TOKEN`` is unset rather
    than falling back to a fresh in-memory value — the previous fallback
    would silently break after a restart because every restart minted a new
    secret and existing channel workers could not validate.
    """
    raw = os.environ.get(INTERNAL_AUTH_ENV_VAR, "").strip()
    if not raw:
        raise InternalAuthNotConfigured(
            f"Environment variable {INTERNAL_AUTH_ENV_VAR} must be set with a stable "
            "shared secret (e.g. a Kubernetes Secret mounted into both the gateway "
            "and the channel workers). Internal token authentication refuses to "
            "fall back to an ephemeral in-memory secret because existing channel "
            "workers could not reconnect after a gateway restart."
        )
    if len(raw) < 32:
        raise InternalAuthNotConfigured(
            f"{INTERNAL_AUTH_ENV_VAR} is too short ({len(raw)} chars, need >= 32). "
            "Use `python -c 'import secrets; print(secrets.token_urlsafe(48))'` to generate a strong secret."
        )
    return raw.encode("utf-8")


_INTERNAL_AUTH_SECRET = _load_internal_auth_secret()


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64d(text: str) -> bytes:
    padding = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + padding)


def _sign(claims_json: bytes) -> bytes:
    return hmac.new(_INTERNAL_AUTH_SECRET, claims_json, hashlib.sha256).digest()


def _mint(
    owner_user_id: str | None, ttl_seconds: int = INTERNAL_TOKEN_TTL_SECONDS
) -> str:
    """Mint a short-lived, owner-bound token.

    Internal helper; the public entry point is :func:`create_internal_auth_headers`.
    """
    payload = {
        "owner": make_safe_user_id(owner_user_id) if owner_user_id else "*",
        "exp": int(time.time()) + ttl_seconds,
    }
    claims_json = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode(
        "utf-8"
    )
    claims_b64 = _b64(claims_json)
    sig_b64 = _b64(_sign(claims_json))
    return f"{_TOKEN_VERSION}.{claims_b64}.{sig_b64}"


# Backwards-compatible alias used by the auth middleware (the function name
# was renamed during the v2 audit cleanup).
_mint_token = _mint


def create_internal_auth_headers(*, owner_user_id: str | None = None) -> dict[str, str]:
    """Return headers that authenticate trusted Gateway internal calls.

    The token is bound to *owner_user_id* via HMAC: presenting it with a
    different ``X-QiLin-Owner-User-Id`` header on the wire will be rejected.
    Pass ``owner_user_id=None`` for tokens bound to the wildcard owner
    (``*``), which can be reused for any channel worker.
    """
    token = _mint(owner_user_id)
    headers = {INTERNAL_AUTH_HEADER_NAME: token}
    if owner_user_id:
        headers[INTERNAL_OWNER_USER_ID_HEADER_NAME] = make_safe_user_id(owner_user_id)
    return headers


def _parse_token(token: str | None) -> dict[str, Any] | None:
    """Return the claims dict iff the token is well-formed, signed, and unexpired."""
    if not token or not isinstance(token, str):
        return None
    parts = token.split(".")
    if len(parts) != 3 or parts[0] != _TOKEN_VERSION:
        return None
    try:
        claims_json = _b64d(parts[1])
        provided_sig = _b64d(parts[2])
    except (ValueError, TypeError):
        return None
    expected_sig = _sign(claims_json)
    if not hmac.compare_digest(provided_sig, expected_sig):
        return None
    try:
        claims = json.loads(claims_json)
    except (ValueError, json.JSONDecodeError):
        return None
    if not isinstance(claims, dict) or "exp" not in claims or "owner" not in claims:
        return None
    if int(claims["exp"]) < int(time.time()):
        return None
    return claims


def matches_internal_secret(token: str | None) -> bool:
    """Constant-time compare a presented credential against the shared secret.

    For LOCAL infrastructure faces (e.g. the plugin-host ports API) whose
    callers hold the raw shared secret but do not mint structured tokens.
    """
    import hmac as _hmac

    if not token:
        return False
    return _hmac.compare_digest(token.encode("utf-8"), _INTERNAL_AUTH_SECRET)


def is_valid_internal_auth_token(
    token: str | None,
    *,
    expected_owner: str | None = None,
) -> bool:
    """Validate an internal auth token, optionally binding it to an owner.

    Args:
        token: The value of the ``X-QiLin-Internal-Token`` header.
        expected_owner: If provided, the token's embedded owner must match
            (after :func:`make_safe_user_id` normalisation). The wildcard
            ``*`` token matches any owner — useful for gateway-internal
            calls where the worker genuinely has multi-tenant authority.
    """
    claims = _parse_token(token)
    if claims is None:
        return False
    if expected_owner is None:
        return True
    embedded_owner = claims.get("owner", "")
    if embedded_owner == "*":
        return True
    safe_expected = make_safe_user_id(expected_owner)
    return hmac.compare_digest(embedded_owner, safe_expected)


def get_internal_user(owner_user_id: str | None = None):
    """Return the synthetic user used for trusted internal channel calls.

    When *owner_user_id* is provided (extracted from the
    ``X-QiLin-Owner-User-Id`` header), the synthetic user's ``.id``
    carries the actual channel owner instead of ``DEFAULT_USER_ID``.
    The owner id is normalized through :func:`make_safe_user_id` to keep
    per-user storage buckets safe from header-value tricks.
    """
    if owner_user_id:
        effective_id = make_safe_user_id(owner_user_id)
    else:
        effective_id = DEFAULT_USER_ID
    return SimpleNamespace(id=effective_id, system_role=INTERNAL_SYSTEM_ROLE)


def get_trusted_internal_owner_user_id(request: Any) -> str | None:
    """Return the owner override for a trusted internal request, if present.

    The header is ignored for normal browser/API callers. It is only honored
    after ``AuthMiddleware`` has validated the internal auth token and stamped
    the synthetic internal user onto ``request.state.user``.
    """
    user = getattr(getattr(request, "state", None), "user", None)
    if getattr(user, "system_role", None) != INTERNAL_SYSTEM_ROLE:
        return None

    owner_user_id = request.headers.get(INTERNAL_OWNER_USER_ID_HEADER_NAME)
    if not owner_user_id:
        return None
    owner_user_id = owner_user_id.strip()
    return owner_user_id or None
