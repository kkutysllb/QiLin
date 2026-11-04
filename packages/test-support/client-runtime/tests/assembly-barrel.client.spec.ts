/**
 * The whole-client assembly barrel (`src/assembly/index.ts`), importable only
 * through its deep path: every export it advertises must be the same binding
 * its owning module provides, so a rename or dropped re-export cannot leave
 * the tier entry pointing at a stale module. The type-only re-exports are
 * pinned by using them.
 */

import { describe, expect, it } from 'vitest'
import {
  ClientRoster,
  TestClient,
  bundleRoster,
  createClientTest,
  remoteDefaultResponses,
  webApp,
} from '../src/assembly/index.ts'
import type {
  AssemblyPlan,
  ClientPluginModule,
  ClientRosterRow,
  ClientTestFixtures,
  TestClientOptions,
} from '../src/assembly/index.ts'
import { bundleRoster as bundleRosterOwner, webApp as webAppOwner } from '../src/assembly/bundle-roster.ts'
import { remoteDefaultResponses as remoteDefaultResponsesOwner } from '../src/assembly/remote-default-responses.ts'
import { ClientRoster as clientRosterOwner } from '../src/assembly/roster.ts'
import { TestClient as testClientOwner } from '../src/assembly/test-client.ts'
import { createClientTest as createClientTestOwner } from '../src/assembly/vitest.ts'

describe('assembly tier entry', () => {
  it('re-exports the owning modules\' runtime bindings unchanged', () => {
    expect(ClientRoster).toBe(clientRosterOwner)
    expect(TestClient).toBe(testClientOwner)
    expect(bundleRoster).toBe(bundleRosterOwner)
    expect(webApp).toBe(webAppOwner)
    expect(remoteDefaultResponses).toBe(remoteDefaultResponsesOwner)
    expect(createClientTest).toBe(createClientTestOwner)
  })

  it('exposes the owning modules\' types through the same entry', () => {
    // A type-only re-export that named a missing member fails typecheck here.
    const types: readonly (AssemblyPlan | ClientPluginModule | ClientRosterRow | TestClientOptions | ClientTestFixtures)[] = []
    expect(types).toEqual([])
  })
})
