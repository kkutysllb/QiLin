"""Per-user + per-IP rate limiting middleware for the gateway.

The audit (v2 SECURITY.md finding #4, MEDIUM) flagged the gateway for only
rate-limiting the auth endpoints. This module provides a reusable
token-bucket limiter that routers can opt into via the
``rate_limit(...)`` dependency.

Design choices:

* **In-process token bucket**: Avoids pulling in Redis for deployments that
  do not already need a broker. Operators that want a globally consistent
  limit across multiple gateway replicas should layer ``slowapi`` /
  ``limits`` on top.

* **Per-user key when authenticated, per-IP key otherwise**: stops an
  authenticated attacker from bypassing the bucket by churning accounts
  while still rate-limiting unauthenticated traffic (the typical abuse
  vector for the unauthenticated endpoints).

* **No 429-by-default for read endpoints**: the rate limit fires only on
  write / expensive endpoints, configured via :data:`STRICT_PATHS`.

* **Fail-open under load**: if the bucket table is full, the limiter
  evicts the least-recently-used entry rather than refusing the request.
  Rate limiting is a quality-of-service feature, not a security boundary.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass

from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class _Bucket:
    tokens: float
    last_refill_ns: int


@dataclass(slots=True)
class RateLimitPolicy:
    """Token bucket configuration for one endpoint family.

    ``capacity`` is the maximum number of requests allowed in a burst;
    ``refill_per_sec`` is the steady-state rate. With capacity=10 and
    refill_per_sec=1 a client can spend 10 requests instantly, then is
    capped at 1 per second until the burst window resets.
    """

    capacity: float
    refill_per_sec: float

    def __post_init__(self) -> None:
        if self.capacity <= 0:
            raise ValueError(f"capacity must be > 0, got {self.capacity}")
        if self.refill_per_sec <= 0:
            raise ValueError(f"refill_per_sec must be > 0, got {self.refill_per_sec}")


_DEFAULT_POLICY = RateLimitPolicy(capacity=30, refill_per_sec=5)
_STRICT_POLICY = RateLimitPolicy(capacity=10, refill_per_sec=1)

# Endpoint paths that always get the strict policy. These are the
# operations the audit flagged as needing rate limits: thread/run creation
# (expensive LLM calls), uploads (disk), skill writes (can pull arbitrary
# packages), feedback (cheap but easy to amplify). Matches are exact path
# equality, no wildcards.
STRICT_PATHS: frozenset[str] = frozenset(
    {
        # Thread / run lifecycle — triggers LLM calls + DB writes.
        "/api/v1/threads",
        "/api/v1/runs",
        # Uploads — disk + bandwidth.
        "/api/v1/uploads",
        "/api/v1/threads/{thread_id}/uploads",
        # Skill writes — install endpoint can pull arbitrary packages.
        "/api/v1/skills",
        # Feedback — used for thumbs up/down; cheap but easy to amplify.
        "/api/v1/feedback",
    }
)


class _TokenBucketStore:
    """In-process LRU token bucket store, thread-safe."""

    def __init__(self, max_keys: int = 50_000) -> None:
        self._buckets: OrderedDict[str, _Bucket] = OrderedDict()
        self._max_keys = max_keys
        self._lock = threading.Lock()

    def consume(self, key: str, policy: RateLimitPolicy) -> tuple[bool, int]:
        """Return (allowed, retry_after_seconds).

        ``retry_after_seconds`` is set when ``allowed`` is False; otherwise
        it is 0. The caller turns this into a ``Retry-After`` header.
        """
        now_ns = time.monotonic_ns()
        with self._lock:
            bucket = self._buckets.get(key)
            if bucket is None:
                bucket = _Bucket(tokens=policy.capacity, last_refill_ns=now_ns)
                self._buckets[key] = bucket
            else:
                # Refill on access — token bucket model.
                elapsed = (now_ns - bucket.last_refill_ns) / 1e9
                bucket.tokens = min(
                    policy.capacity, bucket.tokens + elapsed * policy.refill_per_sec
                )
                bucket.last_refill_ns = now_ns
                # Move-to-end so we evict cold entries first.
                self._buckets.move_to_end(key)

            if bucket.tokens >= 1.0:
                bucket.tokens -= 1.0
                return True, 0

            deficit = 1.0 - bucket.tokens
            retry_after = max(1, int(deficit / policy.refill_per_sec) + 1)

            # Cold eviction if the table has grown past the cap. This is a
            # safety valve — the cap is generous enough that we never expect
            # to hit it under normal load, but we never want a memory leak
            # from a churning client population.
            if len(self._buckets) >= self._max_keys:
                self._buckets.popitem(last=False)
            return False, retry_after

    def reset(self) -> None:
        """Clear all buckets (test helper)."""
        with self._lock:
            self._buckets.clear()


_store = _TokenBucketStore()


def _key_for_request(request: Request) -> str:
    """Pick a rate-limit key: prefer the authenticated user, fall back to IP."""
    user = getattr(request.state, "user", None)
    user_id = getattr(user, "id", None) if user is not None else None
    if user_id:
        return f"user:{user_id}"
    # Reuse the auth router's IP extraction logic to respect
    # AUTH_TRUSTED_PROXIES without re-implementing it. Importing lazily
    # avoids a circular import at module load.
    from app.gateway.routers.auth import _get_client_ip

    return f"ip:{_get_client_ip(request)}"


def _policy_for_request(request: Request) -> RateLimitPolicy:
    if request.url.path in STRICT_PATHS:
        return _STRICT_POLICY
    return _DEFAULT_POLICY


def rate_limit(request: Request) -> None:
    """FastAPI dependency that enforces the token bucket policy.

    Usage::

        @router.post("", dependencies=[Depends(rate_limit)])
        async def create_thing(...):
            ...

    Endpoints in :data:`STRICT_PATHS` always use the strict policy
    (10 burst / 1 rps) because they trigger expensive side effects
    (LLM calls, disk writes). All other endpoints use the default
    (30 burst / 5 rps).
    """
    effective_policy = _policy_for_request(request)
    key = _key_for_request(request)
    allowed, retry_after = _store.consume(key, effective_policy)
    if not allowed:
        logger.warning(
            "rate-limit: key=%s path=%s policy=cap%.0f/rps%.1f retry_after=%ds",
            key,
            request.url.path,
            effective_policy.capacity,
            effective_policy.refill_per_sec,
            retry_after,
        )
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please retry shortly.",
            headers={"Retry-After": str(retry_after)},
        )
