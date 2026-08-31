"""Error taxonomy of the ports layer.

Codes mirror the DSH sidebar API error vocabulary (a subset) so a future
gateway adapter can map them onto the same wire envelope without a
translation table. code is machine-readable; message is for the model or
user and never carries transport vocabulary.
"""

from typing import Literal

PortErrorCode = Literal[
    "not-found",
    "forbidden",
    "bad-request",
    "pty-error",
    "pty-deps-missing",
]


class PortError(Exception):
    """One ports-layer failure with a wire code."""

    def __init__(self, code: PortErrorCode, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
