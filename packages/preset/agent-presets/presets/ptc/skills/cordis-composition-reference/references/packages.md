# Loadable QiLin plugin packages

This file is GENERATED from workspace manifests (`scripts/gen-plugin-packages.ts`) and verified fresh by `pnpm run verify-plugin-packages` (part of `doc-sync`); do not edit it by hand.

Every package below exports a Cordis plugin that a bundle patch can name in a Loader row. `Config` marks packages whose row accepts a `config` mapping; read the `Config` declaration a package ships for the fields it accepts. Packages under `experimental` are pre-stable.

## acp

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/acp` | yes | Automation-only Agent Client Protocol server for driving QiLin agents over JSON-RPC stdio |

## api

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/api-gateway` | yes | Typert Remote Host dispatcher and Client API endpoint |
| `@qilin-agent/api-job-controller` | yes | Job Remote observation stream and the reference-counted client job-output service |
| `@qilin-agent/api-remotes` | no | Remote BFF assembly for application-selected Host capabilities |
| `@qilin-agent/api-session-controller` | yes | Session Remote commands, cold reads, and live control transport |
| `@qilin-agent/api-settings-controller` | yes | Remote owner for the configuration surfaces over the settings-domain seams |
| `@qilin-agent/api-terminal-controller` | yes | Session-owned interactive terminals with shell discovery, screen recovery and typed Remote control |
| `@qilin-agent/api-workspace-controller` | no | Workspace Remote commands and reconnect-safe state transport |
| `@qilin-agent/api-workspace-files` | yes | Workspace file service and Client resource provider: bounded reads, directory listing, and live metadata over the workspaceFiles Remote namespace |
| `@qilin-agent/api-workspace-git` | yes | Host owner of the workspaceGit Remote namespace: repository discovery, porcelain status, staging, commits, branches, and push/pull inside the session workspace root |

## attachment

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/attachment-local` | yes | Private content-addressed QILIN_HOME attachment storage |

## boot

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/hmr` | yes | Coordinated module and profile configuration hot reload |
| `@qilin-agent/plugin-manager` | yes | Current-profile plugin and bundle management shared by qilin CLI, Web and agent tools |

## browser-use

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/browser-use` | no | Exclusive named browser-use provider registration |

## bundle

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/acp-app` | no | The qilin ACP profile bundle: automation-only JSON-RPC stdio and process lifecycle over qilin-base |
| `@qilin-agent/headless` | yes | The qilin one-shot bundle: a direct core Agent/Session runner over qilin-base with no Host, HTTP, or browser layer |
| `@qilin-agent/sdk-app` | yes | The qilin SDK profile bundle: stdio JSON-RPC serving and process lifecycle over qilin-base |
| `@qilin-agent/web-app` | yes | The qilin browser-surface bundle: the web patch layer over qilin-base plus the runtime glue plugin (frontend dist serving, web-surface prompt, bash runtime variables, URL line) |

## client

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/client-connection` | yes | Authenticated RPC transport and generation lifecycle |
| `@qilin-agent/client-file-upload` | no | Agent-scoped browser file upload, streaming intake, and staged receipt service |
| `@qilin-agent/client-hmr` | yes | Web client graph synchronization and rebuilt-bundle reload transport |
| `@qilin-agent/client-locale` | no | Locale plugin: Host-backed preference, extensible language catalog, browser fallback, and typed built-in dictionaries |
| `@qilin-agent/client-modules` | no | Client module system, dual-face: node half composes the __QILIN_BOOT__ entry graph (incremental qilin.client scan, bundle route, index tap, webPlugins service); browser half is the lazy-CJS module table the vendored cordis Loader consumes as its internal seam |
| `@qilin-agent/client-resources` | no | Unified client resource model: protocol-registered providers turn URL addresses into live values, consumed through the useResource global standard hook |
| `@qilin-agent/client-shortcuts` | yes | Application keyboard command registry and physical-key routing |
| `@qilin-agent/client-ui-account` | no | Account menu in the Web client sidebar footer: theme, language, Settings, and sign-out |
| `@qilin-agent/client-ui-agent-opens` | no | Opens what the model asked to see in the Session's Sidebar |
| `@qilin-agent/client-ui-agent-preset` | no | Agent-preset surfaces: the default for later sessions, this session's seat, and the composition editor |
| `@qilin-agent/client-ui-approval` | no | Approval composer takeover over the scoped Remote Event waterfall |
| `@qilin-agent/client-ui-attachment` | no | Dynamic attachment presentation plugin for conversation input, message-image, and trajectory image slots |
| `@qilin-agent/client-ui-brand` | no | QiLin brand occupants for the Web client's sidebar and conversation-hero brand slots: the 麒麟 seal mark |
| `@qilin-agent/client-ui-chat` | no | Chat Conversation target, node definitions, renderers, and details surface |
| `@qilin-agent/client-ui-commands` | no | Client command surface: global directory cache, '/' source, three command UI kinds, popupSelect registry |
| `@qilin-agent/client-ui-conversation` | no | Target-neutral Conversation assembly, shell, composer, queue, and view navigation |
| `@qilin-agent/client-ui-deliverables` | no | Changed-files card with per-file comparison tabs, delivery cards, and clickable final-response file references for Web |
| `@qilin-agent/client-ui-directory-picker-browse` | no | In-app directory browsing surface: the workspace directory-flow owner rendering the host's listing and creation primitives |
| `@qilin-agent/client-ui-directory-picker-native` | no | Native directory-picker surface: the renderless workspace directory-flow occupant driving the local Desktop or Host OS chooser |
| `@qilin-agent/client-ui-goal` | no | Session goal surface: GoalBar docked above the composer, read from the goal session projection |
| `@qilin-agent/client-ui-input-trigger` | no | Input trigger pipeline: '/' and '@' detection, candidate menu, pick routing to registered sources |
| `@qilin-agent/client-ui-jobs` | no | Session-header background-job list with on-demand streaming record panels |
| `@qilin-agent/client-ui-layout` | no | Shell plugin: three-column AppFrame with drag handles, ctx.layout viewing-state service (navigation + panels) |
| `@qilin-agent/client-ui-message-feedback` | no | The Web feedback surface: per-message Like/Dislike in the assistant-message action strip and the feedback dialog behind both ratings and /feedback, backed by the messageFeedback and sessionFeedback Host Remotes |
| `@qilin-agent/client-ui-model-selection` | no | Model selection over the shared model catalog, Session projection, and session.selectModel |
| `@qilin-agent/client-ui-open-in-app` | no | Web Session-header "Open In..." split button opening the session workspace directory in a locally installed application |
| `@qilin-agent/client-ui-permission-presets` | no | Permission surfaces: a new-session default in General settings and a current-session /permission popup over the permissions projection |
| `@qilin-agent/client-ui-plan` | no | Plan mode controls, persistent transcript plan cards, and sidebar Markdown previews |
| `@qilin-agent/client-ui-plugin-manager` | yes | Plugin management for the qilin web client: the sidebar Plugins panel installs, enables, disables, retries, and composes installed plugin packages |
| `@qilin-agent/client-ui-reference` | no | Unified Web @file and @session reference source |
| `@qilin-agent/client-ui-renderer` | no | Browser UI renderer: React slot bindings, ctx.uiRenderer, and the assembled application root |
| `@qilin-agent/client-ui-schedule` | no | Host task management page and Session reminder catalog |
| `@qilin-agent/client-ui-session` | no | Session Controller adapter for React and session-scoped slots |
| `@qilin-agent/client-ui-settings` | no | Settings domain base plugin: the settings-namespace scope service and the canonical settings slot-type contract |
| `@qilin-agent/client-ui-settings-general` | no | Settings shell plugin: the General section, shell trigger/header chrome content, and settings dictionaries |
| `@qilin-agent/client-ui-settings-mcp` | no | MCP servers page in Web Settings: patch-layer CRUD over the mcpServers Remote |
| `@qilin-agent/client-ui-settings-models` | no | Models settings and shared product-onboarding dialogs over existing settings and credential joins |
| `@qilin-agent/client-ui-settings-plugin-inventory` | no | Read-only Cordis Loader inventory tab in Web Plugins settings |
| `@qilin-agent/client-ui-settings-plugins` | no | Plugins settings section with feature-owned tabs and configurable host-plane plugin cards |
| `@qilin-agent/client-ui-settings-session-log` | no | General settings control for Session-log upload with DeepSeek API requests |
| `@qilin-agent/client-ui-settings-skills` | no | Skills page in Web Settings: the current Session's skill catalog grouped by discovery source |
| `@qilin-agent/client-ui-settings-unarchive-sessions` | no | Archived-session settings page: the registry-global archive set with one Unarchive action per row |
| `@qilin-agent/client-ui-shortcuts` | no | Keyboard shortcut reference, recording, and local preference editing |
| `@qilin-agent/client-ui-sidebar` | no | Sidebar plugin: session multi-level tree, search, grouping, state dots |
| `@qilin-agent/client-ui-sidebar-browser` | no | Sandboxed Web browser tabs for the right Sidebar |
| `@qilin-agent/client-ui-sidebar-documentpreview` | yes | Extensible document previews for Sidebar files: Office, Markdown, highlighted code, images, PDF, HTML, and plain text |
| `@qilin-agent/client-ui-sidebar-files` | no | Workspace file tree tab type for the right Sidebar: lazy directory listing over the workspaceFiles Remote namespace, opening files into the Sidebar |
| `@qilin-agent/client-ui-sidebar-git` | no | Source-control tab type for the right Sidebar: repository status, staging, commits, branches, and push/pull over the workspaceGit Remote namespace |
| `@qilin-agent/client-ui-sidebar-plans` | no | Task-plan tab type for the right Sidebar: scans the session workspace's convention plan documents and opens one as a file resource |
| `@qilin-agent/client-ui-sidebar-right` | no | Right Sidebar: the docking surface's session-bound state, its panel and header expand control, and the navigation service over it |
| `@qilin-agent/client-ui-sidebar-tasks` | no | Subagent topology and background-job tab type for the right Sidebar: this Session's direct-child catalog, the descendant totals its summary lineage records, and its live job list |
| `@qilin-agent/client-ui-sidebar-terminal` | no | Interactive shell tabs for the right Sidebar |
| `@qilin-agent/client-ui-sidechat` | no | Sidechat tab type for the right Sidebar: one panel with this Session's side threads, each forked from the parent log with the inherited prefix as reference context |
| `@qilin-agent/client-ui-skill` | no | Web skill references and the dedicated skill tool row |
| `@qilin-agent/client-ui-subagent` | no | Subagent conversation catalog, continuation routing UI, and '@' reference source |
| `@qilin-agent/client-ui-theme` | no | Theme plugin: Host bootstrap for the pre-plugin palette; DOM-free ThemeRuntime for light/dark/system state; --qilin-* token styles and Appearance settings row |
| `@qilin-agent/client-ui-theme-brand` | no | QiLin brand color layer for the Web client theme: alias-token overrides stacked over the user's active palette |
| `@qilin-agent/client-ui-tool` | no | Client Tool call-tree renderer and keyed per-tool presentation slot |
| `@qilin-agent/client-ui-trajectory` | no | Trajectory event ledger with an interactive timing overview: pure-consumer plugin registering into the conversation ViewMap (no service) |
| `@qilin-agent/client-ui-user-questions` | no | Web ask_user_question composer takeover and plan-review presentation UI |
| `@qilin-agent/client-ui-workbench` | no | Workbench tag state owner: the general/coding workbench selection, per-tag preset memory, and the preset-to-tag visibility fold |
| `@qilin-agent/client-ui-workflow-run` | no | Durable workflow-run Conversation Node and nested member disclosure for qilin web |
| `@qilin-agent/client-ui-workspace` | no | Workspace picker plugin: one WorkspacePicker registered into the sidebar and empty-state workspace slots |

## compaction

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/command-compact` | no | Human-facing slash command for explicit session compaction |
| `@qilin-agent/compaction-basic` | yes | Token-meter-driven compaction policy and LLM summarization backend for the QiLin |
| `@qilin-agent/compaction-image-offload` | no | Durable image offload for image-capable routes: replace over-budget request images with placeholders and retry |
| `@qilin-agent/compaction-tool-result-pruner` | yes | Replay-safe model-free head/middle/tail pruning for tool-result surface nodes |

## computer-use

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/computer-use` | no | Exclusive named computer-use provider registration |

## context

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/agent-instructions` | yes | Workspace context loader for AGENTS.md/CLAUDE.md instruction files |
| `@qilin-agent/file-reference-local` | yes | Local-filesystem ctx.fileReferences provider with bounded fuzzy indexes |
| `@qilin-agent/session-reference` | yes | Cross-session snapshot references and durable untrusted model context (ctx.sessionReferenceResolver) |
| `@qilin-agent/time-context` | yes | Durable per-step context with the current time and elapsed time |
| `@qilin-agent/tmux-context` | yes | Opt-in durable per-step context with this agent's tmux pane and window location |

## core

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/agent` | no | Agent interface, registry, initiator scope, and event vocabulary for the QiLin |
| `@qilin-agent/agent-default-model` | yes | Default model selection shared by Agent entry points |
| `@qilin-agent/agent-loop` | yes | The concrete agent loop plugin for the QiLin |
| `@qilin-agent/agent-tool-presentation` | yes | Agent-plane presentation selector: composes one agent's tools as PTC mode, native, or both |
| `@qilin-agent/session` | no | Event-sourced session store for the QiLin |
| `@qilin-agent/system-prompt` | yes | System prompt assembly registry for the QiLin |
| `@qilin-agent/tools` | yes | Tool registry and execution pipeline for the QiLin |

## credentials

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/authorization` | no | Authorization seam (ctx.authorization): plugin-owned flows that obtain a credential through a conversation with the human |
| `@qilin-agent/credentials-local` | yes | File-backed credentials provider ($QILIN_HOME/.env under the live process environment) for the QiLin |

## deliverables

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/tool-present` | yes | Explicit workspace file delivery declarations for the QiLin |
| `@qilin-agent/workspace-changes` | yes | Per-turn workspace file changes recorded from git working-tree snapshots and whole-file captures, with per-file comparisons, for the QiLin |

## document

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/office-to-pdf` | yes | Shared Office-to-PDF conversion with bounded queues and caching |

## experimental

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/experimental-agent-team` | yes | Implicit-root Agent Teams roster, durable peer mailbox, and shared task DAG |
| `@qilin-agent/experimental-api-speech-to-text` | yes | Authenticated experimental speech transcription for browser clients |
| `@qilin-agent/experimental-auto-review` | no | Per-tool LLM authorization review for the QiLin Auto permission preset |
| `@qilin-agent/experimental-browser-use-chrome-devtools-mcp` | yes | Experimental per-Session Chromium browser tools through chrome-devtools-mcp |
| `@qilin-agent/experimental-browser-use-playwright-mcp` | yes | Experimental per-Session Chromium browser tools through @playwright/mcp |
| `@qilin-agent/experimental-browser-use-stagehand-native` | yes | Experimental Stagehand browser tools with separately configured native models |
| `@qilin-agent/experimental-client-ui-agent-team` | no | Web Agent Teams roster, task board, and teammate navigation |
| `@qilin-agent/experimental-client-ui-cot-translation` | yes | Optional machine translation of expanded reasoning, preserving original Session text |
| `@qilin-agent/experimental-client-ui-voice-input` | no | Record speech and insert editable text into the conversation draft |
| `@qilin-agent/experimental-computer-use-cua-driver-mcp` | yes | Experimental computer use through an installed Cua Driver MCP executable |
| `@qilin-agent/experimental-computer-use-cua-driver-native` | no | Experimental computer-use provider embedding the Cua Driver native npm SDK |
| `@qilin-agent/experimental-hooks-claude-code` | yes | Bridge plugin: run a Claude Code hooks.json / settings hook config on the QiLin interception seams |
| `@qilin-agent/experimental-hooks-codex` | yes | Bridge plugin: run a Codex hooks.json hook config on the QiLin interception seams |
| `@qilin-agent/experimental-inspector` | yes | Experimental cross-realm CDP hub for Host debugging and Client Runtime inspection |
| `@qilin-agent/experimental-ptc-runtime-python` | yes | CPython subprocess implementation of the QiLin PTC execution seam |
| `@qilin-agent/experimental-session-inspector` | no | Experimental virtualized Session log and live Chat group/node inspectors |
| `@qilin-agent/experimental-session-title-all-prompts-llm` | yes | All-user-messages LLM provider plugin for QiLin session titles |
| `@qilin-agent/experimental-skill-badge` | no | Bundled qilin badge skill provider for QiLin |
| `@qilin-agent/experimental-speech-to-text` | yes | Experimental speech recognition with independently selectable providers |
| `@qilin-agent/experimental-speech-to-text-sensevoice` | yes | Local SenseVoice ONNX transcription with a managed sherpa-onnx process |
| `@qilin-agent/experimental-tool-agent-team` | yes | Scoped model-facing Agent Teams tools over ctx.agentTeams |
| `@qilin-agent/experimental-tool-ralph` | yes | Model-facing fresh-agent Ralph loop over the workflow and subagent seams |
| `@qilin-agent/experimental-tool-session-query` | yes | Workspace-authorized model-facing session history search, trace, and event read tools |
| `@qilin-agent/experimental-tool-terminal` | yes | Six model-facing persistent PTY tools with owner isolation and generic background-job integration |
| `@qilin-agent/experimental-tool-worktree` | no | Model tool that creates and enters a new Git worktree |
| `@qilin-agent/experimental-translator` | yes | Machine translation with reusable Session results |
| `@qilin-agent/experimental-webhook` | no | Fire-and-forget webhook rule runtime that creates Workspace-backed QiLin Sessions |
| `@qilin-agent/experimental-webhook-github` | yes | Signed GitHub HTTP webhook adapter for the QiLin webhook runtime |
| `@qilin-agent/experimental-worktree` | yes | Git worktree creation that enters the new checkout through the Session working directory |

## extensions

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/client-ui-kylin` | no | Kylin dynamic-plugin definition card: the keyed cordis_define tool row with its run/stop switch |
| `@qilin-agent/kylin-client-runner` | no | Browser half of dynamic dual-half plugin packages: event subscription, closure evaluation, guard facade, and loader entries |
| `@qilin-agent/kylin-host-runner` | yes | Dynamic package definition registry, host-half sandbox lifecycle, and invoke handler table for model-mounted dual-half packages |
| `@qilin-agent/tool-kylin` | no | Read-only runtime API inspection for Harness plugin development |

## feedback

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/command-feedback` | no | Log-only session feedback: the record event, the sessionFeedback Host Remote, and the human-facing slash command |
| `@qilin-agent/message-feedback` | yes | Canonical Session-log ratings and notes for finalized assistant messages |

## fs

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/fs-local` | yes | Local-filesystem implementation of the QiLin filesystem seam (ctx.fs) |
| `@qilin-agent/fs-observation-policy` | no | File-context policy plugin for the QiLin — observed-state, read-before-edit, and version-guarded write/edit added over the ctx.fs provider seam through the fs/* event gate (no service API) |
| `@qilin-agent/fs-sandbox` | yes | Sandbox-enforcing implementation of the QiLin filesystem seam: fences write/edit by the per-call sandbox mode (read-only denies mutation, workspace-write contains it to the workspace + temp roots) while reads pass through |
| `@qilin-agent/tool-fs` | yes | Model-facing filesystem tools (read, write, edit) over the QiLin filesystem seam (ctx.fs) |
| `@qilin-agent/tool-fs-search` | yes | Model-facing filesystem discovery tools (glob, grep) backed by the packaged ripgrep binary (@vscode/ripgrep) |
| `@qilin-agent/tool-str-replace-editor` | yes | Model-facing view, create, literal replace, and line insert tool over the Harness filesystem service |

## goal

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/command-goal` | no | Human-facing slash command for persisted same-session goals |
| `@qilin-agent/goal` | yes | Event-sourced same-session goal state and lifecycle service for the QiLin |
| `@qilin-agent/goal-round-driver` | no | Race-fenced same-session goal-round driver |
| `@qilin-agent/tool-goal` | yes | Model-facing same-session goal tools with execution-time authority checks |

## guard

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/repeat-tool-reminder` | yes | Repeat-tool-call guard plugin: advisory reminders when an agent loops on identical tool calls |
| `@qilin-agent/tool-call-timeout-policy` | no | Tool-call timeout policy: a tools/execute wrapper that arms a per-tool deadline on exec.signal and returns TOOL_TIMEOUT when it wins |

## host

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/host-directory-picker-auto` | no | Adaptive chooser of the directory-picker seam: resolves the host situation at boot and mounts the native or browse backend for the QiLin web GUI host |
| `@qilin-agent/host-directory-picker-browse` | yes | In-app browsing backend of the directory-picker seam (listing/creation primitives over the host filesystem) |
| `@qilin-agent/host-directory-picker-native` | no | Native-OS-chooser backend of the directory-picker seam for the QiLin web GUI host |
| `@qilin-agent/host-frontend-static` | yes | SPA dist server for the Web shell: owns the webserver fallback seat, serving explicit index entries and static assets with traversal rejection and 404 misses |
| `@qilin-agent/host-open-in-app` | yes | Host half of open-in-app: resolved application catalog, icons, and the launch endpoint as three webServer routes |
| `@qilin-agent/host-plugin-inventory` | no | Read-only Remote projection of current Cordis Loader plugin state |
| `@qilin-agent/host-preview-media` | yes | Host half of preview media: the /sidebar/media route serving session-workspace files to inline previews, with HTTP Range windows for seeking video |
| `@qilin-agent/host-webserver` | yes | Web route-registration plugin: HTTP and upgrade routes, index transform taps, and static dist fallback; knows no harness concepts |
| `@qilin-agent/sidebar-opens` | yes | Model-facing requests to open a file or an http(s) page in the Session's Sidebar |

## identity

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/accounts-local` | yes | Local browser accounts for the Web surface: one account file under the harness home, scrypt password hashes, signed HttpOnly session cookies, the /api/auth endpoints, and the transport's account-session gate |

## interaction

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/commands` | no | Plugin-owned human command registry for QiLin UIs |
| `@qilin-agent/permission-presets` | yes | User-facing permission presets (ctx.permissionPresets) for the QiLin: one product-level Permissions select bundling the sandbox-mode and approval-policy knobs, written through to their own session events |
| `@qilin-agent/tool-ask-user` | yes | Model-facing ask_user_question tool over the ctx.userQuestions seam |
| `@qilin-agent/user-approval` | yes | User-approval seam (ctx.approval) for the QiLin: one-shot permission decisions dispatched to composed answerers over the approval/request waterfall, fail-closed by default |
| `@qilin-agent/user-questions` | no | Abstract user-questions seam (ctx.userQuestions) for asking the human during agent runs |

## jobs

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/jobs-local` | yes | Process-local implementation of the QiLin background job registry seam |
| `@qilin-agent/tool-jobs` | yes | Model-facing background job control tools (job_output, job_list, job_kill) over the ctx.jobs registry |

## llm

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/deepseek-llm-api-extensions` | no | Additive request-field registry for the official DeepSeek LLM API adapter |
| `@qilin-agent/llm` | no | Provider-neutral LLM service interface for the QiLin |
| `@qilin-agent/llm-deepseek-api-key` | yes | DeepSeek api-key provider authentication and discovery |
| `@qilin-agent/llm-pi-ai` | yes | pi-ai-backed DeepSeek adapter for the QiLin LLM seam (design-verification twin of qilin-llm-deepseek) |
| `@qilin-agent/llm-retry` | yes | Provider-routed LLM request retry policy for the QiLin |
| `@qilin-agent/plugin-package-inventory-deepseek` | yes | Active Loader-backed plugin package inventory for official DeepSeek LLM API requests |
| `@qilin-agent/token-meter` | yes | Replay-aware token measurement service (ctx.tokenMeter) for the QiLin |

## lsp

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/lsp` | no | Abstract LSP capability seam (ctx.lsp) for the QiLin — language-server provider registry keyed by branded id and extension mapping, order-independent per-query selection, normalized definition/references/implementation/hover requests and results, and the LspError taxonomy |
| `@qilin-agent/lsp-stdio` | yes | Generic stdio language-server provider for the QiLin LSP capability seam (ctx.lsp) — spawns configured servers, translates JSON-RPC, and serves transient-open goToDefinition/findReferences/goToImplementation/hover queries in the host filesystem namespace |
| `@qilin-agent/tool-lsp` | yes | Model-facing lsp tool over the QiLin LSP capability seam (ctx.lsp) — one read-only tool with goToDefinition/findReferences/goToImplementation/hover operations, one-based UTF-16 cursor coordinates, bounded location rendering, and hover normalization |

## mcp

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/mcp-client` | yes | MCP client bridge: connects to MCP servers and registers their tools on ctx.tools |
| `@qilin-agent/mcp-resources` | no | Scoped MCP resource discovery and reading through shared model tools |
| `@qilin-agent/mcp-servers` | no | MCP server settings repository: CRUD over the mcp-client entries of the user patch layer |

## plan

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/plan-mode` | yes | Logged per-agent plan mode with deployment guidance, a direct slash command, and a user-reviewed exit |

## preset

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/agent-presets` | yes | Per-session agent composition from preset cordis.yml files for the QiLin |
| `@qilin-agent/persona` | yes | Composition-authored deployment persona section for the QiLin |

## ptc-runtime

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/ptc-runtime-node` | yes | Sandboxed Node process implementation of the QiLin PTC execution capability |

## sandbox

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/sandbox-local` | yes | Local process-sandbox backends for the QiLin sandbox seam: bwrap, the npm-distributed landlock-run launcher, macOS Seatbelt, or the Windows ACL restricted-token runner — functionally probed, fail-closed |
| `@qilin-agent/sandbox-policy` | yes | Per-call sandbox policy resolver and current model context: deployment fallbacks plus each session's mode and workspace root, shared by every enforcing capability family |

## schedule

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/schedule` | yes | Host-wide durable reminders with shared management and original-Session delivery |
| `@qilin-agent/tool-schedule` | no | Model-facing reminder management tools (schedule_create, schedule_list, schedule_update, schedule_delete) over the Host ctx.schedule service |

## sdk

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/sdk-jsonrpc-server` | yes | Stdio JSON-RPC server plugin for out-of-process QiLin SDK clients |

## session

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/session-checkpoint-policy` | no | Semantic session durability checkpoints before model requests and tool side effects |
| `@qilin-agent/session-log-deepseek` | yes | Incremental lossless session-log request extension for the official DeepSeek LLM API |
| `@qilin-agent/session-persistence-jsonl` | yes | JSONL durable session persistence backend for the QiLin |
| `@qilin-agent/session-projection` | no | Session-projection seam: the merge-extensible projection type table, the provider contract, and the ctx.sessionProjections registry serving whole current values of log-derived per-session state |
| `@qilin-agent/session-projection-cache` | yes | Persisted projection cache (ctx.sessionProjectionCache): durable per-session checkpoint records on the session_projcache storage domain (per-record layout), throttled write-behind, and the cached listing read |
| `@qilin-agent/session-stats` | no | Whole-log conversation counts and wall times projection (sessionStats) for the QiLin |
| `@qilin-agent/session-telemetry-otel` | yes | Feedback-authorized Session logs over byte-bounded OpenTelemetry HTTP requests |
| `@qilin-agent/session-title` | yes | Log-backed session title service and provider registry for the QiLin |
| `@qilin-agent/session-title-first-prompt-llm` | yes | First-message LLM provider plugin for QiLin session titles |
| `@qilin-agent/session-turn-outline` | no | Whole-log turn outline projection (turnOutline) for the QiLin |
| `@qilin-agent/tool-working-directory` | no | Read and change the active Session working directory |
| `@qilin-agent/working-directory` | yes | Session working directories with durable changes and model context |

## session-query

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/session-log-export` | yes | Web Session-log export command and shared download dialog |
| `@qilin-agent/session-query-sqlite` | yes | Concrete ctx.sessionQuery backend with SQLite FTS5 search |

## settings

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/settings-file` | yes | File-backed settings provider (settings.yaml) for the QiLin |

## shell

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/bash-local` | yes | Local-subprocess implementation of the QiLin bash executor seam |
| `@qilin-agent/bash-sandbox` | yes | Sandbox-consuming implementation of the QiLin bash executor seam (confines every command via ctx.sandbox, reports denial/enforcement result facts) |
| `@qilin-agent/pwsh-local` | yes | Local PowerShell implementation of the QiLin bash executor seam |
| `@qilin-agent/pwsh-sandbox` | yes | Sandbox-consuming implementation of the QiLin PowerShell executor seam (confines every command via ctx.sandbox, reports denial/enforcement result facts) |
| `@qilin-agent/shell-env` | yes | Tool-independent managed QILIN_* shell environment registry |
| `@qilin-agent/tool-bash` | yes | Model-facing bash tool with optional generic background-job and sandbox-escalation support |
| `@qilin-agent/tool-bash-persistent` | yes | Model-facing owner-scoped persistent Bash tool backed by the Harness PTY service |
| `@qilin-agent/tool-pwsh` | yes | Model-facing pwsh tool over the bash executor seam |
| `@qilin-agent/tool-pwsh-persistent` | yes | Model-facing owner-scoped persistent PowerShell tool backed by the Harness PTY service |

## skill

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/skill` | yes | Agent skill provider registry for the QiLin |
| `@qilin-agent/skill-filesystem` | yes | Local filesystem skill provider for the QiLin |
| `@qilin-agent/skill-office` | yes | Bundled Word, PowerPoint, and Excel workflows and structural checks |
| `@qilin-agent/tool-skill` | yes | Model-facing skill loading tool for the QiLin |
| `@qilin-agent/tool-workspace-dependencies` | yes | The load_workspace_dependencies tool: absolute paths into a bundled Python, Node.js, and pnpm payload |

## spill

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/spill-local` | yes | Local-filesystem implementation of the QiLin spill storage seam (private session-scoped files) |
| `@qilin-agent/spill-policy` | yes | Token-budgeted tool-result retention with recoverable text and image paths |

## ssh

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/fs-ssh` | no | Filesystem provider over the shared POSIX SSH helper |
| `@qilin-agent/sandbox-ssh` | no | Remote POSIX sandbox argv provider over the shared SSH helper |
| `@qilin-agent/ssh` | yes | Shared OpenSSH connection and versioned POSIX remote helper |
| `@qilin-agent/subprocess-ssh` | no | Subprocess and terminal provider over the shared POSIX SSH helper |

## storage

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/storage` | no | Storage hub (ctx.storage): named backend registry plus mounted data-form facilities for the QiLin |
| `@qilin-agent/storage-domain` | yes | Domain data form (ctx.storage.domain): schema-validated, event-emitting KV domains over storage backends for the QiLin |
| `@qilin-agent/storage-json` | yes | JSON file KV storage backend for the QiLin storage hub |
| `@qilin-agent/storage-sqlite` | yes | SQLite storage backend (kv facet) for the QiLin storage hub |

## subagent

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/subagent` | yes | Abstract subagent seam (ctx.subagents): named-provider registry for delegating to child agents |
| `@qilin-agent/subagent-acp` | yes | Out-of-process ACP subagent backend: drives a child agent in a spawned subprocess over the Agent Client Protocol |
| `@qilin-agent/subagent-claude-code` | yes | One-shot Claude Code subagent provider over the official Agent SDK |
| `@qilin-agent/subagent-codex` | yes | One-shot Codex subagent provider over the official app-server protocol |
| `@qilin-agent/subagent-fork-in-process` | yes | In-process fork subagent backend: runs a child agent seeded with a prefix of the parent's log |
| `@qilin-agent/subagent-qilin-sdk` | yes | Out-of-process SDK subagent backend: drives a child QiLin runtime subprocess over stdio JSON-RPC through the TypeScript SDK client |
| `@qilin-agent/subagent-spawn-in-process` | yes | In-process spawn subagent backend: runs a fresh child agent on ctx.agents |
| `@qilin-agent/tool-subagent` | yes | Model-facing subagent delegation tool over the ctx.subagents seam |
| `@qilin-agent/tool-subagent-control` | no | Globally named send_message, interrupt_agent, and list_agents tools over ctx.subagents continuations |

## subprocess

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/subprocess-local` | no | Local-subprocess implementation of the QiLin subprocess seam |

## telemetry

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/otel` | no | Cordis service for independent ordinary-event and byte-bounded Session-log OTLP channels |

## terminal

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/terminal` | no | Persistent PTY session seam for the QiLin — owner-scoped ids, backend registry, interactive sends, reads, signals, and awaited cleanup |
| `@qilin-agent/terminal-bash` | yes | Persistent shell PTY backend over the QiLin subprocess terminal primitive |

## test-support

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/llm-replay` | yes | Replay LLM plugin: short-circuits llm/stream with model chunks reconstructed from a recorded session JSONL (keyless snapshot tests) |

## todo

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/tool-todo` | yes | Model-facing todo_write tool over the QiLin event-sourced session log |

## typert

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/typert-loader` | yes | Loader integration for generated Typert package contributions |

## web

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/tool-web` | yes | Model-facing web tools (web_search, web_fetch) over the QiLin web capability seam (ctx.web) |
| `@qilin-agent/web` | yes | Abstract web access capability seam (ctx.web) for the QiLin — search/fetch provider registry, registration-order-independent selection, request/result vocabulary, and the WebError taxonomy |
| `@qilin-agent/web-fetch-http` | yes | Anonymous public HTTP(S) fetch provider for the QiLin web capability seam (ctx.web) |
| `@qilin-agent/web-search-deepseek` | yes | DeepSeek-backed search provider (native web_search via the Anthropic-compatible API) for the QiLin web capability seam (ctx.web) |
| `@qilin-agent/web-search-exa` | yes | Exa-backed search provider for the QiLin web capability seam (ctx.web) |
| `@qilin-agent/web-search-perplexity` | yes | Perplexity-backed search provider for the QiLin web capability seam (ctx.web) |

## workflow

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/tool-workflow` | yes | Model-facing workflow tool: run a JavaScript orchestration script over ctx.workflowEngine |
| `@qilin-agent/workflow-ptc` | yes | Workflow orchestration in the shared sandboxed Node PTC runtime |

## workspace

| Package | Config | Description |
|---|---|---|
| `@qilin-agent/workspace` | no | Workspace entity registry (ctx.workspaceRegistry): durable workspace records with validated session attachment over the domain data form for the QiLin |
