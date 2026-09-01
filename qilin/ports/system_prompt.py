"""System-prompt section registry — the H5 language port.

External plugin hosts (the web-demo plugin server halves) register prompt
sections over the gateway port API; the lead agent merges registered
sections into the system prompt at assembly time (order ascending).
In-memory by design: plugin hosts re-announce their sections on their own
boot, and the install/upgrade model already requires restarts.
"""
from __future__ import annotations

import threading
from dataclasses import dataclass


@dataclass(frozen=True)
class PromptSection:
    name: str
    order: int
    text: str
    source: str = "plugin"


_lock = threading.Lock()
_sections: dict[str, PromptSection] = {}


def register_section(name: str, order: int, text: str, source: str = "plugin") -> PromptSection:
    """Upsert one section by name (idempotent re-registration)."""
    if not name or not text:
        raise ValueError("section name and text are required")
    with _lock:
        section = PromptSection(name=name, order=int(order), text=text, source=source)
        _sections[name] = section
        return section


def unregister_section(name: str) -> bool:
    with _lock:
        return _sections.pop(name, None) is not None


def list_sections() -> list[PromptSection]:
    """Sections in assembly order (order asc, name tiebreak)."""
    with _lock:
        return sorted(_sections.values(), key=lambda s: (s.order, s.name))


def render_sections() -> str:
    """Rendered block for prompt assembly (blank sections skipped)."""
    parts = [s.text for s in list_sections()]
    return "\n\n".join(p for p in parts if p.strip())
