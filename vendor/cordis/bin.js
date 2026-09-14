#!/usr/bin/env node

import { Context } from '@qilin/kylin'
import { pathToFileURL } from 'node:url'
import Loader from '@qilin/kylin-plugin-loader'

const ctx = new Context()
ctx.baseUrl = pathToFileURL(process.cwd()).href + '/'

await ctx.plugin(Loader)
await ctx.loader.create({
  name: '@qilin/kylin-plugin-include',
  config: {
    path: './cordis.yml',
  },
})
