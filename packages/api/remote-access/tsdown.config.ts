import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@qilin-agent/api-remote-access',
  ['lib/types/index.js'],
  { hostPhase: true },
)
