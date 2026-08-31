"""PTY backend adapters for the terminal port.

Each backend implements the TerminalPort primitive surface (spawn, write,
resize, signal, kill) on one platform facility:

- posix: asyncio + os.openpty (Linux / macOS)
- windows: pywinpty ConPTY (planned P3)

Backends are deliberately dumb: they move bytes and process state. All
policy (scrollback retention, paging, clamps, ownership) lives in the
registry in qilin.ports.terminal.
"""
