/**
 * @qilin-agent/accounts-local — the local account surface of a Web deployment: one
 * account file under the harness home, scrypt password hashes, signed HttpOnly
 * session cookies, the `/api/auth` endpoints, and the account-session gate the
 * browser transport consults for its index documents and its shared `/api`
 * route. The file is the deployment's whole roster and the gate admits every
 * account in it, so one file alone is not a tenancy boundary. `admittedAccounts`
 * narrows one deployment to named accounts, and that is what makes the gate a
 * boundary between runtimes that share the file: a tenant runtime admits its own
 * accounts while plugins, model settings, and credentials stay shared. The
 * boundary is the runtime, never the account — every account one deployment
 * admits still reaches the same Sessions, credentials, and files.
 * @module @qilin-agent/accounts-local
 */
import { join } from 'node:path';
import z from '@qilin-agent/schemastery';
import { resolveQilinHome } from '@qilin-agent/home-paths';
import { AccountStore, loadSessionSecret } from "./accounts.js";
import { createSessionAuthority } from "./gate.js";
import { createAuthRoutes } from "./routes.js";
import { SessionCookies } from "./session.js";
import { LoginThrottle } from "./throttle.js";
export { AUTH_API_PREFIX, LOGIN_PATH, SETUP_PATH } from "./paths.js";
export { DEPLOYMENT_AUTHORITY_HEADER } from "./session.js";
export { AccountStore } from "./accounts.js";
export { isValidEmail, isValidUsername, MIN_PASSWORD_LENGTH, normalizeEmail, normalizeUsername, } from "./validation.js";
export { verifyPassword } from "./password.js";
/** Stable Cordis plugin name. */
export const name = 'accounts-local';
/** Services required before the account surface can mount. */
export const inject = ['connection'];
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;
export const Config = z.object({
    enabled: z.boolean().default(true),
    registration: z.union([z.const('open'), z.const('closed')]).default('open'),
    sessionMaxAgeDays: z.natural().min(1).default(7),
    sessionCookieSecure: z.boolean().default(false),
    loginMaxAttempts: z.natural().min(1).default(10),
    loginAttemptWindowSeconds: z.natural().min(1).default(900),
    qilinHome: z.string(),
    // The union keeps the key absent when the deployment names no accounts: an
    // empty list is a deployment that admits nobody, which fails loud in apply().
    admittedAccounts: z.union([z.array(z.string()), z.const(undefined)]),
});
/**
 * Account file of one harness home.
 * @param qilinHome - absolute harness home.
 * @returns the absolute account file path.
 */
export function accountsFilePath(qilinHome) {
    return join(qilinHome, 'auth', 'accounts.json');
}
/**
 * Read the account identities one deployment admits.
 *
 * The value crosses the configuration boundary, where a bare YAML key parses as
 * null and a scalar as itself; both are refused rather than read as a list.
 * @param value - the validated `admittedAccounts` config value.
 * @returns the named identities, or undefined when the deployment names none.
 * @throws Error when the value is present and is not a list of account ids.
 */
function accountIds(value) {
    if (value === undefined)
        return undefined;
    const candidate = value;
    if (!Array.isArray(candidate) || !candidate.every((id) => typeof id === 'string')) {
        throw new Error('accounts-local: admittedAccounts must list account ids');
    }
    return candidate;
}
/**
 * Resolve the accounts one deployment admits from its own account file.
 * @param config - validated plugin config.
 * @param registration - effective registration policy.
 * @param store - the harness home's account set.
 * @param path - account file the store was opened from, named in failures.
 * @returns the admitted identities, or undefined when the deployment admits every account.
 * @throws Error when the list names no account, names one the file does not hold, or leaves registration open.
 */
function admitAccounts(config, registration, store, path) {
    const named = accountIds(config.admittedAccounts);
    if (named === undefined)
        return undefined;
    if (named.length === 0)
        throw new Error('accounts-local: admittedAccounts names no account');
    // An account the list does not name could never use this deployment, so
    // leaving registration open would hand a visitor an account with no way in.
    if (registration !== 'closed') {
        throw new Error('accounts-local: admittedAccounts requires registration: closed');
    }
    for (const id of named) {
        if (store.byId(id) === undefined) {
            throw new Error(`accounts-local: admittedAccounts names an account that ${path} does not hold: ${id}`);
        }
    }
    return new Set(named);
}
/**
 * Mount the account surface: the authentication endpoints, and — when the gate
 * is enabled — the session authority the transport enforces.
 * @param ctx - plugin context carrying the connection and credential services.
 * @param config - validated {@link Config}.
 */
export async function apply(ctx, config) {
    const enabled = config.enabled ?? true;
    const registration = config.registration ?? 'open';
    const sessionMaxAgeDays = config.sessionMaxAgeDays ?? 7;
    const home = resolveQilinHome(config.qilinHome);
    const path = accountsFilePath(home);
    const store = await AccountStore.open(path);
    const admitted = admitAccounts(config, registration, store, path);
    const sessions = new SessionCookies(await loadSessionSecret(home), sessionMaxAgeDays * DAY_MILLISECONDS, config.sessionCookieSecure ?? false);
    const currentAccount = (request) => {
        const payload = sessions.read(request);
        if (payload === undefined)
            return undefined;
        const account = store.byId(payload.subject);
        // A credential change bumps the generation; a cookie minted before it stops
        // naming an account even though its signature still verifies.
        if (account === undefined || account.tokenVersion !== payload.tokenVersion)
            return undefined;
        // An account this deployment does not admit stops naming a session here for
        // the same reason: the cookie is intact and says nothing this deployment serves.
        return admitted === undefined || admitted.has(account.id) ? account : undefined;
    };
    const throttle = new LoginThrottle(config.loginMaxAttempts ?? 10, (config.loginAttemptWindowSeconds ?? 900) * 1000);
    for (const route of createAuthRoutes({ store, sessions, currentAccount, enabled, registration, admitted, throttle })) {
        ctx.connection.fetch.register(route);
    }
    if (enabled) {
        ctx.connection.session.install(createSessionAuthority({ currentAccount }));
    }
}
//# sourceMappingURL=index.js.map