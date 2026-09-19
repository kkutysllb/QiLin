/**
 * Boot the installed qilin executable's Web surface and prove it answers HTTP.
 *
 * `release:verify-packed-install` already proves the packed payload is complete
 * enough to print a version. That is not the claim one-click deployment makes:
 * `npx @qilin/cli` installs the published tree and serves the browser surface,
 * so the artifacts only the Web boot touches — the frontend dist resolved
 * through the bundle, the profile bundles, the launcher's server composition —
 * have to answer a request before publication. This module owns that proof.
 *
 * The probe owns the port it reserves, the child it spawns, and the termination
 * it performs, so a failing probe leaves no listener and no orphan behind.
 */

import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

/** How long the installed server may take to answer its first request. */
const READY_TIMEOUT_MS = 180_000

/** How long the launcher may take to print its authenticated surface URL. */
const PRINTED_URL_TIMEOUT_MS = 15_000

/** Gap between readiness attempts. */
const POLL_MS = 250

/** Per-attempt request timeout; a listener that accepts but never answers is not ready. */
const REQUEST_TIMEOUT_MS = 5_000

/** How long a terminate signal may take before the probe escalates to SIGKILL. */
const SHUTDOWN_TIMEOUT_MS = 15_000

/** Cap on the child output kept for diagnostics. */
const OUTPUT_LIMIT = 64 * 1024

/**
 * The authenticated surface URL the launcher prints for the one-click user to click.
 *
 * The path is the connection's entry path (`/workspace` in the shipped
 * composition, the dist root in a bare one), so the probe reads it rather than
 * assuming `/`.
 */
const PRINTED_URL = /http:\/\/127\.0\.0\.1:(\d+)\/[^\s?]*\?token=[A-Za-z0-9._~-]+/

/** One HTTP probe result. */
export interface HtmlProbe {
  /** Whether the response was a non-empty 2xx HTML document. */
  readonly ok: boolean
  /** Why the probe did not accept the response. */
  readonly detail?: string
}

/** What the boot probe observed, for the run log. */
export interface InstalledWebSurface {
  /** The public document URL that answered. */
  readonly landingUrl: string
  /** The authenticated surface URL the launcher printed. */
  readonly appUrl: string
}

/** Where and how to boot the installed executable. */
export interface InstalledWebSurfaceOptions {
  /** Executable to spawn, normally `process.execPath`. */
  readonly command: string
  /** Launcher arguments for the reserved port, normally the installed bin path plus the Web flags. */
  readonly args: (port: number) => readonly string[]
  /** Working directory for the child. */
  readonly cwd: string
  /** Child environment. */
  readonly env: NodeJS.ProcessEnv
  /** How long the server may take to answer its first request. */
  readonly timeoutMs?: number
  /** How long the launcher may take to print its authenticated URL. */
  readonly printedUrlTimeoutMs?: number
}

/** Child output accumulated for diagnostics, bounded to the tail. */
interface OutputCapture {
  text: string
}

/** Everything {@link waitForHtmlReadiness} needs to decide when to stop waiting. */
export interface ReadinessOptions {
  /** URL to poll. */
  readonly url: string
  /** How long to keep polling. */
  readonly timeoutMs: number
  /** Poll interval. */
  readonly pollMs?: number
  /** Probe implementation, injectable for tests. */
  readonly probe?: (url: string, timeoutMs: number) => Promise<HtmlProbe>
  /** Returns a failure description once the booted process is known to be gone. */
  readonly liveness?: () => string | undefined
}

/**
 * Reserve an unused loopback port.
 *
 * The port is released before the child binds it: the reservation only picks a
 * number the host just confirmed free, and the caller owns the short window
 * between release and bind.
 * @returns a promise of the reserved port number.
 */
export function reserveLoopbackPort(): Promise<number> {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer()
    server.on('error', rejectPort)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close()
        rejectPort(new Error('loopback port reservation returned no port'))
        return
      }
      const { port } = address
      server.close((error?: Error) => {
        if (error) rejectPort(error)
        else resolvePort(port)
      })
    })
  })
}

/**
 * Request one URL and accept it only as a non-empty 2xx HTML document.
 * @param url - absolute URL to request.
 * @param timeoutMs - per-attempt timeout.
 * @returns a promise of whether the response qualified, with the reason when it did not.
 */
export async function probeHtml(url: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<HtmlProbe> {
  let response: Response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) }
  }
  if (!response.ok) return { ok: false, detail: `status ${String(response.status)}` }
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.startsWith('text/html')) {
    return { ok: false, detail: `content-type ${JSON.stringify(contentType)}` }
  }
  const body = await response.text()
  if (body.trim() === '') return { ok: false, detail: 'empty HTML body' }
  return { ok: true }
}

/**
 * Poll one URL until it answers HTML, the deadline passes, or the process dies.
 * @param options - URL, deadline, and the two observations that end the wait early.
 * @returns a promise that resolves once the URL answers; it rejects when the
 * process died first or the deadline passed without an answer.
 */
export async function waitForHtmlReadiness(options: ReadinessOptions): Promise<void> {
  const probe = options.probe ?? probeHtml
  const pollMs = options.pollMs ?? POLL_MS
  const deadline = Date.now() + options.timeoutMs
  let lastDetail = 'no attempt was made'
  for (;;) {
    const died = options.liveness?.()
    if (died !== undefined) {
      throw new Error(`the installed server exited before answering ${options.url}: ${died}`)
    }
    const result = await probe(options.url, REQUEST_TIMEOUT_MS)
    if (result.ok) return
    lastDetail = result.detail ?? 'unknown failure'
    if (Date.now() >= deadline) {
      throw new Error(
        `the installed server did not answer ${options.url} within ${String(options.timeoutMs)}ms: ${lastDetail}`,
      )
    }
    await delay(pollMs)
  }
}

/**
 * Boot the installed surface, prove it serves, and shut it down.
 *
 * Readiness is asserted twice: the public landing document at `/` proves the
 * frontend dist is installed and the static fallback serves it, and the
 * authenticated URL the launcher prints proves the composed application shell
 * is reachable through the token the one-click user would click.
 * @param options - executable, arguments, working directory, and environment.
 * @returns a promise of the URLs that answered; it rejects when the child exits,
 * never answers, prints no URL, or does not shut down.
 */
export async function verifyInstalledWebSurface(
  options: InstalledWebSurfaceOptions,
): Promise<InstalledWebSurface> {
  const port = await reserveLoopbackPort()
  const landingUrl = `http://127.0.0.1:${String(port)}/`
  const child = spawn(options.command, [...options.args(port)], {
    cwd: options.cwd,
    env: options.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const capture: OutputCapture = { text: '' }
  const record = (chunk: Buffer): void => {
    capture.text = (capture.text + chunk.toString('utf8')).slice(-OUTPUT_LIMIT)
  }
  child.stdout.on('data', record)
  child.stderr.on('data', record)

  let status: { readonly code: number | null; readonly signal: NodeJS.Signals | null } | undefined
  // Registered before any kill, so termination never waits on an event that
  // already fired.
  const exited = new Promise<void>((resolveExit) => {
    child.once('exit', (code, signal) => {
      status = { code, signal }
      resolveExit()
    })
  })
  const liveness = (): string | undefined => status === undefined
    ? undefined
    : `exit ${String(status.code)} signal ${String(status.signal)}\n${capture.text.trim()}`

  try {
    await waitForHtmlReadiness({
      url: landingUrl,
      timeoutMs: options.timeoutMs ?? READY_TIMEOUT_MS,
      liveness,
    })
    const appUrl = await waitForPrintedUrl(capture, port, liveness, options.printedUrlTimeoutMs ?? PRINTED_URL_TIMEOUT_MS)
    await waitForHtmlReadiness({ url: appUrl, timeoutMs: PRINTED_URL_TIMEOUT_MS, liveness })
    return { landingUrl, appUrl }
  } finally {
    await terminate(child, exited, liveness)
  }
}

/**
 * Wait for the launcher's authenticated surface URL line.
 * @param capture - child output accumulated so far.
 * @param port - the port the child was told to bind.
 * @param liveness - describes the exit when the child is already gone.
 * @param timeoutMs - how long to wait for the line.
 * @returns a promise of the printed URL; it rejects when the child exits first
 * or prints no URL, or names a port other than the one it was told to bind.
 */
async function waitForPrintedUrl(
  capture: OutputCapture,
  port: number,
  liveness: () => string | undefined,
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const match = PRINTED_URL.exec(capture.text)
    if (match !== null) {
      if (Number(match[1]) !== port) {
        throw new Error(`the launcher printed port ${match[1]} but was told to bind ${String(port)}`)
      }
      return match[0]
    }
    const died = liveness()
    if (died !== undefined) {
      throw new Error(`the installed server exited before printing its URL: ${died}`)
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `the installed server printed no authenticated URL within ${String(timeoutMs)}ms; `
        + `output was:\n${capture.text.trim()}`,
      )
    }
    await delay(POLL_MS)
  }
}

/**
 * Terminate the booted child and refuse to leave it running.
 * @param child - the booted process.
 * @param exited - settles when the child exits.
 * @param liveness - describes the exit when it already happened.
 * @returns a promise that resolves once the child is gone; it rejects when the
 * child survives SIGKILL.
 */
async function terminate(
  child: { kill: (signal: NodeJS.Signals) => boolean },
  exited: Promise<void>,
  liveness: () => string | undefined,
): Promise<void> {
  if (liveness() !== undefined) return
  child.kill('SIGTERM')
  if (await settled(exited, SHUTDOWN_TIMEOUT_MS)) return
  child.kill('SIGKILL')
  if (!await settled(exited, SHUTDOWN_TIMEOUT_MS)) {
    throw new Error('the installed server did not exit after SIGKILL')
  }
}

/**
 * Race a settlement against a deadline.
 * @param settled - promise to race.
 * @param timeoutMs - how long to wait.
 * @returns a promise resolving true when the promise settled in time.
 */
function settled(settledPromise: Promise<void>, timeoutMs: number): Promise<boolean> {
  return Promise.race([
    settledPromise.then(() => true),
    new Promise<boolean>((resolveWait) => { setTimeout(() => { resolveWait(false) }, timeoutMs) }),
  ])
}

/**
 * Wait for one poll interval.
 * @param ms - milliseconds to wait.
 * @returns a promise that resolves after the delay.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolveWait) => { setTimeout(resolveWait, ms) })
}
