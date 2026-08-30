import logging
from pathlib import Path
from typing import NotRequired, override

from langchain.agents import AgentState
from langchain.agents.middleware import AgentMiddleware
from langchain_core.messages import HumanMessage
from langgraph.config import get_config
from langgraph.runtime import Runtime

from qilin.agents.thread_state import ThreadDataState
from qilin.config.paths import Paths, get_paths
from qilin.runtime.user_context import resolve_runtime_user_id
from qilin.utils.time import now_iso

logger = logging.getLogger(__name__)


class ThreadDataMiddlewareState(AgentState):
    """Compatible with the `ThreadState` schema."""

    thread_data: NotRequired[ThreadDataState | None]


class ThreadDataMiddleware(AgentMiddleware[ThreadDataMiddlewareState]):
    """Create thread data directories for each thread execution.

    Creates the following directory structure:
    - {base_dir}/threads/{thread_id}/user-data/workspace
    - {base_dir}/threads/{thread_id}/user-data/uploads
    - {base_dir}/threads/{thread_id}/user-data/outputs

    Lifecycle Management:
    - With lazy_init=True (default): Only compute paths, directories created on-demand
    - With lazy_init=False: Eagerly create directories in before_agent()
    """

    state_schema = ThreadDataMiddlewareState

    def __init__(self, base_dir: str | None = None, lazy_init: bool = True):
        """Initialize the middleware.

        Args:
            base_dir: Base directory for thread data. Defaults to Paths resolution.
            lazy_init: If True, defer directory creation until needed.
                      If False, create directories eagerly in before_agent().
                      Default is True for optimal performance.
        """
        super().__init__()
        self._paths = Paths(base_dir) if base_dir else get_paths()
        self._lazy_init = lazy_init

    def _get_thread_paths(self, thread_id: str, user_id: str | None = None) -> dict[str, str]:
        """Get the paths for a thread's data directories.

        Args:
            thread_id: The thread ID.
            user_id: Optional user ID for per-user path isolation.

        Returns:
            Dictionary with workspace_path, uploads_path, and outputs_path.
        """
        return {
            "workspace_path": str(self._paths.sandbox_work_dir(thread_id, user_id=user_id)),
            "uploads_path": str(self._paths.sandbox_uploads_dir(thread_id, user_id=user_id)),
            "outputs_path": str(self._paths.sandbox_outputs_dir(thread_id, user_id=user_id)),
        }

    def _create_thread_directories(self, thread_id: str, user_id: str | None = None) -> dict[str, str]:
        """Create the thread data directories.

        Args:
            thread_id: The thread ID.
            user_id: Optional user ID for per-user path isolation.

        Returns:
            Dictionary with the created directory paths.
        """
        self._paths.ensure_thread_dirs(thread_id, user_id=user_id)
        return self._get_thread_paths(thread_id, user_id=user_id)

    @override
    def before_agent(self, state: ThreadDataMiddlewareState, runtime: Runtime) -> dict | None:
        context = runtime.context or {}
        thread_id = context.get("thread_id")
        if thread_id is None:
            config = get_config()
            thread_id = config.get("configurable", {}).get("thread_id")

        if thread_id is None:
            raise ValueError("Thread ID is required in runtime context or config.configurable")

        user_id = resolve_runtime_user_id(runtime)

        if self._lazy_init:
            # Lazy initialization: only compute paths, don't create directories
            paths = self._get_thread_paths(thread_id, user_id=user_id)
        else:
            # Eager initialization: create directories immediately
            paths = self._create_thread_directories(thread_id, user_id=user_id)
            logger.debug("Created thread data directories for thread %s", thread_id)

        # Registry-bound threads execute against their REAL external directory:
        # the gateway injects ``workspace_cwd`` (server-owned; resolved through
        # the per-user registry, so a client cannot point it anywhere). When it
        # names an existing directory we anchor ``workspace_path`` there and
        # keep uploads/outputs on the per-thread staging area. Anything else —
        # missing key (legacy/unbound), nonexistent path — degrades silently
        # to the staging default.
        # Folded sandbox policy rides the same server-owned channel: the
        # gateway resolves it from the per-thread event log, so tools can
        # gate mutating calls without touching persistence from the agent
        # process. Absent → treated as danger-full-access (legacy default).
        paths = {**paths, "sandbox_mode": context.get("sandbox_mode") or ""}
        workspace_cwd = context.get("workspace_cwd")
        if isinstance(workspace_cwd, str) and workspace_cwd:
            try:
                real_dir = Path(workspace_cwd)
                if real_dir.is_dir():
                    paths = {**paths, "workspace_path": str(real_dir)}
                else:
                    logger.warning(
                        "workspace_cwd %s does not exist; falling back to staging",
                        workspace_cwd,
                    )
            except OSError:
                logger.warning(
                    "workspace_cwd %s is not usable; falling back to staging",
                    workspace_cwd,
                    exc_info=True,
                )

        messages = list(state.get("messages", []))
        last_message = messages[-1] if messages else None

        if last_message and isinstance(last_message, HumanMessage):
            messages[-1] = HumanMessage(
                content=last_message.content,
                id=last_message.id,
                name=last_message.name or "user-input",
                additional_kwargs={**last_message.additional_kwargs, "run_id": context.get("run_id"), "timestamp": now_iso()},
            )

        return {
            "thread_data": {
                **paths,
            },
            "messages": messages,
        }
