/**
 * Mount the panel over a real store instance and a virtual workspace.
 *
 * The component reads a handful of its props; the rest of the standard kit is
 * framework-injected and never touched here, so one documented cast keeps the
 * harness to what is actually exercised.
 */
import { useSyncExternalStore } from 'react'
import { render } from '@testing-library/react'
import type { RenderResult } from '@testing-library/react'
import { vi } from 'vitest'
import type { Mock } from 'vitest'
import { makeTranslate } from '@qilin/client-test-runtime'
import type { SessionId } from '@qilin/session/types'
import type { TabId } from '@qilin/client-ui-dockkit'
import type { SidebarRightTabActions } from '@qilin/client-ui-sidebar-right/client'
import { plansFace } from '../src/client/face.ts'
import type { PlansInjected } from '../src/client/face.ts'
import { PlansBody } from '../src/client/PlansBody.tsx'
import type { PlansBodyProps } from '../src/client/PlansBody.tsx'
import { zh } from '../src/client/locales.ts'
import { createPlansStore } from '../src/client/store.ts'
import { scriptedReader } from './scripted-reader.client.ts'
import type { ScriptedReader, VirtualWorkspace } from './scripted-reader.client.ts'

export const SESSION = 's-test' as SessionId
export const ROOT = '/work/app'
export const TAB = 'tab-1' as TabId

/** Test-local selector hook over a framework-neutral store instance. */
function hookOf<T>(inst: { subscribe: (fn: () => void) => () => void; getSnapshot: () => T }) {
  return function useSelector<S>(sel: (s: T) => S): S {
    return sel(useSyncExternalStore(inst.subscribe, inst.getSnapshot))
  }
}

/** A live instance of the panel's store, as the framework would mint one per session. */
type PlansStoreInstance = ReturnType<ReturnType<typeof createPlansStore>['create']>

/** The owner's tab actions as recording mocks. */
interface MockedTabActions {
  readonly openResource: Mock<SidebarRightTabActions['openResource']>
  readonly openTab: Mock<SidebarRightTabActions['openTab']>
  readonly close: Mock<SidebarRightTabActions['close']>
}

/** What a spec holds after mounting: the rendered panel and every hand on it. */
export interface Mounted {
  readonly view: RenderResult
  readonly instance: PlansStoreInstance
  readonly script: ScriptedReader
  readonly face: PlansInjected
  readonly controller: AbortController
  readonly tabActions: MockedTabActions
}

/** How one panel is mounted. */
export interface MountOptions {
  /** The session's working directory as `useSessions` reports it; `null` for a session without one. */
  readonly cwd?: string | null
  /** Whether the tab is visible, as `useTabInfo` reports it. */
  readonly visible?: boolean
  /** The virtual workspace the scan reads. */
  readonly workspace?: VirtualWorkspace
}

/**
 * Mount the panel.
 * @param options - the session's working directory, the tab's visibility, and the workspace to scan.
 * @returns the rendered panel and every hand on it.
 */
export function mountBody(options: MountOptions = {}): Mounted {
  const { cwd = ROOT, visible = true, workspace = {} } = options
  const instance = createPlansStore().create()
  const script = scriptedReader(workspace)
  const face = plansFace(script.reader)(SESSION, instance.actions)
  const controller = new AbortController()
  const tabActions: MockedTabActions = {
    openResource: vi.fn<SidebarRightTabActions['openResource']>(),
    openTab: vi.fn<SidebarRightTabActions['openTab']>(),
    close: vi.fn<SidebarRightTabActions['close']>(),
  }
  const sessions = { byId: cwd === null ? {} : { [SESSION]: { cwd } } }
  const shared = {
    // A page tab's address is the shell's to mint; the body never reads it.
    useTabInfo: () => ({
      sidebar: { expanded: true, fullscreen: false },
      panel: { id: 'pane-1' },
      tab: {
        id: TAB, kind: 'plans', contentId: 'plans', title: zh['type.label'], visible,
        navigation: { address: 'plans', params: undefined, revision: 1 },
        signal: controller.signal,
        actions: tabActions,
      },
    }),
    sessionId: SESSION,
    useSessions: <S,>(sel: (s: unknown) => S): S => sel(sessions),
    useStore: hookOf(instance),
    actions: instance.actions,
    ...face,
    t: makeTranslate(zh),
  }
  const view = render(<PlansBody {...shared as unknown as PlansBodyProps} />)
  return { view, instance, script, face, controller, tabActions }
}
