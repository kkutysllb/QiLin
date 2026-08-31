"""Model-facing sidebar_open tool over the QiLin surface port.

Mirrors the DSH sidebar_open contract verbatim: same name, same argument
and result shapes (kind/target/title/delivered), same queueing semantics.
What it opens into is adapter-defined - the web-demo workspace panel is
the first attached surface; TUI/IM adapters degrade per their medium.

Enablement follows the platform's config-driven tool registry:

    - name: sidebar_open
      group: ports
      use: qilin.tools.builtins.sidebar_open_tool:sidebar_open_tool
"""

import json
from pathlib import Path
from urllib.parse import urlparse

from langchain.tools import tool
from langgraph.config import get_config

from qilin.ports.errors import PortError
from qilin.ports.protocol.surface import SURFACE_OPEN_TOOL_NAME
from qilin.ports.surface import get_default_surface_registry
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


def _default_title(kind: str, target: str) -> str:
    if kind == "url":
        return urlparse(target).hostname or target
    return Path(target).name or target


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

    from qilin.ports.protocol.surface import classify_target_kind

    kind = classify_target_kind(target)
    resolved = target
    if kind is None:
        # Filesystem target: resolve relative paths against the thread
        # workspace, then fall back to the process cwd; must exist.
        candidates = [Path(target)]
        if not target.startswith("/"):
            try:
                from qilin.config.paths import get_paths

                candidates.insert(0, get_paths().user_workspace_dir(thread_id) / target)
            except Exception:
                pass
        existing = next((c for c in candidates if c.exists()), None)
        if existing is None:
            return f"Error: target does not exist: {target}"
        resolved = str(existing.resolve())
        kind = "folder" if existing.is_dir() else "file"

    final_title = title.strip() if title else _default_title(kind, resolved)
    try:
        result = await get_default_surface_registry().open(
            thread_id, kind, resolved, final_title
        )
    except PortError as exc:
        return f"Error: {exc.message}"
    return _render(result.model_dump(by_alias=True))


__all__ = ["sidebar_open_tool"]
