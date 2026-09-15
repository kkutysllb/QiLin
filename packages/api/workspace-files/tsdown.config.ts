import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@qilin/api-workspace-files',
  ['lib/types/index.js'],
  { hostPhase: true },
)
