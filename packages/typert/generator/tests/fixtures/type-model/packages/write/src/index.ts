import { Service } from '@qilin/kylin'

/** Service whose public annotations are intentionally absent. */
export class WritableService extends Service {
  value = 1

  echo(input = 'value') {
    return input
  }
}

declare module '@qilin/kylin' {
  interface Context {
    writable: WritableService
  }
}

export default WritableService
