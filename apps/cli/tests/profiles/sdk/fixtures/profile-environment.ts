import { join } from 'node:path'
import { clearAmbientProxyEnv } from '../../../../../../scripts/test-proxy-environment.ts'

/** Isolate SDK profile processes from ambient profile, runtime and Node loader settings. */
export function profileEnvironment(root: string, baseUrl: string): NodeJS.ProcessEnv {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('QILIN_')))
  Object.assign(env, {
    QILIN_PERMISSION_MODE: 'danger-full-access', QILIN_TELEMETRY_DISABLED: '1',
    QILIN_AGENTS_HOME: join(root, 'agents'), QILIN_PRIMARY_RUNTIME: '',
    DEEPSEEK_API_KEY: 'keyless-profile-test', DEEPSEEK_BASE_URL: baseUrl,
    NODE_OPTIONS: '', NODE_PATH: '',
  })
  clearAmbientProxyEnv(env)
  return env
}
