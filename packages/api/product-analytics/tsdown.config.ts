import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@qilin-agent/client-product-analytics',
  ['lib/types/index.js'],
  { hostPhase: true },
)
