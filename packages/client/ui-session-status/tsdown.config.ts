import { clientBundle } from '../tsdown.client.ts'

export default clientBundle(
  '@qilin-agent/client-ui-session-status',
  ['lib/types/index.js'],
  { hostPhase: true },
)
