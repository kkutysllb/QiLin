/**
 * Mount the panel over a real store instance and a static scripted remote.
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
import type { PaneId, TabId } from '@qilin/client-ui-dockkit'
import type { SidebarRightTabActions } from '@qilin/client-ui-sidebar-right/client'
import { createGitReader, gitFace } from '../src/client/face.ts'
import type { GitInjected } from '../src/client/face.ts'
import { GitBody } from '../src/client/GitBody.tsx'
import type { GitBodyProps } from '../src/client/GitBody.tsx'
import { zh } from '../src/client/locales.ts'
import { createGitStore } from '../src/client/store.ts'
import { staticGit } from './scripted-git.client.ts'
import type { StaticAnswers, StaticGit } from './scripted-git.client.ts'

export const SESSION = 's-test' as SessionId
export const TAB = 'tab-1' as TabId

/** Test-local selector hook over a framework-neutral store instance. */
function hookOf<T>(inst: { subscribe: (fn: () => void) => () => void; getSnapshot: () => T }) {
  return function useSelector<S>(sel: (s: T) => S): S {
    return sel(useSyncExternalStore(inst.subscribe, inst.getSnapshot))
  }
}

/** A live instance of the panel's store, as the framework would mint one per session. */
type GitStoreInstance = ReturnType<ReturnType<typeof createGitStore>['create']>

/** The owner's tab actions as recording mocks. */
interface MockedTabActions {
  readonly bindCommands: Mock<SidebarRightTabActions['bindCommands']>
  readonly openResource: Mock<SidebarRightTabActions['openResource']>
  readonly openTab: Mock<SidebarRightTabActions['openTab']>
  readonly close: Mock<SidebarRightTabActions['close']>
}

/** What a spec holds after mounting: the rendered panel and every hand on it. */
export interface Mounted {
  readonly view: RenderResult
  readonly instance: GitStoreInstance
  readonly script: StaticGit
  readonly face: GitInjected
  readonly controller: AbortController
  readonly tabActions: MockedTabActions
}

/** How one panel is mounted. */
export interface MountOptions {
  /** The static answers the scripted remote hands back; defaults draw a clean `main`. */
  readonly answers?: StaticAnswers
  /** Whether the tab record already ended before the mount. */
  readonly aborted?: boolean
}

/**
 * Mount the panel.
 * @param options - the remote's answers and the tab record's lifetime.
 * @returns the rendered panel and every hand on it.
 */
export function mountBody(options: MountOptions = {}): Mounted {
  const { answers, aborted = false } = options
  const instance = createGitStore().create()
  const script = staticGit(answers)
  const face = gitFace(createGitReader(script.remote))(SESSION, instance.actions)
  const controller = new AbortController()
  if (aborted) controller.abort()
  const tabActions: MockedTabActions = {
    bindCommands: vi.fn<SidebarRightTabActions['bindCommands']>(),
    openResource: vi.fn<SidebarRightTabActions['openResource']>(),
    openTab: vi.fn<SidebarRightTabActions['openTab']>(),
    close: vi.fn<SidebarRightTabActions['close']>(),
  }
  const shared: Partial<GitBodyProps> = {
    // A page tab's address is the shell's to mint; the body never reads it.
    useTabInfo: () => ({
      sidebar: { expanded: true, fullscreen: false },
      panel: { id: 'pane-1' as PaneId },
      tab: {
        id: TAB, kind: 'git', contentId: 'git', title: zh['type.label'], visible: true,
        navigation: { address: 'git', params: undefined, revision: 1 },
        signal: controller.signal,
        actions: tabActions,
      },
    }),
    sessionId: SESSION,
    useStore: hookOf(instance),
    actions: instance.actions,
    ...face,
    t: makeTranslate(zh),
  }
  const view = render(<GitBody {...(shared as GitBodyProps)} />)
  return { view, instance, script, face, controller, tabActions }
}
