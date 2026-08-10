"""Tests for the reviewer built-in subagent."""

import pytest

from qilin.subagents.builtins import BUILTIN_SUBAGENTS
from qilin.subagents.builtins.reviewer import REVIEWER_CONFIG
from qilin.subagents.config import SubagentConfig


class TestReviewerConfig:
    """Verify the reviewer subagent is correctly defined and registered."""

    def test_is_subagent_config(self) -> None:
        assert isinstance(REVIEWER_CONFIG, SubagentConfig)

    def test_name(self) -> None:
        assert REVIEWER_CONFIG.name == "reviewer"

    def test_registered_in_builtin_subagents(self) -> None:
        assert "reviewer" in BUILTIN_SUBAGENTS
        assert BUILTIN_SUBAGENTS["reviewer"] is REVIEWER_CONFIG

    def test_description_not_empty(self) -> None:
        assert REVIEWER_CONFIG.description.strip()

    def test_system_prompt_not_empty(self) -> None:
        assert REVIEWER_CONFIG.system_prompt is not None
        assert REVIEWER_CONFIG.system_prompt.strip()

    def test_model_inherits_parent(self) -> None:
        assert REVIEWER_CONFIG.model == "inherit"

    def test_max_turns_is_50(self) -> None:
        """Reviewer tasks are typically lighter than general-purpose (200)."""
        assert REVIEWER_CONFIG.max_turns == 50

    @pytest.mark.parametrize(
        "tool",
        [
            "read_file",
            "ls",
            "glob",
            "grep",
            "bash",
            "web_search",
            "web_fetch",
        ],
    )
    def test_has_readonly_tools(self, tool: str) -> None:
        assert REVIEWER_CONFIG.tools is not None
        assert tool in REVIEWER_CONFIG.tools

    @pytest.mark.parametrize("tool", ["write_file", "str_replace"])
    def test_does_not_have_write_tools(self, tool: str) -> None:
        """Reviewer is read-only — must NOT include file-writing tools."""
        assert REVIEWER_CONFIG.tools is not None
        assert tool not in REVIEWER_CONFIG.tools

    @pytest.mark.parametrize(
        "tool",
        [
            "task",
            "ask_clarification",
            "present_files",
            "write_file",
            "str_replace",
        ],
    )
    def test_disallowed_tools(self, tool: str) -> None:
        """Reviewer must not delegate, clarify, present, or write files."""
        assert REVIEWER_CONFIG.disallowed_tools is not None
        assert tool in REVIEWER_CONFIG.disallowed_tools

    def test_system_prompt_contains_review_checklist(self) -> None:
        """Ensure the prompt guides the reviewer's evaluation focus."""
        prompt = REVIEWER_CONFIG.system_prompt or ""
        assert "Correctness" in prompt
        assert "Completeness" in prompt
        assert "Security" in prompt

    def test_system_prompt_declares_readonly(self) -> None:
        """The prompt must clearly state the reviewer is read-only."""
        prompt = REVIEWER_CONFIG.system_prompt or ""
        assert "READ-ONLY" in prompt


class TestBuiltinSubagentsRegistry:
    """Verify the registry contains all three built-in subagents."""

    def test_has_three_builtins(self) -> None:
        assert len(BUILTIN_SUBAGENTS) == 3

    def test_contains_general_purpose(self) -> None:
        assert "general-purpose" in BUILTIN_SUBAGENTS

    def test_contains_bash(self) -> None:
        assert "bash" in BUILTIN_SUBAGENTS

    def test_contains_reviewer(self) -> None:
        assert "reviewer" in BUILTIN_SUBAGENTS

    def test_all_are_subagent_configs(self) -> None:
        for cfg in BUILTIN_SUBAGENTS.values():
            assert isinstance(cfg, SubagentConfig)

    def test_unique_names(self) -> None:
        names = [cfg.name for cfg in BUILTIN_SUBAGENTS.values()]
        assert len(names) == len(set(names))
