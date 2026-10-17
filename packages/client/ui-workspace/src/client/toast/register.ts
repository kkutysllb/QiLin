/** Business-owned mappings into the keyed Workspace Toast slot. */
import type { Context } from '@qilin-agent/kylin'
import type { PropsRuntime } from '@qilin-agent/client-ui-slots'
import type { ToastDisplayInjected } from '../contract/toast.ts'
import { ToastEntry, WorkspaceToast } from './Toast.tsx'

/**
 * Register notice presentations with their business-owned display fields.
 * @param ctx - Workspace plugin context.
 */
export function registerToasts(ctx: Context): void {
  ctx.slots.registerFactory({ name: 'workspace.toast.content', scope: 'root' }, WorkspaceToast)
  ctx.slots.inject('workspace.toast', function* () {
    yield ctx.slots.register({
      name: 'workspace.toast', key: 'sessionIdCopied', locale: 'workspace',
      inject: (): ToastDisplayInjected<'sessionIdCopied'> => ({
        display: (_notice, t) => ({ text: t('toast.sessionIdCopied'), tone: 'success' }),
      }),
    }, ToastEntry<PropsRuntime<'workspace.toast', 'sessionIdCopied'>>)
    yield ctx.slots.register({
      name: 'workspace.toast', key: 'sessionIdCopyFailed', locale: 'workspace',
      inject: (): ToastDisplayInjected<'sessionIdCopyFailed'> => ({
        display: (_notice, t) => ({ text: t('toast.sessionIdCopyFailed'), tone: 'warning' }),
      }),
    }, ToastEntry<PropsRuntime<'workspace.toast', 'sessionIdCopyFailed'>>)
  })
}
