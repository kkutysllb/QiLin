"""Tests for config router pure functions (validation, section mapping)."""

import pytest
from pydantic import ValidationError

from app.gateway.routers.config_router import (
    SECTION_MODELS,
    validate_section_payload,
)


def test_section_models_includes_database_and_run_events() -> None:
    assert "database" in SECTION_MODELS
    assert "run_events" in SECTION_MODELS


def test_validate_section_payload_accepts_valid_database() -> None:
    result = validate_section_payload("database", {"backend": "sqlite"})
    assert result["backend"] == "sqlite"


def test_validate_section_payload_rejects_invalid_backend() -> None:
    with pytest.raises(ValidationError):
        validate_section_payload("database", {"backend": "invalid_backend"})


def test_validate_section_payload_rejects_nonpositive_pool_recycle() -> None:
    # pool_recycle has gt=0; pool_size does not (only default=5).
    with pytest.raises(ValidationError):
        validate_section_payload(
            "database", {"backend": "postgres", "pool_recycle": -1}
        )


def test_validate_section_payload_run_events_accepts_memory() -> None:
    result = validate_section_payload("run_events", {"backend": "memory"})
    assert result["backend"] == "memory"


def test_validate_section_payload_run_events_accepts_db() -> None:
    result = validate_section_payload("run_events", {"backend": "db"})
    assert result["backend"] == "db"


def test_validate_section_payload_run_events_accepts_jsonl() -> None:
    result = validate_section_payload("run_events", {"backend": "jsonl"})
    assert result["backend"] == "jsonl"


def test_validate_section_payload_unknown_section_raises() -> None:
    with pytest.raises(KeyError):
        validate_section_payload("nonexistent_section", {})
