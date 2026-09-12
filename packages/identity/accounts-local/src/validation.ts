/**
 * Credential rules shared by the sign-in endpoints: one email normalization and
 * one minimum password length, so the page and the server enforce the same
 * acceptable input.
 * @module @qilin/accounts-local/src/validation
 */

/** Minimum accepted password length. */
export const MIN_PASSWORD_LENGTH = 8

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

/**
 * Normalize one submitted email for storage and lookup.
 * @param email - the submitted value.
 * @returns the trimmed, lowercased address.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Whether one normalized address is an acceptable account name.
 * @param email - a {@link normalizeEmail} result.
 * @returns true when the address has a local part, a domain, and a dot-separated suffix.
 */
export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email)
}
