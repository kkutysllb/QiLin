import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@qilin-agent/experimental-deepseek-chat-import',
  ['lib/types/index.js'],
  { hostPhase: true },
)
