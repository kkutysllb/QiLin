"""Wire contracts of the QiLin ports protocol (DSH-compatible).

This package is the machine-readable mirror of the de-facto DSH protocol:
the eight terminal_* tools, the sidebar_open surface tool, the
server-to-client event catalog, and the monotonic capability list. It is
intentionally dependency-light (pydantic only) so the spec can be shared
with other hosts later.

Fidelity rules (do not "fix" these — they ARE the protocol):

- Tool names and argument spellings match DSH verbatim, including the
  mixed convention (terminal_wait_for takes snake_case timeout_ms while
  every result is camelCase).
- Result models serialize via model_dump(by_alias=True) to the exact DSH
  field names.
- extra="forbid" mirrors the DSH schemas' additionalProperties: false.
"""

from qilin.ports.protocol.capabilities import PORT_CAPABILITIES, supports
from qilin.ports.protocol.events import (
    AnyPortEvent,
    PortEventKind,
    SurfaceOpenEvent,
    TerminalExitedEvent,
    TerminalOutputEvent,
)
from qilin.ports.protocol.surface import (
    SURFACE_OPEN_TOOL_NAME,
    SurfaceKind,
    SurfaceOpenArgs,
    SurfaceOpenResult,
    classify_target_kind,
)
from qilin.ports.protocol.terminal import (
    ALLOWED_SIGNALS,
    DEFAULT_READ_COUNT,
    DEFAULT_WAIT_MS,
    MAX_READ_COUNT,
    MIN_WAIT_MS,
    READ_BYTE_LIMIT,
    RESIZE_MAX,
    RESIZE_MIN,
    SCROLLBACK_BYTE_LIMIT,
    TERMINAL_TOOL_NAMES,
    TerminalCloseArgs,
    TerminalCloseResult,
    TerminalCreateArgs,
    TerminalCreateResult,
    TerminalListResult,
    TerminalReadArgs,
    TerminalReadResult,
    TerminalResizeArgs,
    TerminalResizeResult,
    TerminalSendArgs,
    TerminalSendResult,
    TerminalSignal,
    TerminalSignalArgs,
    TerminalSignalResult,
    TerminalSnapshot,
    TerminalWaitExited,
    TerminalWaitForArgs,
    TerminalWaitFound,
    TerminalWaitResult,
    TerminalWaitTimeout,
    bound_bytes,
)

__all__ = [
    "ALLOWED_SIGNALS",
    "AnyPortEvent",
    "DEFAULT_READ_COUNT",
    "DEFAULT_WAIT_MS",
    "MAX_READ_COUNT",
    "MIN_WAIT_MS",
    "PORT_CAPABILITIES",
    "PortEventKind",
    "READ_BYTE_LIMIT",
    "RESIZE_MAX",
    "RESIZE_MIN",
    "SCROLLBACK_BYTE_LIMIT",
    "SURFACE_OPEN_TOOL_NAME",
    "SurfaceKind",
    "SurfaceOpenArgs",
    "SurfaceOpenEvent",
    "SurfaceOpenResult",
    "TERMINAL_TOOL_NAMES",
    "TerminalCloseArgs",
    "TerminalCloseResult",
    "TerminalCreateArgs",
    "TerminalCreateResult",
    "TerminalExitedEvent",
    "TerminalListResult",
    "TerminalOutputEvent",
    "TerminalReadArgs",
    "TerminalReadResult",
    "TerminalResizeArgs",
    "TerminalResizeResult",
    "TerminalSendArgs",
    "TerminalSendResult",
    "TerminalSignal",
    "TerminalSignalArgs",
    "TerminalSignalResult",
    "TerminalSnapshot",
    "TerminalWaitExited",
    "TerminalWaitForArgs",
    "TerminalWaitFound",
    "TerminalWaitResult",
    "TerminalWaitTimeout",
    "bound_bytes",
    "classify_target_kind",
    "supports",
]
