"""Model-facing sidebar_open tool over the QiLin surface port.

Mirrors the DSH sidebar_open contract verbatim: same name, same argument
and result shapes (kind/target/title/delivered), same queueing semantics.
Target resolution (URL classification, workspace-relative -> cwd fallback,
existence check) lives in the shared qilin.ports.surface.open_surface
helper so the gateway REST route speaks identical policy.

Enablement follows the platform's config-driven tool registry:

    - name: sidebar_open
      group: ports
      use: qilin.tools.builtins.sidebar_open_tool:sidebar_open_tool
"""

import json

from langchain.tools import tool
from langgraph.config import get_config

from qilin.ports.errors import PortError
from qilin.ports.protocol.surface import SURFACE_OPEN_TOOL_NAME
from qilin.ports.surface import open_surface
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


def _render(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


@tool(SURFACE_OPEN_TOOL_NAME, parse_docstring=True)
async def sidebar_open_tool(runtime: Runtime, target: str, title: str = "") -> str:
    """Open a local file, a local folder, or an HTTP(S) page in the sidebar of the calling conversation.

    A file opens in the sidebar viewer (per-path dedupe: an already-open
    file is focused); a folder opens a file window rooted at that folder;
    a URL opens in a sandboxed frame. The panel auto-attaches for content
    opens and the tab title defaults to the file/folder name or the URL
    hostname. The path may be absolute or relative to the session working
    directory. While the session's sidebar is not connected the open is
    queued and delivered when it is next shown - the result reports
    delivered so you know whether it is visible right now.

    Args:
        target: Absolute or session-cwd-relative local path, or an
            http(s):// URL.
        title: Optional tab title (defaults to the file/folder name or the
            URL hostname). Pass "" to use the default.
    """
    thread_id = _get_thread_id(runtime)
    if not thread_id:
        return "Error: thread id is not available in this runtime"
    try:
        result = await open_surface(thread_id, target, title)
    except PortError as exc:
        return f"Error: {exc.message}"
    return _render(result.model_dump(by_alias=True))


__all__ = ["sidebar_open_tool"]
