"""Monotonic capability list of the ports protocol.

Mirrors the DSH service `features` contract: capabilities are only ever
appended, never removed or renamed, and consumers gate new API usage on
membership rather than on version comparisons. A host that does not
implement a capability simply omits it; an old consumer ignores unknown
entries.

Rules for contributors: adding an entry is a minor change; removing,
renaming, or repurposing one is a protocol break and forbidden.
"""

PORT_CAPABILITIES: tuple[str, ...] = (
    # The eight terminal_* tools with their full contract (clamps, byte
    # bounds, wait_for discriminated results).
    "terminal.basic",
    # Live output push for attached surfaces (WS binary frames and/or
    # terminal.output events). Without this, surfaces poll via read.
    "terminal.stream",
    # Surface opens: file / folder / url via the sidebar_open contract.
    "surface.open",
    # Opens queue while a session surface is detached; the tool result
    # reports delivered=False instead of failing.
    "surface.queue",
)

# Capabilities shipped after v1 append below this line — never above it.


def supports(features: list[str] | tuple[str, ...] | frozenset[str], required: str) -> bool:
    """Whether a capability set advertises `required`."""
    return required in features
