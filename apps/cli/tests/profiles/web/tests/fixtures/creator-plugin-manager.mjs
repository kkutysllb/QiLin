/** Test-only IPC assertions over real Creator presets and profile management. */
export const inject = ['agents', 'agentPresets', 'tools', 'pluginManager', 'permissionPresets']

export function apply(ctx, config) {
  const receive = message => {
    if (message !== 'initial' && message !== 'restart') return
    void inspect(message).then(result => process.send({ result }), error => process.send({ error: String(error.stack ?? error) }))
  }
  ctx.effect(() => {
    process.on('message', receive)
    return () => process.off('message', receive)
  })
  async function inspect(phase) {
    const handles = []
    let activeSession
    let answer = 'rejected'
    const approvals = []
    const disposeApproval = ctx.on('approval/request', (request, next) => {
      if (request.toolName !== 'plugin_manager') return next()
      approvals.push(answer)
      return Promise.resolve(answer)
    }, { prepend: true })
    const make = async id => {
      const handle = await ctx.agents.create({ sessionId: id, cwd: process.cwd(),
        setup: scope => ctx.agentPresets.mount(scope, 'ptc').then(() => undefined) })
      handles.push(handle)
      return handle.agent
    }
    const names = agent => ctx.tools.schemas(agent).map(tool => tool.name)
    try {
      const first = await make(`${phase}-first`)
      const before = names(first)
      // Only run_code is callable directly in this mode, so a program dispatches
      // every registry tool; the runtime resolves a ToolExecutionResult whose
      // failure arm carries content and no value.
      const dispatch = (name, args) => ctx.tools.execute({ name: 'run_code', arguments: {
        description: `call ${name}`,
        code: `return await tools.${name}(${JSON.stringify(args)})`,
      }, agent: first, callId: `${phase}-${name}`, signal: new AbortController().signal })
      const manage = args => dispatch('plugin_manager', args)
      ctx.permissionPresets.set(first.session, 'workspace-write')
      first.session.append('turn/start', { turn: 1 })
      activeSession = first.session
      const denied = await manage({ action: 'install_bundle', target: config.bundle })
      const afterDenied = names(first)
      const bundlesAfterDenied = await ctx.pluginManager.listBundles()
      answer = 'allowed-once'
      // run_code's value is { logs, result }; result is the managed tool's own
      // value, which these tools publish as JSON text.
      const result = phase === 'initial'
        ? JSON.parse((await manage({ action: 'install_bundle', target: config.bundle })).value.result)
        : await ctx.pluginManager.listBundles()
      const second = await make(`${phase}-second`)
      const after = names(first)
      const other = names(second)
      const ping = (await dispatch('mcp__demo__ping', {})).value.result
      const removed = phase === 'restart'
        ? JSON.parse((await manage({ action: 'remove_bundle', target: '@test/creator-mcp' })).value.result) : undefined
      return { approvals, permission: ctx.permissionPresets.current(first.session), before, denied, afterDenied, bundlesAfterDenied, result, after, other, ping, removed, remaining: names(first) }
    } finally {
      disposeApproval()
      activeSession?.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
      await Promise.all(handles.map(handle => handle.dispose()))
    }
  }
}
