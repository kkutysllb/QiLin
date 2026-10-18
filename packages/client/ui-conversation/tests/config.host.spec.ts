import { Context } from '@qilin-agent/kylin'
import { describe, expect, it } from 'vitest'
import * as HostPlugin from '../src/index.ts'
import { liveConfig, omitsGeneratedPage } from '../../../settings/settings/tests/live-config.ts'
import { plainConfig } from '../../../settings/settings/src/schema.ts'
import {
  DEFAULT_BUSY_ENTER_BEHAVIOR, DEFAULT_CONTENT_WIDTH, Config, apply,
} from '@qilin-agent/client-ui-conversation'


describe('ui-conversation host', () => {
  it('registers, validates, and disposes the durable conversation preferences', async () => {
    const ctx = new Context()
    const configuration = await liveConfig(ctx, { Config, apply })
    const { fiber } = configuration
    expect(plainConfig(configuration.fiber.config)).toEqual({
      busyEnter: DEFAULT_BUSY_ENTER_BEHAVIOR,
      contentWidth: DEFAULT_CONTENT_WIDTH,
    })
    await configuration.update({ busyEnter: 'steer', contentWidth: 970 })
    expect(plainConfig(configuration.fiber.config)).toEqual({ busyEnter: 'steer', contentWidth: 970 })
    await expect(configuration.update({ busyEnter: 'invalid' })).rejects.toThrow()
    await expect(configuration.update({ contentWidth: -1 })).rejects.toThrow()
    await fiber.dispose()
  })
})

it('keeps its own instance off the generated Settings pages', () => omitsGeneratedPage(ctx => ctx.plugin(HostPlugin)))
