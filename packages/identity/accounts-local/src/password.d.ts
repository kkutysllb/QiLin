/**
 * Password hashing for local accounts: scrypt with a per-account salt, encoded
 * as one self-describing string so a stored hash carries the parameters it was
 * derived under. The cost keeps one verification in the tens of milliseconds,
 * which is the only brute-force brake a local server has.
 * @module @qilin-agent/accounts-local/src/password
 */
/**
 * Derive the stored representation of one password.
 * @param password - the plaintext password.
 * @returns the encoded hash, salt and parameters included.
 */
export declare function hashPassword(password: string): Promise<string>
/**
 * Verify one password against a stored hash, in constant time.
 * @param password - the submitted plaintext password.
 * @param encoded - the stored hash from the account file.
 * @returns true only when the derived key matches the stored key.
 * @throws Error when the stored value is not a hash this module wrote.
 */
export declare function verifyPassword(password: string, encoded: string): Promise<boolean>
//# sourceMappingURL=password.d.ts.map
