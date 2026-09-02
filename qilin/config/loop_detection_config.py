"""Configuration for loop detection middleware."""

from pydantic import BaseModel, Field, model_validator


class ToolFreqOverride(BaseModel):
    """Per-tool frequency threshold override.

    Can be higher or lower than the global defaults. Commonly used to raise
    thresholds for high-frequency tools like bash in batch workflows (e.g.
    RNA-seq pipelines) without weakening protection on every other tool.
    """

    warn: int = Field(ge=1)
    hard_limit: int = Field(ge=1)

    @model_validator(mode="after")
    def _validate(self) -> "ToolFreqOverride":
        if self.hard_limit < self.warn:
            raise ValueError("hard_limit must be >= warn")
        return self


class LoopDetectionConfig(BaseModel):
    """Configuration for repetitive tool-call loop detection.

    Layer 1 tracks the *consecutive* chain of identical tool-call sets and
    responds with escalating reminders before the hard limit; Layer 2 tracks
    per-tool-type frequency inside a sliding window. See the middleware
    module docstring for the full strategy.
    """

    enabled: bool = Field(
        default=True,
        description="Whether to enable repetitive tool-call loop detection",
    )
    reminder_thresholds: list[int] = Field(
        default_factory=lambda: [3, 5, 8],
        description=(
            "Consecutive identical tool-call counts that inject an escalating "
            "reminder. The first tier sends a gentle nudge; later tiers send a "
            "detailed reminder naming the tool and quoting an argument preview."
        ),
    )
    hard_limit: int = Field(
        default=12,
        ge=1,
        description=(
            "Consecutive identical tool-call count at which tool_calls are "
            "stripped and a final answer is forced. Must be >= "
            "max(reminder_thresholds)."
        ),
    )
    arguments_preview_chars: int = Field(
        default=400,
        ge=1,
        description=(
            "Cap on canonical-argument characters quoted inside a detailed "
            "reminder. Detection always compares full canonical arguments; "
            "this bounds only the model-visible preview."
        ),
    )
    window_size: int = Field(
        default=20,
        ge=1,
        description=(
            "Legacy Layer 1 sliding-window size, retained as the floor for the "
            "Layer 2 per-tool frequency window. Layer 1 no longer counts in a "
            "window; it tracks the consecutive chain instead."
        ),
    )
    max_tracked_threads: int = Field(
        default=100,
        ge=1,
        description="Maximum number of thread chain states to keep in memory",
    )
    tool_freq_warn: int = Field(
        default=30,
        ge=1,
        description="Number of calls to the same tool type before injecting a frequency warning",
    )
    tool_freq_hard_limit: int = Field(
        default=50,
        ge=1,
        description="Number of calls to the same tool type before forcing a stop",
    )
    tool_freq_overrides: dict[str, ToolFreqOverride] = Field(
        default_factory=dict,
        description=("Per-tool overrides for tool_freq_warn / tool_freq_hard_limit, keyed by tool name. Values can be higher or lower than the global defaults. Commonly used to raise thresholds for high-frequency tools like bash."),
    )

    @model_validator(mode="after")
    def validate_thresholds(self) -> "LoopDetectionConfig":
        """Ensure the reminder ladder is well-formed and below the hard limit."""
        thresholds = self.reminder_thresholds
        if not thresholds:
            raise ValueError("reminder_thresholds must not be empty")
        if any(not isinstance(t, int) or t < 2 for t in thresholds):
            raise ValueError("every reminder threshold must be an integer >= 2")
        if len(set(thresholds)) != len(thresholds):
            raise ValueError("reminder_thresholds must not contain duplicates")
        if self.hard_limit < max(thresholds):
            raise ValueError("hard_limit must be >= max(reminder_thresholds)")
        if self.tool_freq_hard_limit < self.tool_freq_warn:
            raise ValueError("tool_freq_hard_limit must be >= tool_freq_warn")
        return self
