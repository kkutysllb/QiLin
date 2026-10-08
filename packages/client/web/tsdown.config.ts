import { staticLinked } from '../tsdown.client.ts'

export default staticLinked(
  '@qilin-agent/client-web',
  ['lib/types/index.js', 'lib/types/apply-injections.js'],
)
