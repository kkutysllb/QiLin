/**
 * Allow-all access for client specs. Production pages receive the
 * remote-access Client service and the resource-access Hooks ui-session and
 * ui-workspace publish over it. This fork has not ported that service, so no
 * standard prop carries an access decision yet: the share is empty and
 * hand-built component props spread {@link allowAllAccess} beside the Hooks
 * their component does read. It grows into the production Hook set when the
 * remote-access port lands.
 * @module @qilin-agent/client-test-runtime/src/access
 */

/** The access Hooks every Slot component receives. */
export type AccessStandardProps = object

/** Access Hooks that allow every action on every resource, for hand-built component props. */
export const allowAllAccess: AccessStandardProps = {}
