import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@qilin-agent/api-remotes',
  ['lib/types/index.js'],
  { hostPhase: true },
)
