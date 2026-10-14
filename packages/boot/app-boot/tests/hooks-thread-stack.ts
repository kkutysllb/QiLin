/** Node resolver errors with the stack property that Node's module-hooks thread returns. */

import { registerHooks, type ModuleHooks } from 'node:module'

/**
 * Register a synchronous resolve hook that rethrows Node's resolver errors with the `stack` property an
 * asynchronous `module.register()` hook chain returns: Node serializes the error on its hooks thread, and the
 * main thread receives the stack accessor as a read-only configurable data property.
 * @returns the hook registration, which the test deregisters.
 */
export function registerHooksThreadStacks(): ModuleHooks {
  return registerHooks({
    resolve(specifier, context, nextResolve) {
      try {
        return nextResolve(specifier, context)
      } catch (error) {
        if (error instanceof Error) {
          // A synchronous registerHooks chain keeps the original stack, and Node 24
          // models stack as an accessor: stamp only an error that crossed the hooks
          // thread without one, never the read-only restamp of a live accessor.
          const descriptor = Object.getOwnPropertyDescriptor(error, 'stack')
          if (descriptor === undefined && error.stack !== undefined) {
            Object.defineProperty(error, 'stack', { value: error.stack, writable: false })
          }
        }
        throw error
      }
    },
  })
}
