/** Package admission shared by offline catalog generation and release ordering. */

/**
 * Public QiLin release members available through the ordinary on-demand bundle
 * installer. The set is empty until a release ships one: the two subagent
 * backends that filled it were removed from the product.
 */
export const ON_DEMAND_BUNDLES: readonly string[] = []
