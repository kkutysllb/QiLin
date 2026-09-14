# Extend a running agent with Kylin tools

English | [中文](dynamic-kylin.zh.md)

This practice guide enables [`@qilin/tool-kylin`](../../../../packages/extensions/tool-kylin/README.md). The agent can inspect its current Kylin process and mount or unmount model-authored plugins in memory. Temporary plugins disappear when they are unmounted or the process exits and may affect other sessions in the same process.

## Run it

Start the browser interface with the checked-in overlay:

```sh
pnpm qilin web --patch apps/cli/config/examples/cordis/cordis.yml
```

The command requires a model credential. The [Kylin tool reference](../../../../packages/extensions/tool-kylin/README.md) defines the tool arguments, lifetime, cleanup, and safety contracts.
