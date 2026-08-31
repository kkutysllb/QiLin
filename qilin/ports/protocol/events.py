"""Server-to-client event catalog of the ports protocol.

Control plane vs data plane: these JSON models are the control plane
(lifecycle, opens, exits). Raw terminal output SHOULD travel as WS binary
frames — JSON-stringified PTY bytes would mangle binary output — with the
frame layout pinned by the transport adapter (web-demo: first line is the
terminal uuid, remainder is raw PTY bytes). TerminalOutputEvent exists for
transports that cannot do binary frames (e.g. SSE relays) and carries
UTF-8 decoded chunks with a lossy-decode caveat.

All events are fire-and-forget pushes; ordering within one terminal is
guaranteed, ordering across terminals is not.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from qilin.ports.protocol.surface import SurfaceKind

_WIRE = ConfigDict(populate_by_name=True, extra="forbid", frozen=True)


class TerminalOutputEvent(BaseModel):
    """A decoded output chunk of one terminal (non-binary transports only)."""

    model_config = _WIRE

    kind: Literal["terminal.output"] = "terminal.output"
    uuid: str
    data: str = Field(
        description="UTF-8 decoded PTY chunk; replacement-char lossy on binary output.",
    )


class TerminalExitedEvent(BaseModel):
    """The terminal's top-level process exited."""

    model_config = _WIRE

    kind: Literal["terminal.exited"] = "terminal.exited"
    uuid: str
    exit_code: int | None = Field(default=None, alias="exitCode")
    exit_signal: str | None = Field(default=None, alias="exitSignal")


class SurfaceOpenEvent(BaseModel):
    """An open request for the session's attached surface adapter.

    Field note: the tool RESULT names the target type "kind"; here the
    event discriminator owns "kind", so the type rides as "surface".
    """

    model_config = _WIRE

    kind: Literal["surface.open"] = "surface.open"
    session_id: str = Field(alias="sessionId")
    surface: SurfaceKind
    target: str
    title: str
    # QiLin extension (additive, not part of the DSH mirror): workspace-
    # relative path for filesystem targets, so UI adapters can fetch
    # content via the files API without knowing the workspace root.
    read_path: str | None = Field(default=None, alias="readPath")


PortEventKind = Literal["terminal.output", "terminal.exited", "surface.open"]

AnyPortEvent = Annotated[
    TerminalOutputEvent | TerminalExitedEvent | SurfaceOpenEvent,
    Field(discriminator="kind"),
]
