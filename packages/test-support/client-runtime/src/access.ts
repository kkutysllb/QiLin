/**
 * Allow-all access for client specs. Production pages receive the
 * `remoteAccess` Client service and the global-resource `useRemoteAccess` Hook
 * from the remote-access Client plugin. Hand-built component props spread
 * {@link allowAllAccess}; a spec of a refused path overrides the Hook.
 * @module @qilin-agent/client-test-runtime/src/access
 */

import type {} from '@qilin-agent/api-remote-access/client'
import type { GlobalStandardProps } from '@qilin-agent/client-ui-slots'

/** The access Hooks every Slot component receives. */
export type AccessStandardProps = Pick<GlobalStandardProps, 'useRemoteAccess'>

/** Access Hooks that allow every action on every resource, for hand-built component props. */
export const allowAllAccess: AccessStandardProps = {
  useRemoteAccess: () => true,
}
