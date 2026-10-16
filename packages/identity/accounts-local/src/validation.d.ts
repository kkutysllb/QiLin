/**
 * Credential rules shared by the sign-in endpoints: one username and one email
 * normalization plus one minimum password length, so the page and the server
 * enforce the same acceptable input.
 * @module @qilin-agent/accounts-local/src/validation
 */
/** Minimum accepted password length. */
export declare const MIN_PASSWORD_LENGTH = 8
/** Minimum accepted username length, counting its first character. */
export declare const MIN_USERNAME_LENGTH = 3
/** Maximum accepted username length. */
export declare const MAX_USERNAME_LENGTH = 32
/**
 * Normalize one submitted username for storage and lookup.
 * @param username - the submitted value.
 * @returns the trimmed, lowercased username.
 */
export declare function normalizeUsername(username: string): string
/**
 * Normalize one submitted email for storage and lookup.
 * @param email - the submitted value.
 * @returns the trimmed, lowercased address.
 */
export declare function normalizeEmail(email: string): string
/**
 * Whether one normalized address is an acceptable account address.
 * @param email - a {@link normalizeEmail} result.
 * @returns true when the address has a local part, a domain, and a dot-separated suffix.
 */
export declare function isValidEmail(email: string): boolean
/**
 * Whether one normalized name is an acceptable account name.
 * @param username - a {@link normalizeUsername} result.
 * @returns true when the name has an acceptable first character, an acceptable body, and an acceptable length.
 */
export declare function isValidUsername(username: string): boolean
//# sourceMappingURL=validation.d.ts.map
