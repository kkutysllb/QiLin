"""Shared exponential-backoff formulas.

Several modules used to hand-roll the same ``base * factor**(attempt-1)``
(with optional cap) computation in slightly different shapes.  Funnel new
retry loops through these helpers so the numeric semantics stay aligned;
each call site passes its own ``base`` / ``cap`` / ``factor`` so existing
timings are preserved exactly.
"""

from __future__ import annotations

__all__ = ["backoff_delay_ms", "backoff_delay_seconds"]


def backoff_delay_ms(
    attempt: int,
    base_ms: float,
    cap_ms: float | None = None,
    factor: float = 2,
) -> float:
    """Return the delay in milliseconds before retry *attempt* (1-based).

    ``backoff_delay_ms(attempt, 2000)`` reproduces the classic
    ``2000 * (1 << (attempt - 1))`` provider-retry sequence.  When
    *cap_ms* is given the delay never exceeds it.
    """
    delay = base_ms * (factor ** max(0, attempt - 1))
    if cap_ms is not None:
        delay = min(cap_ms, delay)
    return delay


def backoff_delay_seconds(
    attempt: int,
    base_seconds: float,
    cap_seconds: float | None = None,
    factor: float = 2,
) -> float:
    """Second-unit variant of :func:`backoff_delay_ms`.

    ``backoff_delay_seconds(attempt, 1)`` reproduces the channel retry
    ``2 ** (attempt - 1)`` second sequence for 1-based attempts.
    """
    delay = base_seconds * (factor ** max(0, attempt - 1))
    if cap_seconds is not None:
        delay = min(cap_seconds, delay)
    return delay
