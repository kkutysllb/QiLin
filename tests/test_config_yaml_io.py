"""Tests for config.yaml shared read/write helpers."""

from pathlib import Path

from app.gateway.config_yaml_io import (
    mask_sensitive_value,
    read_config_yaml,
    write_config_yaml,
)


def test_read_config_yaml_returns_dict_with_comments_preserved(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        "# top comment\n"
        "database:\n"
        "  backend: sqlite  # inline comment\n"
        "  sqlite_dir: /tmp/data\n",
        encoding="utf-8",
    )

    data = read_config_yaml(config_path)

    assert isinstance(data, dict)
    assert data["database"]["backend"] == "sqlite"
    assert data["database"]["sqlite_dir"] == "/tmp/data"


def test_read_config_yaml_empty_file_returns_empty_dict(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    config_path.write_text("", encoding="utf-8")

    assert read_config_yaml(config_path) == {}


def test_write_config_yaml_atomic_and_preserves_comments(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        "# header comment\n"
        "database:\n"
        "  backend: sqlite\n",
        encoding="utf-8",
    )
    data = read_config_yaml(config_path)
    data["database"]["backend"] = "postgres"

    write_config_yaml(config_path, data)

    written = config_path.read_text(encoding="utf-8")
    assert "# header comment" in written
    assert "postgres" in written


def test_write_config_yaml_leaves_no_temp_files(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    config_path.write_text("database:\n  backend: sqlite\n", encoding="utf-8")
    data = read_config_yaml(config_path)

    write_config_yaml(config_path, data)

    assert list(tmp_path.glob("*.tmp")) == []


def test_mask_sensitive_value_masks_plaintext() -> None:
    assert mask_sensitive_value("postgresql://user:secret@host/db") == "***"


def test_mask_sensitive_value_preserves_env_ref() -> None:
    assert mask_sensitive_value("$DATABASE_URL") == "$DATABASE_URL"


def test_mask_sensitive_value_handles_none() -> None:
    assert mask_sensitive_value(None) is None
    assert mask_sensitive_value("") is None
