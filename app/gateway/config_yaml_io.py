"""Shared config.yaml read/write helpers.

Extracted from routers/models.py so the config router can reuse the same
ruamel.yaml-based, comment-preserving, atomic-write logic. ruamel.yaml is
used (not pyyaml) because config.yaml carries user-authored comments that
must survive round-trip edits.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ruamel.yaml import YAML

from qilin.config.app_config import AppConfig


def _make_parser() -> YAML:
    parser = YAML()
    parser.preserve_quotes = True
    parser.indent(mapping=2, sequence=4, offset=2)
    return parser


def resolve_config_path() -> Path:
    """Resolve the config.yaml path via AppConfig.resolve_config_path."""
    return AppConfig.resolve_config_path(None)


def read_config_yaml(config_path: Path | None = None) -> Any:
    """Read config.yaml as a ruamel structure (preserves comments).

    Returns an empty dict for empty files instead of None.
    """
    path = config_path or resolve_config_path()
    parser = _make_parser()
    with open(path, encoding="utf-8") as fh:
        data = parser.load(fh)
    return data if data is not None else {}


def write_config_yaml(config_path: Path, data: Any) -> None:
    """Write the ruamel structure back to config.yaml atomically.

    Writes to a .tmp sibling file, then renames over the original so a
    partial write can never corrupt the live config.
    """
    parser = _make_parser()
    tmp_path = config_path.with_suffix(config_path.suffix + ".tmp")
    with open(tmp_path, "w", encoding="utf-8") as fh:
        parser.dump(data, fh)
    tmp_path.replace(config_path)


def mask_sensitive_value(value: Any) -> str | None:
    """Mask a sensitive value unless it is a $ENV reference.

    Values starting with ``$`` are environment-variable references and are
    safe to expose. Everything else is replaced with ``"***"``.
    """
    if value is None:
        return None
    text = str(value).strip()
    if text == "":
        return None
    if text.startswith("$"):
        return text
    return "***"
