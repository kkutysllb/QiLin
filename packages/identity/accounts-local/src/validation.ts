/**
 * Credential rules shared by the sign-in endpoints: one username and one email
 * normalization plus one minimum password length, so the page and the server
 * enforce the same acceptable input.
 * @module @qilin/accounts-local/src/validation
 */

/** Minimum accepted password length. */
export const MIN_PASSWORD_LENGTH = 8

/** Minimum accepted username length, counting its first character. */
export const MIN_USERNAME_LENGTH = 3

/** Maximum accepted username length. */
export const MAX_USERNAME_LENGTH = 32

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u
/**
 * An acceptable username: letters, digits, `_`, `.`, and `-`, starting with a
 * letter or digit, 3 to 32 characters. The pattern applies to the normalized
 * (lowercased) form, so one account cannot be spelled two ways.
 */
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_.-]{2,31}$/u

/**
 * Normalize one submitted username for storage and lookup.
 * @param username - the submitted value.
 * @returns the trimmed, lowercased username.
 */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

/**
 * Normalize one submitted email for storage and lookup.
 * @param email - the submitted value.
 * @returns the trimmed, lowercased address.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Whether one normalized address is an acceptable account address.
 * @param email - a {@link normalizeEmail} result.
 * @returns true when the address has a local part, a domain, and a dot-separated suffix.
 */
export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email)
}

/**
 * Whether one normalized name is an acceptable account name.
 * @param username - a {@link normalizeUsername} result.
 * @returns true when the name has an acceptable first character, an acceptable body, and an acceptable length.
 */
export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username)
}
