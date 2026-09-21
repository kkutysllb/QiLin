# QiLin

English | [中文](README.zh.md)

QiLin (`qilin`) is an open-source agent harness. An agent works in durable sessions: it reads and edits files, runs shell commands and persistent terminals, searches the web, queries language servers, and delegates to subagents and background jobs, with every model-visible input and output recorded to a replayable session log.

It is built on an **everything-is-a-plugin** architecture and powered by [Cordis](https://github.com/cordiverse/cordis), whose source is vendored into this repository as Kylin ([vendor/README.md](vendor/README.md)) and whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512). The model adapters, the tool registry, the session log, and the agent loop itself are all plugins, each replaceable from configuration.

![QiLin landing page](landing.png)

Documentation: [user guides](docs/user/index.md), [development](docs/development.md), and [architecture](docs/architecture.md).

## Developer preview

QiLin is in _developer preview_ and iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

Review the [safety notice](SAFETY.md) before running the project.

## Architecture

![Animated map of the QiLin runtime: entry modes feed the Kylin plugin tree, which owns the agent loop, the tool registry, the model adapters and the execution world; sessions, settings and search persist beside it](qilin-architecture.svg)

Every connection in this map carries a flowing packet, and the palette follows your light or dark preference. Read it alongside the [architecture documentation](docs/architecture.md).

## Capabilities

**Entry modes.** The [`qilin` CLI](apps/cli/README.md) boots every mode from the same plugin tree through named profiles:

- `qilin web` — the browser GUI: sessions and chat, model configuration, plugin and settings management, file preview, terminals, and session history.
- `qilin --profile headless "task"` — a one-shot persisted run that prints the final answer and exits.
- `qilin --profile sdk` and `qilin --profile sdk-minimal` — a JSON-RPC server driven by the [TypeScript](packages/sdk/README.md) and [Python](python/README.md) SDKs.
- `qilin --profile acp` — an Agent Client Protocol server for automation clients.
- The [desktop app](apps/desktop/README.md) packages the same runtime as a signed Electron application.

**Tools and execution.** The tool set covers bash and PowerShell in one-shot and persistent-PTY form, file read/write/edit and image reading, glob/grep discovery over a packaged ripgrep, LSP queries, web search and fetch, skills, todo/plan/goal tracking, and ask-user questions. Work can be delegated to background jobs, subagents with model selection and steering, scripted multi-agent workflows, or scheduled follow-ups, and sessions can be forked, resumed, and full-text searched. The generated [tool catalog](docs/tool-catalog.md) lists every model-facing tool.

**Models.** A DeepSeek adapter and the multi-provider `pi-ai` adapter serve built-in providers such as Anthropic, OpenAI, Kimi, and GLM, plus custom OpenAI- or Anthropic-compatible gateways; see [configure models](docs/user/guide/providers.md).

**Execution world and sandboxing.** Filesystem, subprocess, and sandbox providers form one swappable execution world: the local machine by default, an SSH host through paired providers for remote work, and process confinement through bwrap, Landlock, or Seatbelt backends. Experimental packages add browser-use and computer-use interaction through registered providers.

**Everything is a plugin.** A profile stacks patchable bundle layers under your own `cordis.patch.yml`; `qilin plugin` and the Web plugin manager install, toggle, and remove plugins; external MCP servers mount as native tools; existing Claude Code and Codex shell hooks run without modification; verified webhooks start sessions from external events. Start with [your first plugin](docs/user/develop/basic/index.md), the [architecture documentation](docs/architecture.md), and the [package map](packages/README.md).

## Run

### Run from source

To run from a repository checkout:

```sh
git clone https://github.com/kkutysllb/QiLin.git
cd QiLin
pnpm install
pnpm run build
pnpm qilin web
```

`pnpm run build` prepares the repository artifacts. `pnpm qilin web` uses those built artifacts without rebuilding. The server starts at `http://127.0.0.1:3080` by default; pass `--no-open` to run it without opening a browser. See the [Web UI guide](docs/user/guide/index.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md).

For agents, follow [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
