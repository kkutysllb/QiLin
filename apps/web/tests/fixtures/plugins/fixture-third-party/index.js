/** Web e2e fixture: an out-of-tree plugin whose only contract is the tool registry. */
export const name = 'fixture-third-party'
export const inject = ['tools']

/** Register the fixture's tool for the composition that mounts this row. */
export function apply(ctx) {
  ctx.tools.register({
    name: 'fixture_echo',
    description: 'Echo a token back through the out-of-tree fixture plugin.',
    parameters: {
      token: { type: 'string', description: 'Token to echo back.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['echoed'],
        properties: {
          echoed: { type: 'string', description: 'The token this plugin received.' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.echoed }],
    },
    execute: async args => ({ echoed: String(args.token) }),
  })
}
