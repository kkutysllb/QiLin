"""Remote sandbox backend — delegates Pod lifecycle to the provisioner service.

The provisioner dynamically creates per-sandbox-id Pods + NodePort Services
in k3s.  The backend accesses sandbox pods directly via ``k3s:{NodePort}``.

Architecture:
    ┌────────────┐  HTTP   ┌─────────────┐  K8s API  ┌──────────┐
    │ this file  │ ──────▸ │ provisioner │ ────────▸ │   k3s    │
    │ (backend)  │         │ :8002       │           │ :6443    │
    └────────────┘         └─────────────┘           └─────┬────┘
                                                           │ creates
                           ┌─────────────┐           ┌─────▼──────┐
                           │   backend   │ ────────▸ │  sandbox   │
                           │             │  direct   │  Pod(s)    │
                           └─────────────┘ k3s:NPort └────────────┘
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from qilin.runtime.user_context import get_effective_user_id
from qilin.skills.storage import user_should_see_legacy_skills

from .backend import SandboxBackend
from .sandbox_info import SandboxInfo

logger = logging.getLogger(__name__)

_PROVISIONER_EXTRA_MOUNT_PATHS = {
    "/mnt/acp-workspace",
    "/mnt/skills/custom",
    "/mnt/skills/integrations",
    "/mnt/integrations/lark-cli/config",
    "/mnt/integrations/lark-cli/data",
    "/mnt/integrations/lark-cli/runtime",
}

_LARK_CLI_RUNTIME_CONTAINER_PATH = "/mnt/integrations/lark-cli/runtime"
_LARK_CLI_CONFIG_CONTAINER_PATH = "/mnt/integrations/lark-cli/config"
_LARK_CLI_DATA_CONTAINER_PATH = "/mnt/integrations/lark-cli/data"

# Per-call HTTP timeouts. ``httpx.Client(timeout=...)`` would apply globally;
# we keep per-operation budgets here so a slow create can't starve a fast poll.
_PROVISIONER_LIST_TIMEOUT = httpx.Timeout(10.0, connect=5.0)
_PROVISIONER_CREATE_TIMEOUT = httpx.Timeout(30.0, connect=5.0)
_PROVISIONER_DESTROY_TIMEOUT = httpx.Timeout(15.0, connect=5.0)
_PROVISIONER_HEALTH_TIMEOUT = httpx.Timeout(10.0, connect=5.0)


def _provisioner_extra_mounts_payload(
    extra_mounts: list[tuple[str, str, bool]] | None,
    *,
    provision_lark_cli_runtime: bool = False,
    provision_lark_cli_broker: bool = False,
) -> list[dict[str, object]]:
    """Return only extra mounts the provisioner knows how to recreate safely.

    When ``provision_lark_cli_runtime`` is set, the provisioner supplies the
    lark-cli runtime via an init container + emptyDir, so the runtime extra mount
    is dropped here to avoid a colliding hostPath/PVC mount at the same path. The
    per-user config/data credential mounts are still forwarded (they are mounted
    into the sandbox in Pattern A).

    When ``provision_lark_cli_broker`` is set (Pattern B, issue #4338), the
    provisioner runs a broker sidecar that holds the credentials, so the
    config/data mounts are **forwarded** (the provisioner wires them into the
    sidecar, not the sandbox) while the runtime mount is dropped. Nothing changes
    in this payload beyond keeping config/data available for the provisioner to
    place; the runtime entry is dropped in both modes.
    """
    if not extra_mounts:
        return []

    drop_runtime = provision_lark_cli_runtime or provision_lark_cli_broker

    payload: list[dict[str, object]] = []
    for host_path, container_path, read_only in extra_mounts:
        if container_path not in _PROVISIONER_EXTRA_MOUNT_PATHS:
            continue
        if drop_runtime and container_path == _LARK_CLI_RUNTIME_CONTAINER_PATH:
            continue
        payload.append(
            {
                "host_path": host_path,
                "container_path": container_path,
                "read_only": read_only,
            }
        )
    return payload


class RemoteSandboxBackend(SandboxBackend):
    """Backend that delegates sandbox lifecycle to the provisioner service.

    All Pod creation, destruction, and discovery are handled by the
    provisioner.  This backend is a thin HTTP client.

    Typical config.yaml::

        sandbox:
          use: qilin.community.aio_sandbox:AioSandboxProvider
          provisioner_url: http://provisioner:8002
          provisioner_api_key: $PROVISIONER_API_KEY
    """

    def __init__(self, provisioner_url: str, api_key: str = ""):
        """Initialize with the provisioner service URL and optional API key.

        Args:
            provisioner_url: URL of the provisioner service
                             (e.g., ``http://provisioner:8002``).
            api_key: Value sent as ``X-API-Key`` header on every request.
                     Leave empty to send no authentication header.
        """
        self._provisioner_url = provisioner_url.rstrip("/")
        self._api_key = api_key
        # Reuse a single sync HTTP client across calls — requests forked a new
        # TCP/TLS connection per call which added 100-300 ms of handshake on
        # every provisioner round-trip. Per-call timeouts (10/15/30s) live in
        # the helpers below as ``_PROVISIONER_*_TIMEOUT`` so we don't ship a
        # single global 30s timeout for short polls.
        self._provisioner_client = httpx.Client(
            headers={"User-Agent": "qilin-aio-sandbox/1.0"},
        )

    @property
    def provisioner_url(self) -> str:
        return self._provisioner_url

    def _auth_headers(self) -> dict[str, str]:
        return {"X-API-Key": self._api_key} if self._api_key else {}

    # ── SandboxBackend interface ──────────────────────────────────────────

    def create(
        self,
        thread_id: str | None,
        sandbox_id: str,
        extra_mounts: list[tuple[str, str, bool]] | None = None,
        *,
        user_id: str | None = None,
        provision_lark_cli_runtime: bool = False,
        provision_lark_cli_broker: bool = False,
    ) -> SandboxInfo:
        """Create a sandbox Pod + Service via the provisioner.

        Calls ``POST /api/sandboxes`` which creates a dedicated Pod +
        NodePort Service in k3s.
        """
        return self._provisioner_create(
            thread_id,
            sandbox_id,
            extra_mounts,
            user_id=user_id,
            provision_lark_cli_runtime=provision_lark_cli_runtime,
            provision_lark_cli_broker=provision_lark_cli_broker,
        )

    def destroy(self, info: SandboxInfo) -> None:
        """Destroy a sandbox Pod + Service via the provisioner."""
        self._provisioner_destroy(info.sandbox_id)

    def is_alive(self, info: SandboxInfo) -> bool:
        """Check whether the sandbox Pod is running."""
        return self._provisioner_is_alive(info.sandbox_id)

    def discover(self, sandbox_id: str) -> SandboxInfo | None:
        """Discover an existing sandbox via the provisioner.

        Calls ``GET /api/sandboxes/{sandbox_id}`` and returns info if
        the Pod exists.
        """
        return self._provisioner_discover(sandbox_id)

    def list_running(self) -> list[SandboxInfo]:
        """Return all sandboxes currently managed by the provisioner.

        Calls ``GET /api/sandboxes`` so that ``AioSandboxProvider._reconcile_orphans()``
        can adopt pods that were created by a previous process and were never
        explicitly destroyed.
        Without this, a process restart silently orphans all existing k8s Pods —
        they stay running forever because the idle checker only
        tracks in-process state.
        """
        return self._provisioner_list()

    # ── Provisioner API calls ─────────────────────────────────────────────

    def _provisioner_list(self) -> list[SandboxInfo]:
        """GET /api/sandboxes → list all running sandboxes."""
        try:
            resp = self._provisioner_client.get(
                f"{self._provisioner_url}/api/sandboxes",
                headers=self._auth_headers(),
                timeout=_PROVISIONER_LIST_TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
            if not isinstance(data, dict):
                logger.warning(
                    "Provisioner list_running returned non-dict payload: %r", type(data)
                )
                return []

            sandboxes = data.get("sandboxes", [])
            if not isinstance(sandboxes, list):
                logger.warning(
                    "Provisioner list_running returned non-list sandboxes: %r",
                    type(sandboxes),
                )
                return []

            infos: list[SandboxInfo] = []
            for sandbox in sandboxes:
                if not isinstance(sandbox, dict):
                    logger.warning(
                        "Provisioner list_running entry is not a dict: %r",
                        type(sandbox),
                    )
                    continue

                sandbox_id = sandbox.get("sandbox_id")
                sandbox_url = sandbox.get("sandbox_url")
                if (
                    isinstance(sandbox_id, str)
                    and sandbox_id
                    and isinstance(sandbox_url, str)
                    and sandbox_url
                ):
                    infos.append(
                        SandboxInfo(sandbox_id=sandbox_id, sandbox_url=sandbox_url)
                    )

            logger.info("Provisioner list_running: %d sandbox(es) found", len(infos))
            return infos
        except httpx.HTTPError as exc:
            logger.warning("Provisioner list_running failed: %s", exc)
            return []

    def _provisioner_create(
        self,
        thread_id: str | None,
        sandbox_id: str,
        extra_mounts: list[tuple[str, str, bool]] | None = None,
        *,
        user_id: str | None = None,
        provision_lark_cli_runtime: bool = False,
        provision_lark_cli_broker: bool = False,
    ) -> SandboxInfo:
        """POST /api/sandboxes → create Pod + Service."""
        effective_user_id = user_id or get_effective_user_id()
        include_legacy_skills = user_should_see_legacy_skills(effective_user_id)
        payload: dict[str, Any] = {
            "sandbox_id": sandbox_id,
            "thread_id": thread_id,
            "user_id": effective_user_id,
            "include_legacy_skills": include_legacy_skills,
            "provision_lark_cli_runtime": provision_lark_cli_runtime,
            "provision_lark_cli_broker": provision_lark_cli_broker,
        }
        provisioner_extra_mounts = _provisioner_extra_mounts_payload(
            extra_mounts,
            provision_lark_cli_runtime=provision_lark_cli_runtime,
            provision_lark_cli_broker=provision_lark_cli_broker,
        )
        if provisioner_extra_mounts:
            payload["extra_mounts"] = provisioner_extra_mounts
        try:
            resp = self._provisioner_client.post(
                f"{self._provisioner_url}/api/sandboxes",
                json=payload,
                headers=self._auth_headers(),
                timeout=_PROVISIONER_CREATE_TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
            logger.info(
                f"Provisioner created sandbox {sandbox_id}: sandbox_url={data['sandbox_url']}"
            )
            return SandboxInfo(
                sandbox_id=sandbox_id,
                sandbox_url=data["sandbox_url"],
            )
        except httpx.HTTPError as exc:
            logger.error(f"Provisioner create failed for {sandbox_id}: {exc}")
            raise RuntimeError(f"Provisioner create failed: {exc}") from exc

    def _provisioner_destroy(self, sandbox_id: str) -> None:
        """DELETE /api/sandboxes/{sandbox_id} → destroy Pod + Service."""
        try:
            resp = self._provisioner_client.delete(
                f"{self._provisioner_url}/api/sandboxes/{sandbox_id}",
                headers=self._auth_headers(),
                timeout=_PROVISIONER_DESTROY_TIMEOUT,
            )
            if resp.status_code < 400:
                logger.info(f"Provisioner destroyed sandbox {sandbox_id}")
            else:
                logger.warning(
                    f"Provisioner destroy returned {resp.status_code}: {resp.text}"
                )
        except httpx.HTTPError as exc:
            logger.warning(f"Provisioner destroy failed for {sandbox_id}: {exc}")

    def _provisioner_is_alive(self, sandbox_id: str) -> bool:
        """GET /api/sandboxes/{sandbox_id} → check Pod phase."""
        try:
            resp = self._provisioner_client.get(
                f"{self._provisioner_url}/api/sandboxes/{sandbox_id}",
                headers=self._auth_headers(),
                timeout=_PROVISIONER_HEALTH_TIMEOUT,
            )
        except httpx.HTTPError as exc:
            raise RuntimeError(
                f"Provisioner health check failed for {sandbox_id}: {exc}"
            ) from exc

        if resp.status_code == 404:
            return False
        if resp.status_code >= 400:
            raise RuntimeError(
                f"Provisioner health check failed for {sandbox_id}: HTTP {resp.status_code} {resp.text}"
            )

        data = resp.json()
        return data.get("status") == "Running"

    def _provisioner_discover(self, sandbox_id: str) -> SandboxInfo | None:
        """GET /api/sandboxes/{sandbox_id} → discover existing sandbox."""
        try:
            resp = self._provisioner_client.get(
                f"{self._provisioner_url}/api/sandboxes/{sandbox_id}",
                headers=self._auth_headers(),
                timeout=_PROVISIONER_HEALTH_TIMEOUT,
            )
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            data = resp.json()
            return SandboxInfo(
                sandbox_id=sandbox_id,
                sandbox_url=data["sandbox_url"],
            )
        except httpx.HTTPError as exc:
            logger.debug(f"Provisioner discover failed for {sandbox_id}: {exc}")
            return None
