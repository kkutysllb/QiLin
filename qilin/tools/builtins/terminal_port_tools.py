"""Model-facing terminal tools over the QiLin terminal port.

Eight tools mirroring the DSH terminal_* vocabulary verbatim - same names,
same argument spellings, same camelCase JSON results - so prompts and
skills written against the DSH tool contract transfer unchanged. The wire
contracts live in qilin.ports.protocol.terminal; execution goes through
the process-wide TerminalRegistry singleton (get_default_registry), keyed
by the calling thread id (the ownership scope; never client-supplied).

Enabling follows the platform's config-driven tool registry: add entries
to config.yaml's tools list pointing at these objects, e.g.

    - name: terminal_create
      group: ports
      use: qilin.tools.builtins.terminal_port_tools:terminal_create_tool

tmux-like semantics (spawn-and-detach): terminals outlive the creating
call and every verb keys on the opaque uuid returned by terminal_create.
"""

import json
from typing import Any

from langchain.tools import tool
from langgraph.config import get_config

from qilin.ports.errors import PortError
from qilin.ports.terminal import get_default_registry
from qilin.tools.types import Runtime


def _get_thread_id(runtime: Runtime) -> str | None:
    """Resolve the current thread id from runtime context or RunnableConfig."""
    thread_id = runtime.context.get("thread_id") if runtime.context else None
    if thread_id:
        return thread_id
    runtime_config = getattr(runtime, "config", None) or {}
    thread_id = runtime_config.get("configurable", {}).get("thread_id")
    if thread_id:
        return thread_id
    try:
        return get_config().get("configurable", {}).get("thread_id")
    except RuntimeError:
        return None


def _owner(runtime: Runtime) -> str:
    """Resolve the ownership scope, or raise the canonical error."""
    thread_id = _get_thread_id(runtime)
    if not thread_id:
        raise PortError("bad-request", "thread id is not available in this runtime")
    return thread_id


def _render(value: Any) -> str:
    """Canonical JSON projection (camelCase, DSH wire-compatible)."""
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


@tool("terminal_create", parse_docstring=True)
async def terminal_create_tool(runtime: Runtime, title: str, command: str = "") -> str:
    """Open a persistent terminal in the sidebar and run a command in it.

    Spawns an interactive shell, writes the command + Enter to its stdin,
    and returns a uuid handle. The terminal stays alive after the command
    exits - send more input with terminal_send (set submit=true to run a
    command), read output with terminal_read, send Ctrl+C with
    terminal_signal(signal="SIGINT"), and close it with terminal_close
    when done. Use this for interactive shells, REPLs, long-running dev
    servers, or any work that needs persistent terminal state across tool
    calls.

    Args:
        title: Short human-readable label for the terminal tab (e.g. "dev
            server", "python repl").
        command: Shell command to run in the freshly spawned shell. The
            host appends an Enter key automatically - do NOT include a
            trailing newline. Pass "" to open a bare shell with no
            command.
    """
    try:
        owner = _owner(runtime)
        terminal_uuid = await get_default_registry().create(owner, title, command=command)
    except PortError as exc:
        return f"Error: {exc.message}"
    return _render({"uuid": terminal_uuid, "title": title})


@tool("terminal_list", parse_docstring=True)
async def terminal_list_tool(runtime: Runtime) -> str:
    """List every terminal the current agent has opened in this session.

    Returns each terminal's uuid, title, the command it was started with,
    and whether the top-level process has exited (with exit code/signal if
    so). Use this to recover state after a long sequence of tool calls or
    to find a terminal you forgot to close.
    """
    try:
        owner = _owner(runtime)
        snapshots = get_default_registry().list(owner)
    except PortError as exc:
        return f"Error: {exc.message}"
    return _render([snapshot.model_dump(by_alias=True) for snapshot in snapshots])


@tool("terminal_send", parse_docstring=True)
async def terminal_send_tool(
    runtime: Runtime,
    uuid: str,
    text: str,
    submit: bool = False,
) -> str:
    """Send raw text (keystrokes) to a terminal - tmux send-keys semantics.

    The text is written verbatim to the pty stdin. To submit a command,
    set submit=true (appends an Enter key); do NOT put newline characters
    in the text yourself. To send Ctrl+C use terminal_signal with
    signal="SIGINT" - do not send control characters as text. This tool
    does NOT wait for output; pair it with terminal_read or
    terminal_wait_for.

    Args:
        uuid: Terminal uuid from terminal_create or terminal_list.
        text: UTF-8 text to write to the terminal stdin (verbatim, no
            shell escaping).
        submit: Append an Enter key after the text (default false).
    """
    try:
        owner = _owner(runtime)
        written = get_default_registry().send(uuid, owner, text, submit=submit)
    except PortError as exc:
        return f"Error: {exc.message}"
    return _render({"uuid": uuid, "bytes": written})


@tool("terminal_read", parse_docstring=True)
async def terminal_read_tool(
    runtime: Runtime,
    uuid: str,
    offset: int = 0,
    count: int = 500,
) -> str:
    """Read a bounded page of retained terminal output without input.

    The host keeps up to ~1 MiB of scrollback; this tool returns up to 500
    lines per call, bounded to 256 KiB. Use offset to paginate forward
    (0-based from the start) or backward (negative reads from the end,
    e.g. -50 reads the last 50 lines). Returns totalLines so you know how
    much scrollback remains.

    Args:
        uuid: Terminal uuid from terminal_create or terminal_list.
        offset: 0-based line offset from the start; negative reads from
            the end.
        count: Maximum lines to return (default 500, hard cap 500).
    """
    try:
        owner = _owner(runtime)
        result = get_default_registry().read(uuid, owner, offset=offset, count=count)
    except PortError as exc:
        return f"Error: {exc.message}"
    return _render(result.model_dump(by_alias=True))


@tool("terminal_wait_for", parse_docstring=True)
async def terminal_wait_for_tool(
    runtime: Runtime,
    uuid: str,
    needle: str,
    timeout_ms: int = 10000,
) -> str:
    """Block until a substring appears in a terminal's transcript.

    Waits until the needle appears, the timeout elapses, or the terminal
    exits - whichever happens first. Use this to synchronize on command
    completion cues (a shell prompt, "done", "Listening on", "Build
    successful") without busy-polling terminal_read. Default timeout is
    10 seconds; raise it for long-running commands. Cancelling the tool
    call aborts the wait immediately.

    Args:
        uuid: Terminal uuid from terminal_create or terminal_list.
        needle: Substring to wait for (case-sensitive, verbatim). Must be
            non-empty.
        timeout_ms: Maximum wait in milliseconds (default 10000, minimum
            100).
    """
    try:
        owner = _owner(runtime)
        result = await get_default_registry().wait_for(
            uuid, owner, needle, timeout_ms=timeout_ms
        )
    except PortError as exc:
        return f"Error: {exc.message}"
    return _render(result.model_dump(by_alias=True))


@tool("terminal_resize", parse_docstring=True)
async def terminal_resize_tool(runtime: Runtime, uuid: str, cols: int, rows: int) -> str:
    """Resize a terminal's pty (cols x rows).

    The host clamps both to a 2..1024 sane range. Most shells redraw
    their prompt and any full-screen TUI on the next output frame. No-op
    if the terminal has exited. Returns the dimensions actually applied.

    Args:
        uuid: Terminal uuid from terminal_create or terminal_list.
        cols: New column count (clamped to 2..1024).
        rows: New row count (clamped to 2..1024).
    """
    try:
        owner = _owner(runtime)
        applied = get_default_registry().resize(uuid, owner, cols, rows)
    except PortError as exc:
        return f"Error: {exc.message}"
    return _render({"uuid": uuid, "cols": applied[0], "rows": applied[1]})


@tool("terminal_signal", parse_docstring=True)
async def terminal_signal_tool(runtime: Runtime, uuid: str, signal: str) -> str:
    """Send a POSIX signal to a terminal's foreground process.

    Use signal="SIGINT" for Ctrl+C, "SIGTERM" to request termination,
    "SIGKILL" to force-kill the pty, "SIGHUP" to hang up, "SIGTSTP" for
    Ctrl+Z. Do NOT send control characters (like the ETX byte) through
    terminal_send - use this tool. On Windows only SIGKILL and SIGTERM
    are effective; others are accepted but may no-op. No-op after exit.

    Args:
        uuid: Terminal uuid from terminal_create or terminal_list.
        signal: One of SIGINT | SIGTERM | SIGKILL | SIGHUP | SIGTSTP.
    """
    try:
        owner = _owner(runtime)
        get_default_registry().signal(uuid, owner, signal)
    except PortError as exc:
        return f"Error: {exc.message}"
    return _render({"uuid": uuid, "signal": signal})


@tool("terminal_close", parse_docstring=True)
async def terminal_close_tool(runtime: Runtime, uuid: str) -> str:
    """Close a terminal and release its process.

    The uuid becomes invalid for all subsequent tool calls. Idempotent:
    closing an already-closed uuid is a no-op reporting closed=false.
    Always close terminals you no longer need - the host keeps the pty
    alive until you do.

    Args:
        uuid: Terminal uuid from terminal_create or terminal_list.
    """
    try:
        owner = _owner(runtime)
        closed = await get_default_registry().close(uuid, owner)
    except PortError as exc:
        return f"Error: {exc.message}"
    return _render({"uuid": uuid, "closed": closed})


#: All eight terminal tools, in registration order (config tools lists
#: reference these objects individually).
TERMINAL_PORT_TOOLS = [
    terminal_create_tool,
    terminal_list_tool,
    terminal_send_tool,
    terminal_read_tool,
    terminal_wait_for_tool,
    terminal_resize_tool,
    terminal_signal_tool,
    terminal_close_tool,
]

__all__ = [
    "TERMINAL_PORT_TOOLS",
    "terminal_close_tool",
    "terminal_create_tool",
    "terminal_list_tool",
    "terminal_read_tool",
    "terminal_resize_tool",
    "terminal_send_tool",
    "terminal_signal_tool",
    "terminal_wait_for_tool",
]
