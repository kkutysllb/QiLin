#!/usr/bin/env node

import { Context } from '@qilin-agent/kylin'
import { pathToFileURL } from 'node:url'
import Loader from '@qilin-agent/kylin-plugin-loader'

const ctx = new Context()
ctx.baseUrl = pathToFileURL(process.cwd()).href + '/'

await ctx.plugin(Loader)
await ctx.loader.create({
  name: '@qilin-agent/kylin-plugin-include',
  config: {
    path: './cordis.yml',
  },
})
