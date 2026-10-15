/**
 * Desktop browser bridge contract.
 *
 * Upstream declares these in its sidebar browser client package. This repository's
 * client ships no desktop-browser surface, so the desktop keeps the declarations
 * here and its guest operations stay inert.
 *
 * @module browser-bridge-types
 */

/** Identifier of one main-issued browser lease. */
export type DesktopBrowserLeaseId = string & { readonly __desktopBrowserLease: unique symbol }

/** One approved request to open a browser guest. */
export interface DesktopBrowserOpenRequest {
  readonly url: string
  readonly partition?: string
  readonly lease: DesktopBrowserLeaseId
}

/** Reservation held while a guest is attached. */
export interface DesktopBrowserReservation {
  readonly lease: DesktopBrowserLeaseId
  readonly partition: string
  readonly attached?: boolean
}
