/** Disposable localhost TLS material for a deployment a test serves itself. */

import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { generate } from 'selfsigned'

/** The certificate and key one deployment terminates TLS with, and the PEM a client trusts. */
export interface DeploymentTls {
  /** Certificate file for the hub's TLS binding. */
  readonly certFile: string
  /** Unencrypted private key file for that binding. */
  readonly keyFile: string
  /** The certificate PEM itself, which a test client trusts. */
  readonly cert: string
}

const COMMON_NAME = 'localhost'

let generated: { cert: string; key: string } | undefined

/** One self-signed localhost certificate per process; RSA key generation is the only slow part. */
function pems(): { cert: string; key: string } {
  generated ??= (() => {
    const { cert, private: key } = generate([{ name: 'commonName', value: COMMON_NAME }], {
      keySize: 2048,
      days: 30,
      algorithm: 'sha256',
      extensions: [
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
        { name: 'extKeyUsage', serverAuth: true },
        {
          name: 'subjectAltName',
          altNames: [{ type: 2, value: COMMON_NAME }, { type: 7, ip: '127.0.0.1' }],
        },
      ],
    })
    return { cert, key }
  })()
  return generated
}

/**
 * Write one deployment's TLS material into a directory.
 * @param directory - directory to write into, created when missing.
 * @returns the two file paths and the PEM a client trusts.
 */
export async function materializeDeploymentTls(directory: string): Promise<DeploymentTls> {
  const material = pems()
  const root = resolve(directory)
  await mkdir(root, { recursive: true })
  const written: DeploymentTls = {
    certFile: join(root, 'tls-cert.pem'),
    keyFile: join(root, 'tls-key.pem'),
    cert: material.cert,
  }
  await Promise.all([
    writeFile(written.certFile, material.cert),
    writeFile(written.keyFile, material.key, { mode: 0o600 }),
  ])
  return written
}
