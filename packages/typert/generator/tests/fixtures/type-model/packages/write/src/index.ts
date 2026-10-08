import { Service } from '@qilin-agent/kylin'

/** Service whose public annotations are intentionally absent. */
export class WritableService extends Service {
  value = 1

  echo(input = 'value') {
    return input
  }
}

declare module '@qilin-agent/kylin' {
  interface Context {
    writable: WritableService
  }
}

export default WritableService
