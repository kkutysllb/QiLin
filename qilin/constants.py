"""Shared runtime protocol constants."""

DEFAULT_SKILLS_CONTAINER_PATH = "/mnt/skills"

# Hidden subdirectory (under a thread's outputs dir) that holds the browser
# tools' per-step screenshots. These are transient live-progress frames, not
# deliverables, so the workspace-changes scanner excludes this directory. Both
# the browser tools (which write here) and the scanner (which ignores it) import
# this single source of truth so the name cannot drift between them.
BROWSER_FRAMES_DIRNAME = ".browser-frames"

# Persisted run-event envelope limits. Runtime definitions and the ORM both
# import these from this dependency-free module so lower layers never need to
# initialize qilin.runtime just to validate storage constraints.
RUN_EVENT_TYPE_MAX_LENGTH = 32
RUN_EVENT_CATEGORY_MAX_LENGTH = 16

# Workspace changes are produced below the runtime layer, so their persisted
# event identity also lives here rather than in the runtime event catalog.
WORKSPACE_CHANGES_EVENT_TYPE = "workspace_changes"
WORKSPACE_CHANGES_EVENT_CATEGORY = "workspace"

# Message-metadata key marking an AI/tool message as internal model context
# that must never surface in the end-user UI. Producers set it in
# ``additional_kwargs``; the gateway, serialization, journal, and memory
# backends all read it. Single source of truth so the wire key cannot drift.
HIDE_FROM_UI_KEY = "hide_from_ui"

# Default gateway endpoint shared by the gateway routes, the auth router's
# Host-header fallback, and the embedded channel worker. The bare host:port
# form exists because SSO redirect construction needs it without a scheme.
DEFAULT_GATEWAY_HOST = "localhost:8001"
DEFAULT_GATEWAY_URL = f"http://{DEFAULT_GATEWAY_HOST}"
DEFAULT_LANGGRAPH_URL = f"{DEFAULT_GATEWAY_URL}/api"

# Terminal fallback of the Redis URL resolution chain shared by the stream
# bridge and sandbox ownership (QILIN_*_REDIS_URL → REDIS_URL → this).
DEFAULT_REDIS_URL = "redis://localhost:6379/0"
