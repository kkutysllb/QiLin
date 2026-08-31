"""Rate-limit STRICT_PATHS policy selection (P0 audit fix regression).

The original implementation compared raw request paths against
``/api/v1/*`` literals that exist nowhere in the real route table (the
gateway serves ``/api/*`` — only auth lives under ``/api/v1/*``), so the
strict policy never applied to any endpoint. These tests pin the fixed
behaviour: route templates match parameterized endpoints, real ``/api/*``
prefixes are used, and unlisted endpoints keep the default policy.
"""

from __future__ import annotations

import os
from types import SimpleNamespace

# Importing app.gateway.* requires the internal auth token at module import.
os.environ.setdefault(
    "QILIN_INTERNAL_AUTH_TOKEN", "unit-test-secret-0123456789abcdef"
)

from app.gateway.rate_limit import (
    _DEFAULT_POLICY,
    _STRICT_POLICY,
    STRICT_PATHS,
    _policy_for_request,
)


def _request(path: str, route_path: str | None = None):
    """Build a minimal request stand-in for _policy_for_request.

    Only ``request.url.path`` and ``request.scope["route"].path`` are read.
    """
    scope: dict = {}
    if route_path is not None:
        scope["route"] = SimpleNamespace(path=route_path)
    return SimpleNamespace(url=SimpleNamespace(path=path), scope=scope)


def test_parametrized_route_template_gets_strict_policy() -> None:
    request = _request(
        "/api/threads/t-1/uploads", "/api/threads/{thread_id}/uploads"
    )
    assert _policy_for_request(request) is _STRICT_POLICY


def test_exact_path_without_route_still_strict() -> None:
    assert _policy_for_request(_request("/api/skills/install")) is _STRICT_POLICY


def test_run_stream_template_strict() -> None:
    request = _request(
        "/api/threads/t-1/runs/stream", "/api/threads/{thread_id}/runs/stream"
    )
    assert _policy_for_request(request) is _STRICT_POLICY


def test_thread_and_run_creation_strict() -> None:
    assert _policy_for_request(_request("/api/threads", "/api/threads")) is (
        _STRICT_POLICY
    )
    request = _request("/api/threads/t-1/runs", "/api/threads/{thread_id}/runs")
    assert _policy_for_request(request) is _STRICT_POLICY


def test_feedback_template_strict() -> None:
    request = _request(
        "/api/threads/t-1/runs/r-1/feedback",
        "/api/threads/{thread_id}/runs/{run_id}/feedback",
    )
    assert _policy_for_request(request) is _STRICT_POLICY


def test_unlisted_endpoints_keep_default_policy() -> None:
    request = _request(
        "/api/threads/t-1/runs/r-1/cancel",
        "/api/threads/{thread_id}/runs/{run_id}/cancel",
    )
    assert _policy_for_request(request) is _DEFAULT_POLICY
    assert _policy_for_request(_request("/api/models")) is _DEFAULT_POLICY


def test_raw_literal_template_path_fails_closed_to_strict() -> None:
    # A raw request path that literally equals a route template (e.g. a
    # client asking for "/api/threads/{thread_id}/uploads" verbatim) also
    # matches STRICT_PATHS via the raw-path fallback. That is the safe
    # direction: an exotic edge request gets over-throttled rather than
    # slipping past the strict bucket.
    raw_only = SimpleNamespace(
        url=SimpleNamespace(path="/api/threads/{thread_id}/uploads"), scope={}
    )
    assert _policy_for_request(raw_only) is _STRICT_POLICY


def test_no_legacy_api_v1_paths_remain() -> None:
    assert len(STRICT_PATHS) > 0
    assert not any(path.startswith("/api/v1/") for path in STRICT_PATHS)
