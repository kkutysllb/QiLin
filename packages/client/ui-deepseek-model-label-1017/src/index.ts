/**
 * DeepSeek model-label plugin, node half. Pure UI plugin: the empty apply keeps
 * the package on the host roster; the browser half ships through
 * exports["./client"], discovered through the package.json qilin.client
 * declaration.
 */

/** Host plugin body — the temporary release badge is browser presentation only. */
export function apply(): void {}
