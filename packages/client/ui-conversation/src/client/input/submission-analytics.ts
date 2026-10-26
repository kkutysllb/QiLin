/** Maps ordinary message occurrences to Desktop product events. */
import type { Context } from '@qilin-agent/kylin'
import type { AnalyticsPreset } from '@qilin-agent/client-product-analytics/client'
import type { MessageSubmission } from '../contract/composer-submission.ts'

/**
 * Map a preset id to its fixed analytics category; custom ids never leave the Client.
 * @param id - Agent preset id the Session records.
 * @returns the built-in category, or other.
 */
function analyticsPreset(id: string): AnalyticsPreset | 'other' {
  switch (id) {
    case '@qilin-agent/kylin': return 'creator'
    case 'ptc': return 'ptc'
    case 'minimal': return 'minimal'
    case 'standard': return 'standard'
    default: return 'other'
  }
}

/**
 * Report the original message occurrence without reading newer Session facts.
 * @param ctx - client context.
 * @param submission - occurrence, delivery mode, and captured Session facts.
 */
export function reportMessageSubmission(ctx: Context, submission: MessageSubmission): void {
  const { state, timestamp } = submission
  if (state === undefined) return
  const { mode } = submission
  const { model } = state
  ctx.get('productAnalytics')?.track('send_button_click', {
    ...state.sessionId === undefined ? {} : { session_id: state.sessionId },
    ...model === undefined ? {} : {
      model_name: `${model.provider}/${model.name}`,
      ...model.effort === undefined ? {} : { thinking_effort: model.effort },
    },
    run_mode: state.runMode,
    msg_type: state.running ? mode : 'default',
    is_new_session: state.newSession,
    ...state.agentPreset === undefined ? {} : { agent_preset: analyticsPreset(state.agentPreset) },
  }, timestamp)
}
