"""Built-in subagent configurations.

Three built-in subagents cover the universal primitives of knowledge work:
- general-purpose: execute (research, code, analysis)
- bash: command-line execution
- reviewer: validate / quality-assure other agents' output
"""

from .bash_agent import BASH_AGENT_CONFIG
from .general_purpose import GENERAL_PURPOSE_CONFIG
from .reviewer import REVIEWER_CONFIG

__all__ = [
    "BASH_AGENT_CONFIG",
    "GENERAL_PURPOSE_CONFIG",
    "REVIEWER_CONFIG",
]

# Registry of built-in subagents
BUILTIN_SUBAGENTS = {
    "general-purpose": GENERAL_PURPOSE_CONFIG,
    "bash": BASH_AGENT_CONFIG,
    "reviewer": REVIEWER_CONFIG,
}
