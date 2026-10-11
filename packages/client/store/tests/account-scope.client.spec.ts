// @vitest-environment jsdom
/** The account a served document names, and the storage names it scopes. */

import { afterEach, describe, expect, it } from 'vitest'
import { accountScopedName, createSnapshotStore, defineStore, servedAccountId } from '../src/index.ts'

afterEach(() => {
  document.head.innerHTML = ''
  localStorage.clear()
})

/** Serve a document that names the given account, or none. */
function servedDocument(content?: string): void {
  document.head.innerHTML = content === undefined ? '' : `<meta name="qilin-account" content="${content}">`
}

describe('account-scoped storage names', () => {
  it('leaves a name alone when the document names no account', () => {
    servedDocument()
    expect(servedAccountId()).toBeUndefined()
    expect(accountScopedName('qilin.example')).toBe('qilin.example')
  })

  it('prefixes the name with the account the document names', () => {
    servedDocument('account-1')
    expect(servedAccountId()).toBe('account-1')
    expect(accountScopedName('qilin.example')).toBe('account-1#qilin.example')
    // A name that already carries a suffix keeps it behind the name, which is
    // where the readers of a Session-scoped key look for it.
    expect(accountScopedName('qilin.example.session-9')).toBe('account-1#qilin.example.session-9')
  })

  it('treats an empty or absent content as no account', () => {
    servedDocument('')
    expect(servedAccountId()).toBeUndefined()
    document.head.innerHTML = '<meta name="qilin-account">'
    expect(servedAccountId()).toBeUndefined()
  })

  it('persists a snapshot store under the account-scoped name', () => {
    servedDocument('account-2')
    const store = createSnapshotStore({ folded: [] as string[] }, { persist: { name: 'qilin.example' }, flush: 'sync' })
    store.update((draft) => { draft.folded = ['a'] })
    expect(localStorage.getItem('qilin.example')).toBeNull()
    expect(localStorage.getItem('account-2#qilin.example')).toContain('"a"')
  })

  it('clears the account-scoped name, keeping its Session suffix', () => {
    servedDocument('account-3')
    const handle = defineStore({
      init: (): { draft: string } => ({ draft: '' }),
      persist: 'qilin.example',
      actions: { setDraft: (draft, text: string) => { draft.draft = text } },
    })
    handle.create('s1').actions.setDraft('one')
    expect(localStorage.getItem('account-3#qilin.example.s1')).not.toBeNull()
    handle.create('s1').clearPersisted()
    expect(localStorage.getItem('account-3#qilin.example.s1')).toBeNull()
  })
})
