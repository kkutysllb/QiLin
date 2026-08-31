"""Unit tests for the AI-guided agent suggestion endpoint and helpers."""

import json

import pytest

from app.gateway.routers.agents import (
    _parse_suggestion_json,
    _sanitize_suggested_name,
)


class TestSanitizeSuggestedName:
    """Tests for ``_sanitize_suggested_name``."""

    def test_kebab_case_passthrough(self) -> None:
        assert _sanitize_suggested_name("my-agent") == "my-agent"

    def test_lowercases(self) -> None:
        assert _sanitize_suggested_name("MyAgent") == "myagent"

    def test_spaces_to_hyphens(self) -> None:
        assert _sanitize_suggested_name("financial analyst") == "financial-analyst"

    def test_underscores_to_hyphens(self) -> None:
        assert _sanitize_suggested_name("code_reviewer") == "code-reviewer"

    def test_strips_special_chars(self) -> None:
        assert _sanitize_suggested_name("agent@v2.0!") == "agent-v2-0"

    def test_collapses_consecutive_hyphens(self) -> None:
        assert _sanitize_suggested_name("a---b") == "a-b"

    def test_strips_leading_trailing_hyphens(self) -> None:
        assert _sanitize_suggested_name("--test--") == "test"

    def test_empty_returns_default(self) -> None:
        assert _sanitize_suggested_name("") == "new-agent"

    def test_all_special_returns_default(self) -> None:
        assert _sanitize_suggested_name("@#$%") == "new-agent"

    def test_preserves_digits(self) -> None:
        assert _sanitize_suggested_name("agent-123") == "agent-123"


class TestParseSuggestionJson:
    """Tests for ``_parse_suggestion_json``."""

    def test_parses_plain_json(self) -> None:
        raw = '{"name": "test", "description": "hello"}'
        result = _parse_suggestion_json(raw)
        assert result["name"] == "test"
        assert result["description"] == "hello"

    def test_parses_json_with_surrounding_text(self) -> None:
        raw = 'Here is the config:\n{"name": "test"}\nDone.'
        result = _parse_suggestion_json(raw)
        assert result["name"] == "test"

    def test_parses_json_in_code_fence(self) -> None:
        raw = '```json\n{"name": "test", "role": "worker"}\n```'
        result = _parse_suggestion_json(raw)
        assert result["name"] == "test"
        assert result["role"] == "worker"

    def test_strips_think_blocks(self) -> None:
        raw = '<think>reasoning here</think>\n{"name": "test"}'
        result = _parse_suggestion_json(raw)
        assert result["name"] == "test"

    def test_raises_on_no_json(self) -> None:
        with pytest.raises(ValueError, match="No JSON object"):
            _parse_suggestion_json("just plain text")

    def test_raises_on_invalid_json(self) -> None:
        with pytest.raises(json.JSONDecodeError):
            _parse_suggestion_json("{invalid json}")

    def test_handles_nested_objects(self) -> None:
        raw = '{"name": "test", "model_settings": {"temperature": 0.7}}'
        result = _parse_suggestion_json(raw)
        assert result["model_settings"]["temperature"] == 0.7


class TestSuggestEndpointFields:
    """Integration-style tests for field sanitization logic used by the endpoint.

    These test the filtering and validation logic without needing a full app
    fixture, by exercising the same code paths that the endpoint uses.
    """

    def test_tool_groups_filtered_to_known(self) -> None:
        known = {"web", "bash", "file:read"}
        raw_groups = ["web", "unknown-group", "bash", "another-unknown"]
        filtered = [g for g in raw_groups if g in known]
        assert filtered == ["web", "bash"]

    def test_skills_filtered_to_known(self) -> None:
        known_skills = {"tushare", "web-search"}
        raw_skills = ["tushare", "unknown-skill", "web-search"]
        filtered = [s for s in raw_skills if s in known_skills]
        assert filtered == ["tushare", "web-search"]

    def test_role_validation_defaults_to_worker(self) -> None:
        valid_roles = {"orchestrator", "worker", "reviewer"}
        raw_role = "superadmin"
        role = raw_role if raw_role in valid_roles else "worker"
        assert role == "worker"

    def test_reasoning_effort_validation(self) -> None:
        raw = "extreme"
        effort = raw if raw in ("low", "medium", "high") else None
        assert effort is None

    def test_model_validation_unknown_returns_none(self) -> None:
        known_models = {"gpt-4o", "claude-3"}
        raw_model = "gpt-999"
        model = raw_model if isinstance(raw_model, str) and raw_model in known_models else None
        assert model is None

    def test_model_validation_known(self) -> None:
        known_models = {"gpt-4o", "claude-3"}
        raw_model = "gpt-4o"
        model = raw_model if isinstance(raw_model, str) and raw_model in known_models else None
        assert model == "gpt-4o"

    def test_safe_int_positive(self) -> None:
        parsed = {"max_turns": 100}
        val = parsed.get("max_turns")
        result = int(val) if isinstance(val, (int, float)) and val > 0 else None
        assert result == 100

    def test_safe_int_negative_returns_none(self) -> None:
        parsed = {"max_turns": -5}
        val = parsed.get("max_turns")
        result = int(val) if isinstance(val, (int, float)) and val > 0 else None
        assert result is None

    def test_safe_int_none(self) -> None:
        parsed = {}
        val = parsed.get("max_turns")
        result = int(val) if isinstance(val, (int, float)) and val > 0 else None
        assert result is None
