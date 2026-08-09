"""Tests for persistence router pure helper functions."""

from pathlib import Path

from app.gateway.routers.persistence import (
    compute_directory_usage,
    format_size_bytes,
)


def test_compute_directory_usage_empty_dir(tmp_path: Path) -> None:
    assert compute_directory_usage(tmp_path) == 0


def test_compute_directory_usage_sums_files(tmp_path: Path) -> None:
    (tmp_path / "a.txt").write_text("hello")  # 5 bytes
    (tmp_path / "b.txt").write_text("world!")  # 6 bytes

    assert compute_directory_usage(tmp_path) == 11


def test_compute_directory_usage_recursive(tmp_path: Path) -> None:
    sub = tmp_path / "sub"
    sub.mkdir()
    (sub / "c.txt").write_text("ab")  # 2 bytes
    (tmp_path / "d.txt").write_text("cd")  # 2 bytes

    assert compute_directory_usage(tmp_path) == 4


def test_compute_directory_usage_missing_dir_returns_zero(tmp_path: Path) -> None:
    missing = tmp_path / "nonexistent"
    assert compute_directory_usage(missing) == 0


def test_format_size_bytes_under_1kb() -> None:
    assert format_size_bytes(512) == "512 B"


def test_format_size_bytes_kb() -> None:
    assert format_size_bytes(1024) == "1.0 KB"
    assert format_size_bytes(1536) == "1.5 KB"


def test_format_size_bytes_mb() -> None:
    assert format_size_bytes(1024 * 1024) == "1.0 MB"
