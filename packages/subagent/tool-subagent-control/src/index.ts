/**
 * The globally named `send_message` and `interrupt_agent` tools: thin
 * model-facing adapters over `ctx.subagents.sendMessage()` and
 * `ctx.subagents.interrupt()`. They perform no lifecycle routing of their own —
 * residency, cold resume, and interrupt authorization belong to the subagent
 * service — and they live apart from the provider-bound
 * `@qilin-agent/tool-subagent` instances so multiple delegation tools share
 * one control API.
 * @module @qilin-agent/tool-subagent-control
 */

import type { Context } from '@qilin-agent/kylin'
import z from '@qilin-agent/schemastery'
import { brandString } from '@qilin-agent/brand'
import { defineTool } from '@qilin-agent/tools'
import type { ContentBlock } from '@qilin-agent/llm'
import type { SessionId } from '@qilin-agent/session'
import type {} from '@qilin-agent/subagent'
import { markAdjacentAgentSendMessageTool } from '@qilin-agent/subagent/internal'

export const name = 'tool-subagent-control'
export const inject = ['tools', 'subagents']

/** Plugin configuration. */
export interface Config {
  /** Register `interrupt_agent` and its guidance; the subagent service's interruption API stays available either way. Defaults to true. */
  interrupt?: boolean
}

/** Validated configuration; independent compositions that omit the field retain interruption. */
export const Config: z<Config> = z.object({
  interrupt: z.boolean().default(true),
})

/**
 * Register the `send_message` tool, and `interrupt_agent` unless disabled.
 * @param ctx - context carrying the tool registry and subagent service.
 * @param config - validated plugin configuration.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.tools.register(markAdjacentAgentSendMessageTool(defineTool({
    name: 'send_message',
    description:
      'Send a message to an agent. A working agent receives it at its next step; an idle agent starts a new turn with it. '
      + 'Returns delivery confirmation, not the agent\'s answer.',
    parameters: {
      agent_id: {
        type: 'string',
        required: true,
        description: 'The agent id of your direct continuable child, or your direct parent when you are a resident continuable child.',
      },
      message: {
        type: 'string',
        required: true,
        description: 'The message to deliver to the agent.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          messageId: { type: 'string', required: true },
        },
      },
      render: (args, _value) => [{
        type: 'text',
        text: `message delivered to agent ${args.agent_id}`,
      }],
    },
    async execute(args, exec) {
      const sender = exec.agent
      if (!sender) {
        throw new Error('send_message requires a calling agent (exec.agent was undefined)')
      }
      const message: ContentBlock[] = [{ type: 'text', text: args.message }]
      const messageId = await ctx.subagents.sendMessage(
        sender,
        brandString<SessionId>(args.agent_id),
        message,
        { signal: exec.signal },
      )
      return { messageId }
    },
  })))

  if (config.interrupt) {
    ctx.tools.register(defineTool({
      name: 'interrupt_agent',
      description:
        'Ask a subagent to stop its current work. This call returns without waiting for it to stop. '
        + 'You can continue a local direct child\'s conversation later with send_message. '
        + 'External executions stop permanently and cannot receive follow-ups. Subagents it started will keep running.',
      parameters: {
        agent_id: {
          type: 'string',
          required: true,
          description: 'The id of an agent created under you: your direct child or a deeper descendant.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            accepted: { type: 'boolean', required: true },
          },
        },
        render: (args, _value) => [{
          type: 'text',
          text: `interrupt requested for agent ${args.agent_id}`,
        }],
      },
      execute(args, exec) {
        const caller = exec.agent
        if (!caller) {
          // Ancestor authority requires an exact live calling agent.
          throw new Error('interrupt_agent requires a calling agent (exec.agent was undefined)')
        }
        // The service authorizes the exact live caller against the target's
        // recorded lineage; the tool adds no authority of its own.
        ctx.subagents.interrupt(brandString<SessionId>(args.agent_id), { kind: 'ancestor', agent: caller })
        return Promise.resolve({ accepted: true })
      },
    }))
  }
}
