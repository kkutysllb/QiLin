"""Native directory picker for the web client (DSH ``host.pickDirectory`` alignment).

The gateway runs on the user's machine, so the backend can open the OS's
native folder chooser on the client's behalf — the same trust model DSH
uses. The dialog blocks on the user's interaction, so callers get a
generous timeout and an explicit ``cancelled`` result.
"""

from __future__ import annotations

import asyncio
import shutil
import sys
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/fs", tags=["fs"])

# The dialog can stay open as long as the user pleases; this only guards
# against a wedged helper process.
_PICK_TIMEOUT_SECONDS = 600


class PickDirectoryResult(BaseModel):
    path: str | None = None
    cancelled: bool = False


async def _run_command(args: list[str], timeout: float) -> str | None:
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except TimeoutError:
        proc.kill()
        raise
    if proc.returncode != 0:
        return None
    return stdout.decode("utf-8", "replace").strip()


def _platform_command() -> list[str]:
    if sys.platform == "darwin":
        # NSOpenPanel via AppleScript: native look, includes "New Folder".
        return [
            "osascript",
            "-e",
            'POSIX path of (choose folder with prompt "Select Workspace Directory")',
        ]
    if sys.platform.startswith("linux"):
        for argv in (
            ["zenity", "--file-selection", "--directory", "--title=Select Workspace Directory"],
            ["kdialog", "--getexistingdirectory", "~", "--title", "Select Workspace Directory"],
        ):
            if shutil.which(argv[0]):
                return argv
        raise RuntimeError("no directory picker available (install zenity or kdialog)")
    if sys.platform == "win32":
        return [
            "powershell",
            "-NoProfile",
            "-Command",
            (
                "Add-Type -AssemblyName System.Windows.Forms;"
                "$d=New-Object System.Windows.Forms.FolderBrowserDialog;"
                "$d.Description='Select Workspace Directory';"
                "if($d.ShowDialog()-eq 'OK'){$d.SelectedPath}"
            ),
        ]
    raise RuntimeError(f"directory picker unsupported on {sys.platform}")


@router.post("/pick-directory", response_model=PickDirectoryResult)
async def pick_directory() -> dict[str, Any]:
    """Open the OS directory chooser and return the absolute picked path."""
    try:
        argv = _platform_command()
    except RuntimeError as exc:
        return {"path": None, "cancelled": False, "error": str(exc)}
    try:
        raw = await _run_command(argv, _PICK_TIMEOUT_SECONDS)
    except Exception:
        return {"path": None, "cancelled": False, "error": "picker failed"}
    # Every helper prints the chosen path; empty output = user cancelled.
    if not raw:
        return {"path": None, "cancelled": True}
    return {"path": raw, "cancelled": False}
