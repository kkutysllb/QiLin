/** Install an inherited profile resolution generation in one Harness-owned Worker. */

import { getEnvironmentData } from 'node:worker_threads'
import { installRuntimeInterception, type RuntimeInterception } from './resolver.ts'
import type { RuntimeResolution } from '../profile.ts'

const registration = getEnvironmentData(
  '@qilin-agent/app-boot/profile-resolution',
) as {
  generation: RuntimeResolution
  behavior: RuntimeInterception
} | undefined
if (registration !== undefined) installRuntimeInterception(registration.generation, registration.behavior)
