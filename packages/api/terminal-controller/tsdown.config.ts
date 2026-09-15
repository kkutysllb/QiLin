import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@qilin/api-terminal-controller',
  ['lib/types/index.js'],
  { hostPhase: true },
)
