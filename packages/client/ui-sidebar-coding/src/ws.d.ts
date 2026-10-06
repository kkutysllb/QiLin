/**
 * Minimal ambient declaration for the `ws` driver (the repo does not carry
 * @types/ws). Only the members src/index.ts's terminal upgrades touch are
 * declared, with honest shapes; everything else the driver offers stays
 * undeclared.
 */
declare module 'ws' {
  import type { IncomingMessage } from 'node:http'
  import type { Duplex } from 'node:stream'

  /** One established WebSocket connection (the upgrade callback's socket). */
  export class WebSocket {
    /** readyState value while the connection is open (send is legal). */
    static readonly OPEN: number
    readonly readyState: number
    /** Bytes of application data queued but not yet flushed to the wire. */
    readonly bufferedAmount: number
    /** Close with an optional status code and human-readable reason. */
    close(code?: number, reason?: string): void
    /** Queue one text frame. */
    send(data: string): void
    /** One received frame; `toString` decodes the payload bytes. */
    on(event: 'message', listener: (data: { toString(encoding?: string): string }) => void): void
    on(event: 'close' | 'error', listener: () => void): void
    on(event: string, listener: (...args: never[]) => void): void
  }

  /** One no-server WebSocket endpoint: upgrades are routed to it explicitly. */
  export class WebSocketServer {
    constructor(options?: { noServer?: boolean })
    /** Complete one HTTP upgrade and hand the established socket to the callback. */
    handleUpgrade(
      request: IncomingMessage,
      socket: Duplex,
      upgradeHead: Buffer,
      callback: (client: WebSocket) => void,
    ): void
    /** Stop accepting upgrades and close idle connections. */
    close(): void
  }
}
