/** Dependency-free IPC names shared with the sandboxed mandatory-update preload. */
export const MANDATORY_IPC = {
  status: 'qilin-desktop:mandatory-status', state: 'qilin-desktop:mandatory-state', action: 'qilin-desktop:mandatory-action',
} as const
