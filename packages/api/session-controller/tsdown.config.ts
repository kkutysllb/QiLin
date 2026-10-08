import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@qilin-agent/api-session-controller',
  ['lib/types/index.js'],
  { hostPhase: true },
)
