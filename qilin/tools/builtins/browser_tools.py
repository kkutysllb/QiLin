"""Native read-only browser tools backed by Playwright.

Unlike the agentic ``browser_automation`` community tools (a stateful
navigate → observe → click/type loop with a per-thread session), these are
one-shot URL → result tools: each call navigates the shared headless Chromium
and returns a plain string — page metadata, extracted text, or a screenshot
file path. No interactive session is kept between calls.

All calls share ONE module-level lazy-started headless Chromium/browser
context with a single reused page, guarded by an :class:`asyncio.Lock`, so
repeated calls never spawn a browser per call. Navigation waits for
``domcontentloaded`` with a hard 30s timeout, then a short best-effort
``networkidle`` settle (SPAs with long-poll connections may never reach idle);
page actions carry a 20s default timeout. A page that errors mid-call is
closed so the next call starts from a fresh page, and the whole browser stack
is closed at interpreter shutdown so no Chromium process leaks.

Playwright is an optional dependency (``uv sync --extra browser``) imported
lazily: the tools stay registered and return a clear error string when it is
missing. All URLs are SSRF-screened with the shared
:func:`qilin.community.url_safety.validate_public_http_url` helper (opt-out
only for intentional internal targets).
"""

from __future__ import annotations

import asyncio
import atexit
import contextlib
import logging
import os
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

from langchain.tools import tool

from qilin.community.url_safety import resolve_host_addresses as _resolve_host_addresses
from qilin.community.url_safety import validate_public_http_url
from qilin.config import get_app_config
from qilin.config.network_config import NetworkConfig
from qilin.tools.types import Runtime

if TYPE_CHECKING:
    from playwright.async_api import Browser, BrowserContext, Page, Playwright

logger = logging.getLogger(__name__)

# Hard timeout defaults: navigation waits at most 30s for domcontentloaded,
# every page action (inner_text/screenshot/evaluate) at most 20s.
_NAV_TIMEOUT_MS = 30_000
_ACTION_TIMEOUT_MS = 20_000
# Best-effort network settle after domcontentloaded. Failures (mostly
# timeouts on pages that never go idle) are logged at debug and ignored.
_NETWORK_IDLE_TIMEOUT_MS = 5_000
# Readable-text truncation cap for browser_read_page.
_DEFAULT_MAX_CHARS = 20_000
# Env fallback for opting into private/internal browsing targets.
_ALLOW_PRIVATE_ENV_VAR = "QILIN_BROWSER_ALLOW_PRIVATE_ADDRESSES"

# Full scrollable page size, used to report what a screenshot covers.
_PAGE_SIZE_JS = (
    "() => ({"
    "width: Math.max(document.documentElement.scrollWidth,"
    " document.body ? document.body.scrollWidth : 0),"
    "height: Math.max(document.documentElement.scrollHeight,"
    " document.body ? document.body.scrollHeight : 0)"
    "})"
)


class PlaywrightNotInstalledError(RuntimeError):
    """Raised when the optional playwright dependency is missing."""

    def __init__(self) -> None:
        super().__init__(
            "playwright is not installed. Install the optional browser dependency "
            "(`uv sync --extra browser` or `pip install 'qilin[browser]'`), run "
            "`playwright install chromium`, then retry."
        )


def _import_async_playwright() -> Any:
    """Import Playwright lazily so this module loads without the optional dep.

    Indirection point for tests: patch this to raise ``ImportError`` and the
    tools degrade to an error string instead of launching a browser.
    """
    try:
        from playwright.async_api import async_playwright
    except ImportError as exc:
        raise PlaywrightNotInstalledError() from exc
    return async_playwright


def _get_tool_config(tool_name: str) -> dict:
    """Read per-tool config extras, degrading to ``{}`` when config is unavailable."""
    try:
        config = get_app_config().get_tool_config(tool_name)
    except Exception:
        return {}
    if config is None:
        return {}
    return config.model_extra or {}


def _get_network_config() -> NetworkConfig:
    """Read global network defaults, degrading to built-in defaults."""
    try:
        return get_app_config().network
    except Exception:
        return NetworkConfig()


def _as_bool(value: object, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "yes", "on"}:
            return True
        if lowered in {"0", "false", "no", "off"}:
            return False
    return default


def _as_int(value: object, default: int) -> int:
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    if isinstance(value, str):
        try:
            return int(value.strip())
        except ValueError:
            return default
    return default


def _as_str(value: object) -> str | None:
    if isinstance(value, str):
        trimmed = value.strip()
        return trimmed or None
    return None


def _allow_private_addresses(tool_name: str) -> bool:
    """Whether the SSRF guard may be opted out for this tool.

    Per-tool config ``allow_private_addresses`` wins; otherwise the
    ``QILIN_BROWSER_ALLOW_PRIVATE_ADDRESSES`` env flag applies.
    """
    cfg = _get_tool_config(tool_name)
    if "allow_private_addresses" in cfg:
        return _as_bool(cfg.get("allow_private_addresses"), False)
    return _as_bool(os.getenv(_ALLOW_PRIVATE_ENV_VAR), False)


def _validate_url(tool_name: str, url: str) -> str | None:
    """SSRF-screen a browser URL using the tool's config policy.

    Returns an ``"Error: ..."`` string when the URL must be rejected, or
    ``None`` when navigation may proceed. Rejects non-http(s) schemes,
    localhost, and hosts resolving to loopback/private/link-local (incl. the
    169.254.169.254 cloud-metadata endpoint) or other blocked ranges.
    """
    return validate_public_http_url(
        url,
        allow_private_addresses=_allow_private_addresses(tool_name),
        action="browse",
        resolver=_resolve_host_addresses,
    )


def _launch_options() -> tuple[bool, dict[str, int], int, str | None]:
    """Read headless/viewport/navigation-timeout/proxy launch settings.

    Like the agentic browser tools, launch config is read from a single
    canonical source — always ``browser_navigate`` — regardless of which tool
    first starts the shared browser, so a ``headless: false`` set there is
    never silently dropped because another tool initialized first. Per-tool
    config may override the global network defaults.
    """
    network = _get_network_config()
    cfg = _get_tool_config("browser_navigate")
    headless = _as_bool(cfg.get("headless"), network.browser_headless)
    timeout_ms = _as_int(cfg.get("timeout_ms"), network.browser_timeout_ms)
    width = _as_int(cfg.get("viewport_width"), network.browser_viewport_width)
    height = _as_int(cfg.get("viewport_height"), network.browser_viewport_height)
    proxy = _as_str(cfg.get("proxy")) or network.proxy
    return headless, {"width": width, "height": height}, timeout_ms, proxy


def _network_idle_timeout_ms() -> int:
    cfg = _get_tool_config("browser_navigate")
    return _as_int(cfg.get("network_idle_timeout_ms"), _NETWORK_IDLE_TIMEOUT_MS)


def _max_chars() -> int:
    cfg = _get_tool_config("browser_read_page")
    return _as_int(cfg.get("max_chars"), _DEFAULT_MAX_CHARS)


class _BrowserState:
    """Playwright objects owned by exactly one event loop.

    Playwright's async objects are loop-affine, so the whole stack is created
    on — and only ever awaited from — the loop recorded here. When tool calls
    arrive on a different loop, the state is retired and rebuilt (see
    :func:`_get_shared_page`).
    """

    def __init__(self, loop: asyncio.AbstractEventLoop) -> None:
        self.loop = loop
        self.lock = asyncio.Lock()
        self.playwright: Playwright | None = None
        self.browser: Browser | None = None
        self.context: BrowserContext | None = None
        self.page: Page | None = None

    async def close(self) -> None:
        """Close page/context/browser/driver, tolerating double close."""
        with contextlib.suppress(Exception):
            if self.page is not None:
                await self.page.close()
        with contextlib.suppress(Exception):
            if self.context is not None:
                await self.context.close()
        with contextlib.suppress(Exception):
            if self.browser is not None:
                await self.browser.close()
        with contextlib.suppress(Exception):
            if self.playwright is not None:
                await self.playwright.stop()
        self.page = None
        self.context = None
        self.browser = None
        self.playwright = None


_browser_state: _BrowserState | None = None


async def _retire_state(state: _BrowserState) -> None:
    """Best-effort close of a state owned by another (or finished) loop."""
    loop = state.loop
    if loop is asyncio.get_running_loop():
        await state.close()
        return
    if loop.is_closed():
        logger.debug("dropping browser state bound to a closed event loop; its Chromium exits with the process")
        return
    if loop.is_running():
        # Owned by another live loop (another thread): schedule the close
        # there and await the bridged future with a bounded wait.
        future = asyncio.run_coroutine_threadsafe(state.close(), loop)
        with contextlib.suppress(Exception):
            await asyncio.wait_for(asyncio.wrap_future(future), timeout=5.0)
        return
    # Not running and not closed: nothing pumps that loop anymore, so drive
    # the close inline. Briefly blocking this loop is the price of not
    # leaking a Chromium process.
    with contextlib.suppress(Exception):
        loop.run_until_complete(state.close())


async def _get_shared_page() -> Page:
    """Return the shared headless-Chromium page, creating it on first use.

    One lazily-started Playwright/Chromium stack is shared process-wide and a
    single page is reused across calls (each tool navigates it fresh). Page
    creation is guarded by an :class:`asyncio.Lock` so concurrent tool calls
    cannot launch two browsers. Calls arriving on a different event loop
    retire the previous stack first — Playwright objects cannot cross loops.

    Raises:
        PlaywrightNotInstalledError: When the optional playwright dependency
            is missing.
    """
    global _browser_state
    loop = asyncio.get_running_loop()
    state = _browser_state
    if state is not None and state.loop is not loop:
        logger.debug("recycling shared browser onto a new event loop")
        await _retire_state(state)
        if _browser_state is state:
            _browser_state = None
        state = None
    if state is None:
        state = _BrowserState(loop)
        _browser_state = state
    async with state.lock:
        if state.page is not None and not state.page.is_closed():
            return state.page
        headless, viewport, timeout_ms, proxy = _launch_options()
        async_playwright = _import_async_playwright()
        if state.playwright is None:
            state.playwright = await async_playwright().start()
        if state.browser is None or not state.browser.is_connected():
            launch_kwargs: dict[str, Any] = {"headless": headless}
            if proxy:
                launch_kwargs["proxy"] = {"server": proxy}
            state.browser = await state.playwright.chromium.launch(**launch_kwargs)
        if state.context is None:
            state.context = await state.browser.new_context(viewport=viewport)
            state.context.set_default_navigation_timeout(timeout_ms)
            state.context.set_default_timeout(_ACTION_TIMEOUT_MS)
        state.page = await state.context.new_page()
        return state.page


def _shutdown_shared_browser() -> None:
    """Close the shared Chromium at interpreter shutdown; never leak processes."""
    state = _browser_state
    if state is None:
        return
    loop = state.loop
    if loop.is_closed() or loop.is_running():
        # A closed loop can no longer run the close coroutine and a running
        # loop belongs to another thread; the Playwright driver (and its
        # Chromium child) exits with the process either way.
        logger.debug("skipping atexit browser close for a %s event loop", "closed" if loop.is_closed() else "running")
        return
    with contextlib.suppress(Exception):
        loop.run_until_complete(state.close())


atexit.register(_shutdown_shared_browser)


async def _discard_page_after_error(page: Page) -> None:
    """Close a page that ended mid-error so the next call starts fresh."""
    state = _browser_state
    if state is not None and state.page is page:
        state.page = None
    with contextlib.suppress(Exception):
        await page.close()


async def _navigate(page: Page, url: str) -> Any:
    """Load *url* waiting for domcontentloaded, then a best-effort settle.

    The settle wait targets ``networkidle`` with a short timeout. Many SPAs
    keep long-poll connections alive and never reach idle, so any failure of
    this best-effort wait is logged at debug and ignored — the DOM is already
    loaded. Returns the navigation response (``None`` for e.g. downloads).
    """
    response = await page.goto(url, wait_until="domcontentloaded", timeout=_nav_timeout_ms())
    try:
        await page.wait_for_load_state("networkidle", timeout=_network_idle_timeout_ms())
    except Exception as exc:
        logger.debug("networkidle not reached (continuing with loaded DOM): %s", exc)
    return response


def _nav_timeout_ms() -> int:
    _, _, timeout_ms, _ = _launch_options()
    return timeout_ms


async def _page_size(page: Page) -> tuple[int, int] | None:
    """Best-effort full scrollable page size in CSS pixels."""
    try:
        data = await page.evaluate(_PAGE_SIZE_JS)
        return int(data["width"]), int(data["height"])
    except Exception:
        return None


def _screenshot_filename() -> str:
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S-%f")
    return f"browser-screenshot-{stamp}.png"


def _resolve_screenshot_dir(runtime: Runtime) -> Path:
    """Prefer the thread's outputs directory; fall back to a temp dir.

    The outputs directory (thread ``outputs_path`` from runtime state) is
    where every other capture-style tool writes artifacts. When runtime state
    is unavailable (no thread context), a temp dir keeps the tool useful
    while the returned absolute path still points at a real file.
    """
    state = getattr(runtime, "state", None)
    if state is not None:
        thread_data = state.get("thread_data") or {}
        outputs_path = thread_data.get("outputs_path")
        if outputs_path:
            return Path(outputs_path)
    return Path(tempfile.gettempdir())


def _write_screenshot(directory: Path, name: str, content: bytes) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / name
    path.write_bytes(content)
    return path


@tool("browser_navigate", parse_docstring=True)
async def browser_navigate_tool(url: str) -> str:
    """Open a URL in a headless browser and report the page title, HTTP status, and final URL.

    One-shot, read-only alternative to the agentic browser tools: the page is
    loaded with a real Chromium (JavaScript runs) using a short network settle,
    then this returns the title, HTTP status, and the final URL after any
    redirects. No interactive session is kept; use the browser_automation
    tools when you need to click or type on the page.
    The URL must include the scheme, e.g. https://example.com.

    Args:
        url: The http(s) URL to open.
    """
    url_error = _validate_url("browser_navigate", url)
    if url_error:
        return url_error
    try:
        page = await _get_shared_page()
    except PlaywrightNotInstalledError as exc:
        return f"Error: {exc}"
    try:
        response = await _navigate(page, url)
        title = await page.title()
        status = getattr(response, "status", None)
        status_text = str(status) if status is not None else "unknown"
        return f"Title: {title or '(untitled)'}\nStatus: {status_text}\nURL: {page.url}"
    except Exception as exc:
        await _discard_page_after_error(page)
        logger.error("browser_navigate failed: %s", exc)
        return f"Error: browser navigation failed: {exc}"


@tool("browser_read_page", parse_docstring=True)
async def browser_read_page_tool(url: str) -> str:
    """Open a URL in a headless browser and return the page's visible text.

    Renders the page with a real Chromium (JavaScript runs), then extracts the
    body's visible text — useful for JavaScript-heavy pages plain web_fetch
    cannot read. Output is truncated at a configurable cap (default 20000
    characters) with a note when truncation occurred.
    The URL must include the scheme, e.g. https://example.com.

    Args:
        url: The http(s) URL to read.
    """
    url_error = _validate_url("browser_read_page", url)
    if url_error:
        return url_error
    try:
        page = await _get_shared_page()
    except PlaywrightNotInstalledError as exc:
        return f"Error: {exc}"
    try:
        await _navigate(page, url)
        text = await page.inner_text("body")
    except Exception as exc:
        await _discard_page_after_error(page)
        logger.error("browser_read_page failed: %s", exc)
        return f"Error: could not read page text: {exc}"
    max_chars = _max_chars()
    if len(text) > max_chars:
        return f"{text[:max_chars]}\n\n[Truncated: showing first {max_chars} of {len(text)} characters]"
    return text or "(page has no visible text)"


@tool("browser_screenshot", parse_docstring=True)
async def browser_screenshot_tool(runtime: Runtime, url: str, full_page: bool = False) -> str:
    """Open a URL in a headless browser and save a PNG screenshot of it.

    Renders the page with a real Chromium and writes a PNG into the current
    thread's outputs directory (a temp directory when no thread outputs are
    available). Returns the saved file's absolute path plus the viewport and
    full page size so you know what the image covers. Set full_page=true to
    capture the whole scrollable page instead of only the viewport.

    Args:
        url: The http(s) URL to capture.
        full_page: Capture the full scrollable page instead of only the viewport.
    """
    url_error = _validate_url("browser_screenshot", url)
    if url_error:
        return url_error
    try:
        page = await _get_shared_page()
    except PlaywrightNotInstalledError as exc:
        return f"Error: {exc}"
    try:
        await _navigate(page, url)
        content = await page.screenshot(full_page=full_page, type="png")
        size = await _page_size(page)
    except Exception as exc:
        await _discard_page_after_error(page)
        logger.error("browser_screenshot failed: %s", exc)
        return f"Error: could not capture screenshot: {exc}"
    try:
        directory = _resolve_screenshot_dir(runtime)
        name = _screenshot_filename()
        path = await asyncio.to_thread(_write_screenshot, directory, name, content)
    except Exception as exc:
        logger.error("browser_screenshot could not save output: %s", exc)
        return f"Error: could not save screenshot: {exc}"
    _, viewport, _, _ = _launch_options()
    size_note = f"page {size[0]}x{size[1]}" if size is not None else "page size unavailable"
    return f"Saved screenshot: {path} (viewport {viewport['width']}x{viewport['height']}, {size_note}, full_page={full_page})"
