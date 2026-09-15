/** Host operations used directly by the frame-wide Kylin panel. */

import type { SessionId } from '@qilin/api-remotes/client'
import type {
  KylinDynamicPluginId, DynamicKylinInventoryRow,
} from './events.ts'

/** Result of a panel lifecycle gesture. */
export type KylinActionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string }

/** RPC seam kept outside the React surface. */
export interface KylinDynamicPort {
  /** Stop one Plugin while retaining its immutable Packages. */
  stop(sessionId: SessionId, pluginId: KylinDynamicPluginId): Promise<KylinActionResult>
  /** Stop and remove one Plugin together with every Package. */
  remove(sessionId: SessionId, pluginId: KylinDynamicPluginId): Promise<KylinActionResult>
  /** Read the frame-wide Plugin inventory. */
  inventory(): Promise<readonly DynamicKylinInventoryRow[]>
}

/** One stable Plugin row as the panel receives it. */
export type KylinInventoryRow = DynamicKylinInventoryRow
