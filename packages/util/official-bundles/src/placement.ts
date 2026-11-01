/** Derived answers over the bundle lists, so consumers ask instead of re-testing names. */

import { EXPERIMENTAL_BUNDLES, HIDDEN_BUNDLES, ON_DEMAND_BUNDLES } from './bundles.ts'

/**
 * Whether the Plugins page marks a package with the Experimental badge.
 * @param name - exact npm package name.
 * @returns whether the bundle belongs to {@link EXPERIMENTAL_BUNDLES}.
 */
export function isExperimentalBundle(name: string): boolean {
  return EXPERIMENTAL_BUNDLES.has(name)
}

/**
 * Whether the installation offers the package for on-demand installation.
 * @param name - exact npm package name.
 * @returns whether the name is admitted by {@link ON_DEMAND_BUNDLES}.
 */
export function isOnDemandBundle(name: string): boolean {
  return ON_DEMAND_BUNDLES.includes(name)
}

/**
 * Whether the Plugins page leaves a bundle out of both lists.
 * @param name - exact npm package name.
 * @returns whether the name is admitted by {@link HIDDEN_BUNDLES}.
 */
export function isHiddenBundle(name: string): boolean {
  return HIDDEN_BUNDLES.has(name)
}
