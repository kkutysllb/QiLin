"""Security-regression tests for sandbox environment scrubbing and secret
redaction (issue #3861).

``qilin.sandbox.env_policy`` scrubs credential-looking variables from the
inherited host environment before request-scoped secrets are layered on top;
``qilin.sandbox.tools.mask_secret_values`` redacts injected secret *values*
from bash output before it re-enters the model context.
"""

import os

import pytest

from qilin.sandbox.env_policy import build_sandbox_env, is_blocked_env_name
from qilin.sandbox.tools import mask_secret_values

# A fixed host environment so build_sandbox_env outcomes do not depend on the
# machine running the tests. Benign entries (PATH/HOME) are kept so anything
# else consulting os.environ mid-test still finds them.
_FAKE_HOST_ENV: dict[str, str] = {
    "PATH": "/usr/local/bin:/usr/bin:/bin",
    "HOME": "/root",
    "SHELL": "/bin/zsh",
    "LANG": "en_US.UTF-8",
    "PWD": "/srv/app",
    "OLDPWD": "/",
    "TMPDIR": "/tmp",
    "VIRTUAL_ENV": "/venv",
    "OPENAI_API_KEY": "sk-host-key-do-not-leak",
    "GITHUB_TOKEN": "ghp_host_token_do_not_leak",
    "ANTHROPIC_API_KEY": "sk-ant-host",
    "DB_PASS": "host-db-password",
    "MYSQL_PWD": "host-mysql-pwd",
    "DATABASE_URL": "postgresql://u:secret@db/example",
    "TRACE_SECRET": "host-trace-secret",
    "MY_DSN": "mysql://u:pw@host/db",
    "SSH_ASKPASS": "/usr/bin/ssh-askpass",
}

_UNSCRUBBED_KEYS = ("PATH", "HOME", "SHELL", "LANG", "PWD", "OLDPWD", "TMPDIR", "VIRTUAL_ENV")
_SCRUBBED_KEYS = (
    "OPENAI_API_KEY",
    "GITHUB_TOKEN",
    "ANTHROPIC_API_KEY",
    "DB_PASS",
    "MYSQL_PWD",
    "DATABASE_URL",
    "TRACE_SECRET",
    "MY_DSN",
    "SSH_ASKPASS",
)


@pytest.fixture
def fake_host_environ(monkeypatch: pytest.MonkeyPatch) -> dict[str, str]:
    env_copy = dict(_FAKE_HOST_ENV)
    monkeypatch.setattr(os, "environ", env_copy)
    # Return the installed mapping (not the module-level template) so tests
    # comparing against it also see anything pytest injects mid-test.
    return env_copy


# ---------------------------------------------------------------------------
# is_blocked_env_name
# ---------------------------------------------------------------------------


class TestIsBlockedEnvName:
    @pytest.mark.parametrize(
        "name",
        [
            "OPENAI_API_KEY",
            "API_KEY",
            "KEY",
            "MY_SECRET_VALUE",
            "SECRET",
            "GITHUB_TOKEN",
            "ID_TOKEN",
            "PASSWORD",
            "PASSWD",
            "DB_PASS",
            "MYSQL_PWD",
            "PGPASSFILE",
            "GOOGLE_CREDENTIALS",
            "SERVICE_ACCOUNT_CREDENTIAL",
            "MY_DSN",
            # exact-name blocklist (no wildcard token in the name)
            "DATABASE_URL",
            "DATABASE_URI",
            "REDIS_URL",
            "MONGODB_URI",
            "MONGO_URL",
            "AMQP_URL",
            "RABBITMQ_URL",
            "POSTGRES_URL",
            "POSTGRESQL_URL",
            "MYSQL_URL",
            "CLICKHOUSE_URL",
            "CONNECTION_STRING",
            "CONN_STR",
            "GH_PAT",
            "GITHUB_PAT",
            "MYSQL_PWD",
            "REDISCLI_AUTH",
            "REDIS_AUTH",
            "PGSERVICEFILE",
            # credential-pointer helpers are scrubbed by design
            "GIT_ASKPASS",
            "SSH_ASKPASS",
            "SUDO_ASKPASS",
        ],
    )
    def test_credential_looking_names_blocked(self, name: str) -> None:
        assert is_blocked_env_name(name) is True

    @pytest.mark.parametrize(
        "name",
        [
            "PATH",
            "HOME",
            "SHELL",
            "LANG",
            "LC_ALL",
            "PWD",
            "OLDPWD",
            "TMPDIR",
            "VIRTUAL_ENV",
            "PYTHONPATH",
            "PYTHONHOME",
            "http_proxy",  # benign URL-shaped name: blanket *URL* is avoided
            "NO_PROXY",
        ],
    )
    def test_benign_system_names_inherited(self, name: str) -> None:
        assert is_blocked_env_name(name) is False

    def test_matching_is_case_insensitive(self) -> None:
        assert is_blocked_env_name("openai_api_key") is True
        assert is_blocked_env_name("Github_Token") is True
        assert is_blocked_env_name("database_url") is True

    def test_pass_substring_scrubbed_fail_safe(self) -> None:
        """Incidental names containing PASS (COMPASS_*, BYPASS_*) are scrubbed
        too — the documented fail-safe direction."""
        assert is_blocked_env_name("COMPASS_DIRECTION") is True
        assert is_blocked_env_name("BYPASS_FILTER") is True

    def test_allowlist_bypasses_blocked_patterns(self) -> None:
        allowlist = frozenset({"TUSHARE_TOKEN", "X_AUTH_TOKEN"})
        assert is_blocked_env_name("TUSHARE_TOKEN") is True  # blocked without allowlist
        assert is_blocked_env_name("TUSHARE_TOKEN", allowlist) is False
        assert is_blocked_env_name("X_AUTH_TOKEN", allowlist) is False
        # The allowlist exempts names, it does not re-block others.
        assert is_blocked_env_name("OPENAI_API_KEY", allowlist) is True

    def test_empty_allowlist_keeps_default_scrubbing(self) -> None:
        assert is_blocked_env_name("OPENAI_API_KEY", frozenset()) is True


# ---------------------------------------------------------------------------
# build_sandbox_env
# ---------------------------------------------------------------------------


class TestBuildSandboxEnv:
    def test_host_credentials_scrubbed(self, fake_host_environ: dict[str, str]) -> None:
        env = build_sandbox_env()
        for key in _SCRUBBED_KEYS:
            assert key not in env, f"{key} leaked into sandbox env"
        assert "sk-host-key-do-not-leak" not in list(env.values())
        assert "host-db-password" not in list(env.values())

    def test_benign_host_environment_inherited(self, fake_host_environ: dict[str, str]) -> None:
        env = build_sandbox_env()
        for key in _UNSCRUBBED_KEYS:
            assert env[key] == fake_host_environ[key]

    def test_injected_secrets_layered_on_top(self, fake_host_environ: dict[str, str]) -> None:
        env = build_sandbox_env(injected={"SKILL_API_TOKEN": "req-scoped-token"})
        assert env["SKILL_API_TOKEN"] == "req-scoped-token"

    def test_injected_secret_wins_over_scrubbed_host_name(
        self, fake_host_environ: dict[str, str]
    ) -> None:
        """Injection is authorized upstream, so it overrides the scrub of the
        same host variable name."""
        env = build_sandbox_env(injected={"OPENAI_API_KEY": "req-scoped-key"})
        assert env["OPENAI_API_KEY"] == "req-scoped-key"

    def test_allowlist_resumes_dollar_ref_from_host_env(
        self, fake_host_environ: dict[str, str], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("TUSHARE_TOKEN", "ts-allowlisted-token")
        env = build_sandbox_env(allowlist={"TUSHARE_TOKEN": "$TUSHARE_TOKEN"})
        assert env["TUSHARE_TOKEN"] == "ts-allowlisted-token"

    def test_allowlist_literal_value_passed_through(
        self, fake_host_environ: dict[str, str]
    ) -> None:
        env = build_sandbox_env(allowlist={"LITERAL_SETTING": "plain-value"})
        assert env["LITERAL_SETTING"] == "plain-value"

    def test_allowlist_dollar_ref_to_missing_var_resolves_empty(
        self, fake_host_environ: dict[str, str]
    ) -> None:
        env = build_sandbox_env(allowlist={"MISSING_TOKEN": "$QILIN_DEFINITELY_UNSET_VAR"})
        assert env["MISSING_TOKEN"] == ""

    def test_injection_applied_after_allowlist(self, fake_host_environ: dict[str, str]) -> None:
        env = build_sandbox_env(
            injected={"SHARED_NAME": "injected"},
            allowlist={"SHARED_NAME": "allowlisted"},
        )
        assert env["SHARED_NAME"] == "injected"

    def test_no_injection_or_allowlist_returns_scrubbed_inheritance(
        self, fake_host_environ: dict[str, str]
    ) -> None:
        # PYTEST_CURRENT_TEST is injected by pytest itself mid-test; it is not
        # part of the environment under test on either side.
        actual = {
            key: value
            for key, value in build_sandbox_env().items()
            if key != "PYTEST_CURRENT_TEST"
        }
        expected = {
            key: value
            for key, value in fake_host_environ.items()
            if key not in _SCRUBBED_KEYS and key != "PYTEST_CURRENT_TEST"
        }
        assert actual == expected


# ---------------------------------------------------------------------------
# mask_secret_values — bash output sanitization
# ---------------------------------------------------------------------------


class TestMaskSecretValues:
    def test_secret_value_absent_and_redaction_marker_present(self) -> None:
        token = "ghp_" + "a" * 32
        output = mask_secret_values(
            f"token={token}\nexit 0", {"GITHUB_TOKEN": token}
        )
        assert token not in output
        assert "token=[redacted]" in output
        assert "exit 0" in output

    def test_every_occurrence_redacted(self) -> None:
        token = "sk-live-" + "b" * 24
        output = mask_secret_values(
            f"first {token} second {token}", {"API_KEY": token}
        )
        assert token not in output
        assert output.count("[redacted]") == 2

    def test_longest_value_replaced_first(self) -> None:
        """A value that is a prefix of another must not shred the longer one
        into a partially-revealed remainder."""
        long_value = "supersecretvalue" + "X" * 10
        short_value = "supersecretvalue"  # 16 chars: also above the threshold
        output = mask_secret_values(
            long_value, {"SHORT": short_value, "LONG": long_value}
        )
        assert output == "[redacted]"
        assert "supersecretvalue" not in output

    def test_values_below_min_length_left_untouched(self) -> None:
        assert mask_secret_values("region 1234567", {"REGION": "1234567"}) == "region 1234567"

    def test_value_exactly_at_min_length_redacted(self) -> None:
        assert mask_secret_values("pin 12345678", {"PIN": "12345678"}) == "pin [redacted]"

    def test_empty_values_skipped(self) -> None:
        assert mask_secret_values("output", {"EMPTY": ""}) == "output"

    def test_none_injected_env_passthrough(self) -> None:
        assert mask_secret_values("token=whatever", None) == "token=whatever"

    def test_empty_output_passthrough(self) -> None:
        assert mask_secret_values("", {"TOKEN": "valuevalue"}) == ""


class TestInjectedSecretLifecycle:
    def test_scrubbed_host_env_plus_request_secret_end_to_end(
        self, fake_host_environ: dict[str, str], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Integration of the two surfaces: build the subprocess env for a
        skill that declared a secret, simulate the script echoing both the
        injected token and a host platform key reference, and confirm bash
        output sanitization removes the injected secret value."""
        request_token = "req-" + "c" * 40
        injected = {"SKILL_SECRET_TOKEN": request_token}
        env = build_sandbox_env(injected=injected)

        # The host platform credential never made it into the subprocess env.
        assert "OPENAI_API_KEY" not in env
        assert fake_host_environ["OPENAI_API_KEY"] not in list(env.values())
        # The request-scoped secret did.
        assert env["SKILL_SECRET_TOKEN"] == request_token

        script_output = (
            f"set -x: export SKILL_SECRET_TOKEN={request_token}\n"
            f"host key was: {fake_host_environ['DB_PASS']}\n"
            "done"
        )
        sanitized = mask_secret_values(script_output, injected)

        assert request_token not in sanitized
        assert "[redacted]" in sanitized
        assert "done" in sanitized

    def test_host_secret_scrubbed_at_inheritance_so_mask_has_nothing_to_leak(
        self, fake_host_environ: dict[str, str]
    ) -> None:
        """A host credential is absent from the injected env by construction;
        if a script nonetheless prints it, masking of injected values alone
        will not catch it — that is the inheritance scrub's job."""
        env = build_sandbox_env()
        leaked_output = f"db pass: {fake_host_environ['DB_PASS']}"
        assert mask_secret_values(leaked_output, None) == leaked_output
        assert "DB_PASS" not in env
