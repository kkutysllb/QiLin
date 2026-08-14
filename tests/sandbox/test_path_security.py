"""Security-regression tests for local-sandbox path validation and masking.

Covers the three host-boundary layers of ``qilin.sandbox.tools``:

- ``validate_local_tool_path`` — the virtual-path gate (which path *families*
  are reachable, and rejection of ``..`` traversal in both separator styles).
- ``resolve_and_validate_user_data_path`` — post-resolution containment of
  ``/mnt/user-data`` paths inside the per-thread roots (catches ``..`` escapes
  and symlink redirection that survive lexical checks).
- ``validate_local_bash_command_paths`` — the opt-in host-bash guard (absolute
  paths outside the allowlist, ``file://`` URLs, unsafe ``cd`` targets, and
  ``..`` segments in command tokens).

Plus the pure pattern/flag helpers those layers share:
``qilin.sandbox.path_patterns.build_output_mask_pattern`` (host→virtual output
masking boundary rules) and ``qilin.sandbox.security`` (host-bash gating).

Every case asserts the *implemented* behavior. Percent-encoded traversal
(``%2e%2e``) is deliberately asserted as NOT decoded — no layer in this module
percent-decodes, so such a segment is a literal (harmless, in-bounds) filename.
"""

from pathlib import Path
from types import SimpleNamespace

import pytest

import qilin.sandbox.tools as sandbox_tools
from qilin.agents.thread_state import ThreadDataState
from qilin.sandbox.exceptions import SandboxRuntimeError
from qilin.sandbox.path_patterns import build_output_mask_pattern
from qilin.sandbox.security import is_host_bash_allowed, uses_local_sandbox_provider

VIRTUAL_ROOT = "/mnt/user-data"
SKILLS_ROOT = "/mnt/skills"
ACP_ROOT = "/mnt/acp-workspace"


@pytest.fixture(autouse=True)
def hermetic_sandbox_config(monkeypatch: pytest.MonkeyPatch) -> None:
    """Pin config-derived lookups so verdicts depend only on thread_data.

    Without this, a config.yaml present in another test's fixture (or the
    module-level caches in tools.py) could add custom mounts / MCP allowed
    paths and change accept/reject outcomes.
    """
    monkeypatch.setattr(sandbox_tools, "_get_skills_container_path", lambda: SKILLS_ROOT)
    monkeypatch.setattr(sandbox_tools, "_get_skills_host_path", lambda: None)
    monkeypatch.setattr(sandbox_tools, "_get_acp_workspace_host_path", lambda thread_id=None: None)
    monkeypatch.setattr(sandbox_tools, "_get_custom_mounts", lambda: [])
    monkeypatch.setattr(sandbox_tools, "_get_mcp_allowed_paths", lambda: [])


@pytest.fixture
def thread_data(tmp_path: Path) -> ThreadDataState:
    user_data = tmp_path / "threads" / "t1" / "user-data"
    workspace = user_data / "workspace"
    uploads = user_data / "uploads"
    outputs = user_data / "outputs"
    for directory in (workspace, uploads, outputs):
        directory.mkdir(parents=True)
    return {
        "workspace_path": str(workspace),
        "uploads_path": str(uploads),
        "outputs_path": str(outputs),
    }


# ---------------------------------------------------------------------------
# validate_local_tool_path — virtual-path gate
# ---------------------------------------------------------------------------


class TestValidateLocalToolPath:
    def test_user_data_paths_allowed_for_read_and_write(self, thread_data: ThreadDataState) -> None:
        for read_only in (True, False):
            sandbox_tools.validate_local_tool_path(
                f"{VIRTUAL_ROOT}/workspace/report.md", thread_data, read_only=read_only
            )
            sandbox_tools.validate_local_tool_path(
                f"{VIRTUAL_ROOT}/uploads/logo.png", thread_data, read_only=read_only
            )
            sandbox_tools.validate_local_tool_path(
                f"{VIRTUAL_ROOT}/outputs/artifact.bin", thread_data, read_only=read_only
            )

    def test_skills_paths_read_only(self, thread_data: ThreadDataState) -> None:
        path = f"{SKILLS_ROOT}/public/bootstrap/SKILL.md"
        sandbox_tools.validate_local_tool_path(path, thread_data, read_only=True)
        with pytest.raises(PermissionError, match="Write access to skills path"):
            sandbox_tools.validate_local_tool_path(path, thread_data, read_only=False)

    def test_acp_workspace_paths_read_only(self, thread_data: ThreadDataState) -> None:
        path = f"{ACP_ROOT}/hello_world.py"
        sandbox_tools.validate_local_tool_path(path, thread_data, read_only=True)
        with pytest.raises(PermissionError, match="Write access to ACP workspace"):
            sandbox_tools.validate_local_tool_path(path, thread_data, read_only=False)

    @pytest.mark.parametrize(
        "path",
        [
            "/etc/passwd",  # absolute host escape
            "/root/.ssh/id_rsa",
            "/mnt",  # virtual tree's parent, not under any allowed family
            f"{VIRTUAL_ROOT}-backup/x",  # prefix sibling, not segment-boundary match
            f"{SKILLS_ROOT}-extra/SKILL.md",
            "report.md",  # relative paths are not virtual paths
            "~/workspace/report.md",
            r"\mnt\user-data\workspace\a.txt",  # windows spelling is not recognized
        ],
    )
    def test_paths_outside_allowed_families_rejected(
        self, thread_data: ThreadDataState, path: str
    ) -> None:
        with pytest.raises(PermissionError, match="Only paths under"):
            sandbox_tools.validate_local_tool_path(path, thread_data, read_only=True)

    def test_missing_thread_data_fails_closed(self) -> None:
        with pytest.raises(SandboxRuntimeError, match="Thread data not available"):
            sandbox_tools.validate_local_tool_path(f"{VIRTUAL_ROOT}/workspace/a.txt", None)


# ---------------------------------------------------------------------------
# traversal rejection — relative and absolute, both separator styles
# ---------------------------------------------------------------------------


class TestTraversalRejection:
    @pytest.mark.parametrize(
        "path",
        [
            f"{VIRTUAL_ROOT}/workspace/../workspace/a.txt",
            f"{VIRTUAL_ROOT}/workspace/../../..",
            f"{VIRTUAL_ROOT}/uploads/..",
            "../etc/passwd",  # bare relative escape
            "../../root/.ssh/id_rsa",
        ],
    )
    def test_dotdot_segments_rejected(self, thread_data: ThreadDataState, path: str) -> None:
        with pytest.raises(PermissionError, match="path traversal detected"):
            sandbox_tools.validate_local_tool_path(path, thread_data, read_only=True)

    def test_backslash_dotdot_segments_rejected(self, thread_data: ThreadDataState) -> None:
        """Windows-style separators are normalized before the ``..`` check."""
        path = f"{VIRTUAL_ROOT}/workspace\\..\\..\\x"
        with pytest.raises(PermissionError, match="path traversal detected"):
            sandbox_tools.validate_local_tool_path(path, thread_data, read_only=True)

    def test_dotdot_inside_filename_not_flagged(self, thread_data: ThreadDataState) -> None:
        """``..`` must be a whole segment, not a substring of a file name."""
        sandbox_tools.validate_local_tool_path(
            f"{VIRTUAL_ROOT}/workspace/a..b/notes..txt", thread_data, read_only=True
        )

    def test_percent_encoded_traversal_is_not_decoded(self, thread_data: ThreadDataState) -> None:
        """Current behavior: no layer percent-decodes, so ``%2e%2e`` is a
        literal (in-bounds) directory name rather than an escape."""
        path = f"{VIRTUAL_ROOT}/workspace/%2e%2e/x"
        sandbox_tools.validate_local_tool_path(path, thread_data, read_only=True)
        resolved = sandbox_tools.resolve_and_validate_user_data_path(path, thread_data)
        assert resolved.endswith("workspace/%2e%2e/x")


# ---------------------------------------------------------------------------
# resolve_and_validate_user_data_path — post-resolution containment
# ---------------------------------------------------------------------------


class TestResolveAndValidateUserDataPath:
    def test_resolves_virtual_path_into_thread_workspace(
        self, thread_data: ThreadDataState
    ) -> None:
        resolved = Path(
            sandbox_tools.resolve_and_validate_user_data_path(
                f"{VIRTUAL_ROOT}/workspace/sub/a.txt", thread_data
            )
        )
        assert resolved == Path(thread_data["workspace_path"]).resolve() / "sub" / "a.txt"

    def test_dotdot_that_stays_inside_the_three_roots_resolves(
        self, thread_data: ThreadDataState
    ) -> None:
        """Containment is over the union of workspace, uploads and outputs, so
        a lexical hop between sibling roots resolves (and is normalized)."""
        resolved = Path(
            sandbox_tools.resolve_and_validate_user_data_path(
                f"{VIRTUAL_ROOT}/workspace/../uploads/u.txt", thread_data
            )
        )
        assert resolved == Path(thread_data["uploads_path"]).resolve() / "u.txt"

    def test_dotdot_escaping_all_roots_rejected(self, thread_data: ThreadDataState) -> None:
        path = f"{VIRTUAL_ROOT}/workspace/../../../../../etc/passwd"
        with pytest.raises(PermissionError, match="path traversal detected"):
            sandbox_tools.resolve_and_validate_user_data_path(path, thread_data)

    def test_symlink_pointing_outside_roots_rejected(
        self, thread_data: ThreadDataState, tmp_path: Path
    ) -> None:
        """The containment check runs on the *resolved* path, so a symlink
        planted inside the workspace cannot redirect outside the roots."""
        secret = tmp_path / "outside-secret.txt"
        secret.write_text("host secret")
        (Path(thread_data["workspace_path"]) / "escape").symlink_to(secret)

        with pytest.raises(PermissionError, match="path traversal detected"):
            sandbox_tools.resolve_and_validate_user_data_path(
                f"{VIRTUAL_ROOT}/workspace/escape", thread_data
            )

    def test_symlink_pointing_inside_workspace_allowed(
        self, thread_data: ThreadDataState
    ) -> None:
        workspace = Path(thread_data["workspace_path"])
        target = workspace / "real.txt"
        target.write_text("content")
        link_dir = workspace / "sub"
        link_dir.mkdir()
        (link_dir / "in").symlink_to(target)

        resolved = Path(
            sandbox_tools.resolve_and_validate_user_data_path(
                f"{VIRTUAL_ROOT}/workspace/sub/in", thread_data
            )
        )
        assert resolved == target.resolve()


# ---------------------------------------------------------------------------
# validate_local_bash_command_paths — host-bash guard
# ---------------------------------------------------------------------------


def assert_bash_allowed(command: str, thread_data: ThreadDataState) -> None:
    sandbox_tools.validate_local_bash_command_paths(command, thread_data)


def assert_bash_rejected(command: str, thread_data: ThreadDataState, message: str) -> None:
    with pytest.raises(PermissionError, match=message):
        sandbox_tools.validate_local_bash_command_paths(command, thread_data)


class TestValidateLocalBashCommandPaths:
    def test_missing_thread_data_rejected(self) -> None:
        with pytest.raises(SandboxRuntimeError, match="Thread data not available"):
            sandbox_tools.validate_local_bash_command_paths("ls", None)

    def test_virtual_paths_allowed(self, thread_data: ThreadDataState) -> None:
        assert_bash_allowed(f"cat {VIRTUAL_ROOT}/workspace/a.txt", thread_data)
        assert_bash_allowed(f"cd {VIRTUAL_ROOT}/workspace/sub && pwd", thread_data)
        assert_bash_allowed(f"ls {SKILLS_ROOT}/public", thread_data)
        assert_bash_allowed(f"cat {ACP_ROOT}/hello.py", thread_data)

    def test_system_path_allowlist(self, thread_data: ThreadDataState) -> None:
        assert_bash_allowed("cat /dev/null", thread_data)
        assert_bash_allowed("echo hi > /dev/null", thread_data)
        assert_bash_allowed("ls /usr/bin", thread_data)

    def test_host_absolute_paths_rejected(self, thread_data: ThreadDataState) -> None:
        assert_bash_rejected("cat /etc/passwd", thread_data, "Unsafe absolute paths")
        assert_bash_rejected("grep root /etc/passwd", thread_data, "Unsafe absolute paths")

    def test_bare_root_argument_rejected_for_root_path_commands(
        self, thread_data: ThreadDataState
    ) -> None:
        assert_bash_rejected("ls /", thread_data, "Unsafe absolute paths in command: /")

    def test_file_url_rejected(self, thread_data: ThreadDataState) -> None:
        assert_bash_rejected(
            "python -c 'open(\"file:///etc/passwd\")'", thread_data, "Unsafe file:// URL"
        )

    def test_non_file_url_with_dotdot_allowed(self, thread_data: ThreadDataState) -> None:
        """``..`` inside an http(s) URL is a URL path component, not a file
        path — the URL span is exempted from traversal and absolute-path
        scanning."""
        assert_bash_allowed("curl -sSL https://example.com/a/../b", thread_data)
        assert_bash_allowed(
            f"curl -sSL -o {VIRTUAL_ROOT}/workspace/o.json https://example.com/x",
            thread_data,
        )

    def test_relative_dotdot_tokens_rejected(self, thread_data: ThreadDataState) -> None:
        assert_bash_rejected("cat ../../etc/passwd", thread_data, "path traversal detected")

    def test_windows_separator_dotdot_in_tokens_rejected(
        self, thread_data: ThreadDataState
    ) -> None:
        # The shell collapses ``\\`` to a literal backslash, leaving a
        # windows-style ``..\`` traversal in the token — the guard rejects it.
        assert_bash_rejected("cat sub\\\\..\\\\..\\\\x", thread_data, "path traversal detected")

    def test_unsafe_cwd_changes_rejected(self, thread_data: ThreadDataState) -> None:
        assert_bash_rejected("cd /etc && ls", thread_data, "Unsafe working directory change")
        assert_bash_rejected("pushd /etc", thread_data, "Unsafe working directory change")
        assert_bash_rejected("command cd /etc", thread_data, "Unsafe working directory change")
        assert_bash_rejected("cd ~", thread_data, "Unsafe working directory change")
        assert_bash_rejected("cd $HOME", thread_data, "Unsafe working directory change")
        assert_bash_rejected(
            "echo $(cd /etc; pwd)", thread_data, "Unsafe working directory change in command"
        )

    def test_brace_expansion_of_host_paths_rejected(self, thread_data: ThreadDataState) -> None:
        """``{passwd,shadow}`` reconstitutes real host paths at runtime and
        must not be exempted like an ``{id}`` REST placeholder."""
        assert_bash_rejected(
            "cat /etc/{passwd,shadow}", thread_data, "Unsafe absolute paths"
        )

    def test_identifier_placeholder_url_allowed(self, thread_data: ThreadDataState) -> None:
        assert_bash_allowed(
            "curl https://api.example.com/devices/{id}/port", thread_data
        )

    def test_non_ascii_literal_fragment_allowed(self, thread_data: ThreadDataState) -> None:
        assert_bash_allowed('python -c "print(f\'/端口{port}\')"', thread_data)


# ---------------------------------------------------------------------------
# output masking — host paths must not reach the model
# ---------------------------------------------------------------------------


class TestMaskLocalPathsInOutput:
    def test_workspace_and_uploads_host_paths_masked(
        self, thread_data: ThreadDataState
    ) -> None:
        output = (
            f"wrote {thread_data['workspace_path']}/a.txt; "
            f"read {thread_data['uploads_path']}/u.png"
        )
        assert (
            sandbox_tools.mask_local_paths_in_output(output, thread_data)
            == f"wrote {VIRTUAL_ROOT}/workspace/a.txt; read {VIRTUAL_ROOT}/uploads/u.png"
        )

    def test_windows_spelling_of_host_path_masked(self, thread_data: ThreadDataState) -> None:
        backslash_spelling = thread_data["workspace_path"].replace("/", "\\") + "\\a.txt"
        assert (
            sandbox_tools.mask_local_paths_in_output(backslash_spelling, thread_data)
            == f"{VIRTUAL_ROOT}/workspace/a.txt"
        )

    def test_host_sibling_of_user_data_root_not_rewritten(
        self, thread_data: ThreadDataState, tmp_path: Path
    ) -> None:
        """Segment-boundary rule: a host sibling that merely shares the
        user-data prefix must not be rewritten into the thread's virtual root
        (rewriting it would fabricate a virtual path that resolves nowhere)."""
        sibling = tmp_path / "threads" / "t1" / "user-data-backup"
        output = f"found {sibling}/x"
        assert sandbox_tools.mask_local_paths_in_output(output, thread_data) == output

    def test_no_thread_data_leaves_output_unchanged(
        self, thread_data: ThreadDataState
    ) -> None:
        output = f"{thread_data['workspace_path']}/a.txt"
        assert sandbox_tools.mask_local_paths_in_output(output, None) == output


class TestBuildOutputMaskPattern:
    BASE = "/data/skills"

    def test_bare_base_matches(self) -> None:
        assert build_output_mask_pattern(self.BASE).sub("M", "/data/skills") == "M"

    def test_base_plus_tail_matches(self) -> None:
        pattern = build_output_mask_pattern(self.BASE)
        assert pattern.sub("M", "/data/skills/a/b.txt") == "M"
        assert pattern.sub("M", "/data/skills\\a\\b.txt") == "M"  # backslash tail is by design

    def test_prefix_sibling_does_not_match(self) -> None:
        assert build_output_mask_pattern(self.BASE).sub("M", "/data/skills-extra") == "/data/skills-extra"

    def test_text_oriented_boundary_allows_colon_and_comma(self) -> None:
        assert build_output_mask_pattern(self.BASE).sub("M", "x:/data/skills,y") == "x:M,y"

    def test_base_at_end_of_string_matches(self) -> None:
        assert build_output_mask_pattern(self.BASE).sub("M", "end /data/skills") == "end M"

    def test_tail_stops_at_whitespace(self) -> None:
        assert build_output_mask_pattern(self.BASE).sub("M", "/data/skills/a b") == "M b"

    def test_separator_agnostic_matches_backslash_output(self) -> None:
        pattern = build_output_mask_pattern(self.BASE, separator_agnostic=True)
        assert pattern.sub("M", "/data/skills\\a\\b") == "M"

    def test_agnostic_backslash_base_matches_forward_output(self) -> None:
        pattern = build_output_mask_pattern("\\\\srv\\data\\skills", separator_agnostic=True)
        assert pattern.sub("M", "//srv/data/skills/a") == "M"


# ---------------------------------------------------------------------------
# security.py — host-bash capability gating
# ---------------------------------------------------------------------------


def _config(use: str, allow_host_bash: bool | None = False, *, with_sandbox: bool = True) -> object:
    sandbox = SimpleNamespace(use=use, allow_host_bash=allow_host_bash) if with_sandbox else None
    return SimpleNamespace(sandbox=sandbox)


class TestHostBashGate:
    @pytest.mark.parametrize(
        "provider",
        [
            "qilin.sandbox.local:LocalSandboxProvider",
            "qilin.sandbox.local.local_sandbox_provider:LocalSandboxProvider",
        ],
    )
    def test_local_provider_markers_recognized(self, provider: str) -> None:
        assert uses_local_sandbox_provider(_config(provider))

    def test_local_module_suffix_path_recognized(self) -> None:
        assert uses_local_sandbox_provider(_config("pkg.sub:LocalSandboxProvider")) is False
        assert uses_local_sandbox_provider(_config("qilin.sandbox.local.deep:LocalSandboxProvider"))

    def test_non_local_providers_not_recognized(self) -> None:
        assert uses_local_sandbox_provider(_config("qilin.sandbox.aio:AioSandboxProvider")) is False
        assert uses_local_sandbox_provider(_config("")) is False

    def test_non_local_provider_allows_host_bash_without_opt_in(self) -> None:
        assert is_host_bash_allowed(_config("qilin.sandbox.aio:AioSandboxProvider")) is True

    def test_local_provider_denies_host_bash_by_default(self) -> None:
        provider = "qilin.sandbox.local:LocalSandboxProvider"
        assert is_host_bash_allowed(_config(provider, allow_host_bash=False)) is False

    def test_local_provider_allows_host_bash_with_explicit_opt_in(self) -> None:
        provider = "qilin.sandbox.local:LocalSandboxProvider"
        assert is_host_bash_allowed(_config(provider, allow_host_bash=True)) is True

    def test_missing_sandbox_config_denies_host_bash(self) -> None:
        assert is_host_bash_allowed(_config("", with_sandbox=False)) is False
