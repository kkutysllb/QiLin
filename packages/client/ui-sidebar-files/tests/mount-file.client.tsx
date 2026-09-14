/**
 * Mount the editor body over a real store instance and a scripted tree, read,
 * and write. The component reads a handful of its props; the rest of the
 * standard kit is framework-injected and never touched here, so one documented
 * cast keeps the harness to what is actually exercised.
 */
import { useSyncExternalStore } from 'react'
import { render } from '@testing-library/react'
import type { RenderResult } from '@testing-library/react'
import { vi } from 'vitest'
import type { Mock } from 'vitest'
import type { SessionListState } from '@qilin/api-session-controller/client'
import { makeTranslate } from '@qilin/client-test-runtime'
import type { SessionId } from '@qilin/session/types'
import type { SidebarRightTabActions } from '@qilin/client-ui-sidebar-right/client'
import { sessionFileAddress } from '@qilin/util-workspace-path'
import { filesFace } from '../src/client/face.ts'
import type { FilesInjected } from '../src/client/face.ts'
import { fileEditFace } from '../src/client/file-face.ts'
import type { FileEditorInjected } from '../src/client/file-face.ts'
import { filePreviewFace } from '../src/client/file-preview.ts'
import type { ISidebarRight } from '@qilin/client-ui-sidebar-right/client'
import { FileBody } from '../src/client/FileBody.tsx'
import type { FileBodyProps } from '../src/client/FileBody.tsx'
import { zh } from '../src/client/locales.ts'
import { createFilesStore } from '../src/client/store.ts'
import { scriptedList } from './scripted-list.client.ts'
import type { ScriptedList } from './scripted-list.client.ts'
import { scriptedEdit } from './scripted-edit.client.ts'
import type { ScriptedEdit } from './scripted-edit.client.ts'
import type { TabId } from '@qilin/client-ui-dockkit'

export const SESSION = 's-test' as SessionId
export const ROOT = '/work/app'
export const TAB = 'tab-f' as TabId
export const PATH = 'src/a.ts'
export const ADDRESS = sessionFileAddress(SESSION, PATH)

/** Test-local selector hook over a framework-neutral store instance. */
function hookOf<T>(inst: { subscribe: (fn: () => void) => () => void; getSnapshot: () => T }) {
  return function useSelector<S>(sel: (s: T) => S): S {
    return sel(useSyncExternalStore(inst.subscribe, inst.getSnapshot))
  }
}

/** A live instance of the tree and editor store, as the framework mints one per session. */
type FilesStoreInstance = ReturnType<ReturnType<typeof createFilesStore>['create']>

/** The owner's tab actions as recording mocks. */
interface MockedTabActions {
  readonly openResource: Mock<SidebarRightTabActions['openResource']>
  readonly openTab: Mock<SidebarRightTabActions['openTab']>
  readonly close: Mock<SidebarRightTabActions['close']>
}

/** What a spec holds after mounting: the rendered view and every hand on the body. */
export interface MountedFile {
  readonly view: RenderResult
  readonly instance: FilesStoreInstance
  readonly script: ScriptedList
  readonly edits: ScriptedEdit
  readonly controller: AbortController
  readonly tabActions: MockedTabActions
  /** The Sidebar controller mock the preview open records on. */
  readonly sidebarRight: { readonly openResource: Mock<ISidebarRight['openResource']> }
  /**
   * Drive one navigation to the tab (bumps the revision), as the surface's
   * owner would. The next re-render observes it.
   * @param params - the navigation params, or none.
   */
  readonly navigate: (params: Record<string, unknown> | undefined) => void
  /** Re-render with the current owner share, as the framework would. */
  readonly rerender: () => void
}

/** One store instance, one face pair, one owner share. */
function harness(cwd: string | null, initialParams: Record<string, unknown> | undefined) {
  const instance = createFilesStore().create()
  const script = scriptedList()
  const edits = scriptedEdit()
  const treeFace: FilesInjected = filesFace(script.list)(SESSION, instance.actions)
  const editFace: FileEditorInjected = fileEditFace(edits.readWhole, edits.write)(SESSION, instance.actions)
  const controller = new AbortController()
  const tabActions: MockedTabActions = {
    openResource: vi.fn<SidebarRightTabActions['openResource']>(),
    openTab: vi.fn<SidebarRightTabActions['openTab']>(),
    close: vi.fn<SidebarRightTabActions['close']>(),
  }
  const sidebarRight = { openResource: vi.fn<ISidebarRight['openResource']>() }
  const sessions = { byId: cwd === null ? {} : { [SESSION]: { cwd } } } as unknown as SessionListState
  // The navigation record is a mutable box: `navigate` rewrites it and the
  // spec's re-render observes it, as the framework's dispatch would.
  const navigation = { address: ADDRESS, params: initialParams, revision: 1 }
  const shared = {
    // The tab's address is its whole file identity, as the registry claimed it.
    useTabInfo: () => ({
      sidebar: { expanded: true, fullscreen: false },
      panel: { id: 'pane-1' },
      tab: {
        id: TAB, kind: 'file', contentId: ADDRESS, title: 'a.ts', visible: true,
        navigation,
        signal: controller.signal,
        actions: tabActions,
      },
    }),
    sessionId: SESSION,
    useSessions: <S,>(sel: (s: SessionListState) => S) => sel(sessions),
    useStore: hookOf(instance),
    actions: instance.actions,
    ...treeFace,
    ...editFace,
    ...filePreviewFace(sidebarRight as unknown as ISidebarRight)(),
    t: makeTranslate(zh),
  }
  return { instance, script, edits, controller, tabActions, sidebarRight, navigation, shared }
}

/**
 * Mount the editor body.
 * @param cwd - the session's working directory as `useSessions` reports it; `null` for a session without one.
 * @param initialParams - the params the opening navigation carried.
 */
export function mountFileBody(cwd: string | null = ROOT, initialParams: Record<string, unknown> | undefined = undefined): MountedFile {
  const { shared, navigation, ...hands } = harness(cwd, initialParams)
  const element = <FileBody {...shared as unknown as FileBodyProps} />
  const view = render(element)
  const rerender = (): void => { view.rerender(<FileBody {...shared as unknown as FileBodyProps} />) }
  return {
    ...hands,
    view,
    navigate: (params) => {
      navigation.params = params
      navigation.revision += 1
      rerender()
    },
    rerender,
  }
}
