import { clientBundle } from '../tsdown.client.ts'

export default clientBundle(
  '@qilin-agent/client-modules',
  ['lib/types/index.js'],
)
