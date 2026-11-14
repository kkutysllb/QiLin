/** Plugin page selection shared by the page and cross-plugin navigation. */
import { defineStore, type EngineStoreHandle } from '@qilin-agent/client-store'

/** The main or additional plugin list, or one bundle, official item, or bundle row of the Installed tab. */
type View =
  | { readonly kind: 'list' }
  | { readonly kind: 'more' }
  | { readonly kind: 'package'; readonly name: string; readonly from?: 'more' }
  | { readonly kind: 'item'; readonly id: string }
  | { readonly kind: 'row'; readonly name: string; readonly rowId: string; readonly from?: 'more' }

/** The page's own category ids and contributed `plugins.tab` ids share this field. */
type NavigationState = { view: View; tab: string }
type NavigationActions = {
  setView: (draft: NavigationState, view: View) => void
  setTab: (draft: NavigationState, tab: string) => void
}

/**
 * Create plugin page selection before the first page render.
 * @returns the registration-owned navigation store handle.
 */
export function createNavigationStore(): EngineStoreHandle<NavigationState, NavigationActions> {
  return defineStore({
    init: (): NavigationState => ({ view: { kind: 'list' }, tab: 'builtin' }),
    actions: {
      setView: (draft, view: View) => { draft.view = view },
      setTab: (draft, tab: string) => { draft.tab = tab },
    },
  })
}
