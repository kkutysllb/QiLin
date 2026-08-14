"""Tests for the native Playwright browser tools.

Playwright is mocked end to end — no real browser is launched and no network
is touched. The shared page provider (``_get_shared_page``) and the URL
validator's DNS resolver are patched, so URL policy, result formatting,
truncation, screenshot writing, error recovery, and graceful degradation are
all exercised without Playwright.
"""

import ipaddress
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

from qilin.config.app_config import AppConfig
from qilin.config.sandbox_config import SandboxConfig
from qilin.config.tool_config import ToolConfig
from qilin.tools.builtins import browser_tools
from qilin.tools.builtins.browser_tools import (
    browser_navigate_tool,
    browser_read_page_tool,
    browser_screenshot_tool,
)
from qilin.tools.tools import get_available_tools

PUBLIC_ADDRESS = ipaddress.ip_address("93.184.216.34")


class _FakeResponse:
    def __init__(self, status: int | None) -> None:
        self.status = status


class _FakePage:
    """Minimal stand-in for a Playwright ``Page``."""

    def __init__(
        self,
        *,
        title: str = "Example Domain",
        text: str = "Example page text",
        status: int | None = 200,
        url: str = "https://example.com/final",
        goto_error: Exception | None = None,
        settle_error: Exception | None = None,
    ) -> None:
        self.url = url
        self._title = title
        self._text = text
        self._status = status
        self._goto_error = goto_error
        self._settle_error = settle_error
        self.closed = False
        self.goto_calls: list[dict] = []
        self.screenshot_calls: list[dict] = []

    def is_closed(self) -> bool:
        return self.closed

    async def goto(self, url: str, wait_until: str | None = None, timeout: int | None = None) -> _FakeResponse | None:
        self.goto_calls.append({"url": url, "wait_until": wait_until, "timeout": timeout})
        if self._goto_error is not None:
            raise self._goto_error
        return _FakeResponse(self._status)

    async def wait_for_load_state(self, state: str | None = None, timeout: int | None = None) -> None:
        if self._settle_error is not None:
            raise self._settle_error

    async def title(self) -> str:
        return self._title

    async def inner_text(self, selector: str) -> str:
        assert selector == "body"
        return self._text

    async def screenshot(self, full_page: bool = False, type: str | None = None) -> bytes:
        self.screenshot_calls.append({"full_page": full_page, "type": type})
        return b"\x89PNG-fake-bytes"

    async def evaluate(self, script: str, *args: object) -> dict:
        return {"width": 1903, "height": 8452}

    async def close(self) -> None:
        self.closed = True


def _read_bytes(path: Path) -> bytes:
    return path.read_bytes()


def _exists(path: Path) -> bool:
    return path.exists()


def _remove(path: Path) -> None:
    path.unlink(missing_ok=True)


def _patch_shared_page(monkeypatch, page: _FakePage) -> _FakePage:
    """Serve *page* from the shared-browser provider and pass public DNS."""

    async def fake_get_page():
        return page

    def fake_resolver(hostname: str) -> list[ipaddress._BaseAddress]:
        return [PUBLIC_ADDRESS]

    monkeypatch.setattr(browser_tools, "_get_shared_page", fake_get_page)
    monkeypatch.setattr(browser_tools, "_resolve_host_addresses", fake_resolver)
    return page


# ---------------------------------------------------------------------------
# (a) URL validation
# ---------------------------------------------------------------------------


async def test_rejects_non_http_schemes():
    for url in ("ftp://example.com/file", "file:///etc/passwd", "javascript:alert(1)", "example.com/no-scheme"):
        result = await browser_navigate_tool.ainvoke({"url": url})
        assert result.startswith("Error: Only http:// and https:// URLs are supported"), url


async def test_rejects_private_and_metadata_targets():
    urls = (
        "http://localhost:8000/",
        "http://127.0.0.1/",
        "http://169.254.169.254/latest/meta-data/",
        "http://192.168.1.1/admin",
        "http://10.0.0.5/",
        "http://[::1]/",
    )
    for url in urls:
        result = await browser_navigate_tool.ainvoke({"url": url})
        assert result.startswith("Error: Refusing to browse"), url


def test_allow_private_addresses_config_and_env_precedence(monkeypatch):
    monkeypatch.setattr(browser_tools, "_get_tool_config", lambda name: {})
    monkeypatch.delenv("QILIN_BROWSER_ALLOW_PRIVATE_ADDRESSES", raising=False)
    assert browser_tools._allow_private_addresses("browser_navigate") is False
    monkeypatch.setenv("QILIN_BROWSER_ALLOW_PRIVATE_ADDRESSES", "true")
    assert browser_tools._allow_private_addresses("browser_navigate") is True
    # Explicit config wins over the env flag.
    monkeypatch.setattr(browser_tools, "_get_tool_config", lambda name: {"allow_private_addresses": True})
    monkeypatch.delenv("QILIN_BROWSER_ALLOW_PRIVATE_ADDRESSES", raising=False)
    assert browser_tools._allow_private_addresses("browser_navigate") is True


async def test_allow_private_addresses_opt_in_permits_loopback(monkeypatch):
    page = _FakePage()
    _patch_shared_page(monkeypatch, page)
    monkeypatch.setattr(browser_tools, "_allow_private_addresses", lambda tool_name: True)
    result = await browser_navigate_tool.ainvoke({"url": "http://127.0.0.1:8080/"})
    assert result.startswith("Title: Example Domain")


# ---------------------------------------------------------------------------
# (b) browser_navigate result formatting
# ---------------------------------------------------------------------------


async def test_browser_navigate_returns_title_status_and_final_url(monkeypatch):
    page = _patch_shared_page(monkeypatch, _FakePage())
    result = await browser_navigate_tool.ainvoke({"url": "https://example.com"})
    lines = result.splitlines()
    assert lines[0] == "Title: Example Domain"
    assert lines[1] == "Status: 200"
    assert lines[2] == "URL: https://example.com/final"
    assert page.goto_calls == [{"url": "https://example.com", "wait_until": "domcontentloaded", "timeout": browser_tools._NAV_TIMEOUT_MS}]


async def test_browser_navigate_reports_unknown_status_without_response(monkeypatch):
    _patch_shared_page(monkeypatch, _FakePage(status=None))
    result = await browser_navigate_tool.ainvoke({"url": "https://example.com"})
    assert "Status: unknown" in result


async def test_browser_navigate_tolerates_networkidle_timeout(monkeypatch):
    _patch_shared_page(monkeypatch, _FakePage(settle_error=RuntimeError("page never reached networkidle")))
    result = await browser_navigate_tool.ainvoke({"url": "https://example.com"})
    assert result.startswith("Title: Example Domain")


async def test_browser_navigate_error_closes_page(monkeypatch):
    page = _patch_shared_page(monkeypatch, _FakePage(goto_error=RuntimeError("net::ERR_CONNECTION_REFUSED")))
    result = await browser_navigate_tool.ainvoke({"url": "https://example.com"})
    assert result.startswith("Error: browser navigation failed:")
    assert "net::ERR_CONNECTION_REFUSED" in result
    assert page.closed is True


# ---------------------------------------------------------------------------
# (c) browser_read_page truncation
# ---------------------------------------------------------------------------


async def test_browser_read_page_returns_full_text_when_short(monkeypatch):
    _patch_shared_page(monkeypatch, _FakePage(text="short body text"))
    result = await browser_read_page_tool.ainvoke({"url": "https://example.com"})
    assert result == "short body text"


async def test_browser_read_page_truncates_long_text_with_note(monkeypatch):
    _patch_shared_page(monkeypatch, _FakePage(text="x" * 250))
    monkeypatch.setattr(browser_tools, "_max_chars", lambda: 100)
    result = await browser_read_page_tool.ainvoke({"url": "https://example.com"})
    assert result.startswith("x" * 100)
    assert "[Truncated: showing first 100 of 250 characters]" in result
    assert len(result) < 250


async def test_browser_read_page_reports_empty_body(monkeypatch):
    _patch_shared_page(monkeypatch, _FakePage(text=""))
    result = await browser_read_page_tool.ainvoke({"url": "https://example.com"})
    assert result == "(page has no visible text)"


# ---------------------------------------------------------------------------
# browser_screenshot output writing
# ---------------------------------------------------------------------------


async def test_browser_screenshot_writes_png_to_thread_outputs(monkeypatch, tmp_path):
    page = _patch_shared_page(monkeypatch, _FakePage())
    runtime = SimpleNamespace(state={"thread_data": {"outputs_path": str(tmp_path)}})
    result = await browser_screenshot_tool.coroutine(runtime, "https://example.com")
    assert result.startswith("Saved screenshot: ")
    saved = Path(result.split("Saved screenshot: ", 1)[1].split(" (", 1)[0])
    assert saved.parent == tmp_path
    assert saved.name.startswith("browser-screenshot-")
    assert saved.name.endswith(".png")
    assert _read_bytes(saved) == b"\x89PNG-fake-bytes"
    _, viewport, _, _ = browser_tools._launch_options()
    assert f"viewport {viewport['width']}x{viewport['height']}" in result
    assert "page 1903x8452" in result
    assert "full_page=False" in result
    assert page.screenshot_calls == [{"full_page": False, "type": "png"}]


async def test_browser_screenshot_full_page_flag_is_forwarded(monkeypatch, tmp_path):
    page = _patch_shared_page(monkeypatch, _FakePage())
    runtime = SimpleNamespace(state={"thread_data": {"outputs_path": str(tmp_path)}})
    result = await browser_screenshot_tool.coroutine(runtime, "https://example.com", full_page=True)
    assert "full_page=True" in result
    assert page.screenshot_calls == [{"full_page": True, "type": "png"}]


async def test_browser_screenshot_falls_back_to_temp_dir(monkeypatch):
    _patch_shared_page(monkeypatch, _FakePage())
    runtime = SimpleNamespace(state=None)
    result = await browser_screenshot_tool.coroutine(runtime, "https://example.com")
    assert result.startswith("Saved screenshot: ")
    saved = Path(result.split("Saved screenshot: ", 1)[1].split(" (", 1)[0])
    assert str(saved).startswith(tempfile.gettempdir())
    assert _exists(saved)
    _remove(saved)


# ---------------------------------------------------------------------------
# (d) graceful degradation without Playwright
# ---------------------------------------------------------------------------


async def test_playwright_missing_returns_clear_error(monkeypatch):
    # Halting the import via sys.modules simulates the optional dependency
    # being absent, exactly like an environment without the browser extra.
    monkeypatch.setitem(sys.modules, "playwright", None)
    monkeypatch.setitem(sys.modules, "playwright.async_api", None)
    monkeypatch.setattr(browser_tools, "_browser_state", None)

    def fake_resolver(hostname: str) -> list[ipaddress._BaseAddress]:
        return [PUBLIC_ADDRESS]

    monkeypatch.setattr(browser_tools, "_resolve_host_addresses", fake_resolver)

    navigate = await browser_navigate_tool.ainvoke({"url": "https://example.com"})
    read = await browser_read_page_tool.ainvoke({"url": "https://example.com"})
    shot = await browser_screenshot_tool.coroutine(SimpleNamespace(state=None), "https://example.com")
    for result in (navigate, read, shot):
        assert result.startswith("Error: playwright is not installed"), result
    assert "uv sync --extra browser" in navigate
    # The tools themselves stay registered.
    assert browser_navigate_tool.name == "browser_navigate"
    assert browser_read_page_tool.name == "browser_read_page"
    assert browser_screenshot_tool.name == "browser_screenshot"


# ---------------------------------------------------------------------------
# (e) registration / group filtering via get_available_tools
# ---------------------------------------------------------------------------


def _browser_app_config() -> AppConfig:
    entries = [
        ToolConfig(name="browser_navigate", group="browser", use="qilin.tools.builtins.browser_tools:browser_navigate_tool"),
        ToolConfig(name="browser_read_page", group="browser", use="qilin.tools.builtins.browser_tools:browser_read_page_tool"),
        ToolConfig(name="browser_screenshot", group="browser", use="qilin.tools.builtins.browser_tools:browser_screenshot_tool"),
    ]
    return AppConfig(sandbox=SandboxConfig(use="qilin.sandbox.local:LocalSandboxProvider"), tools=entries)


BROWSER_TOOL_NAMES = {"browser_navigate", "browser_read_page", "browser_screenshot"}


def test_browser_tools_register_under_browser_group():
    config = _browser_app_config()
    tools = get_available_tools(groups=["browser"], include_mcp=False, app_config=config)
    names = {t.name for t in tools}
    assert names >= BROWSER_TOOL_NAMES


def test_browser_tools_filtered_out_of_other_groups():
    config = _browser_app_config()
    tools = get_available_tools(groups=["web"], include_mcp=False, app_config=config)
    names = {t.name for t in tools}
    assert not BROWSER_TOOL_NAMES & names


def test_browser_tools_included_without_group_filter():
    config = _browser_app_config()
    tools = get_available_tools(groups=None, include_mcp=False, app_config=config)
    names = {t.name for t in tools}
    assert names >= BROWSER_TOOL_NAMES
