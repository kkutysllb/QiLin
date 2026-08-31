"""Surface-open contracts, mirrored from DSH sidebar_open.

A "surface" is QiLin's port-side generalization of DSH's sidebar open: a
request that something (a file, a folder, or an HTTP(S) page) become
visible in a UI attached to the calling session. The wire fields keep the
DSH sidebar_open spelling so the tool contract transfers unchanged; the
destination UI (web-demo workspace panel, later TUI/IM adapters) is just
whatever adapter currently owns the session's surface port.

Queueing semantics (mirrored): when the calling session's surface view is
not connected, the open is queued and delivered the next time that
session's surface attaches; the result reports delivered=False so the
model knows the open is not visible yet.
"""

from typing import Literal
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field

SURFACE_OPEN_TOOL_NAME = "sidebar_open"

SurfaceKind = Literal["file", "folder", "url"]

_WIRE = ConfigDict(populate_by_name=True, extra="forbid", frozen=True)


class SurfaceOpenArgs(BaseModel):
    """Open a local file, a local folder, or an HTTP(S) page.

    The path may be absolute or relative to the session working directory;
    the engine resolves it inside the workspace fence before honoring the
    open. URL opens render in a sandboxed frame; file opens dedupe by path
    (an already-open file is focused, not duplicated).
    """

    model_config = _WIRE

    target: str = Field(
        description="Absolute or session-cwd-relative local path, or an http(s) URL.",
    )
    title: str | None = Field(
        default=None,
        description="Optional display title; defaults to the basename or URL hostname.",
    )


class SurfaceOpenResult(BaseModel):
    """What was opened, and whether it is visible right now.

    delivered=False means the session surface is detached: the open is
    queued and will appear the next time that session's UI attaches.
    """

    model_config = _WIRE

    kind: SurfaceKind
    target: str = Field(description="The absolute path or URL the open was requested for.")
    title: str
    delivered: bool


def classify_target_kind(target: str) -> SurfaceKind | None:
    """Classify a raw target without touching the filesystem.

    Returns "url" for http(s) targets, None when the target must be
    resolved on disk by the engine (which then decides file vs folder).
    Windows drive paths ("C:\\dev") are recognized as filesystem paths —
    urlparse would otherwise misread the drive letter as a URL scheme.
    """
    parsed = urlparse(target)
    scheme = parsed.scheme.lower()
    if len(scheme) == 1:
        # Single-letter "scheme" is a drive letter, not a protocol.
        return None
    if scheme in ("http", "https") and parsed.netloc:
        return "url"
    return None
