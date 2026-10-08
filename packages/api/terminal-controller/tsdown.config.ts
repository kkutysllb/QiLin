import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@qilin-agent/api-terminal-controller',
  ['lib/types/index.js'],
  { hostPhase: true },
)
