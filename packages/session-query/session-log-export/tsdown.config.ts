import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@qilin-agent/session-log-export',
  ['lib/types/index.js'],
  { hostPhase: true },
)
