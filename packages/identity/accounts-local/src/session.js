/**
 * Account-session cookies: one signed token per browser, bound to the request
 * authority it was issued for and carrying the account identity plus the
 * credential generation it was minted under. The cookie is HttpOnly and
 * SameSite=Strict, so it travels only with same-site navigations and requests
 * and never becomes readable script state.
 * @module @qilin-agent/accounts-local/src/session
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { isRecord } from "./json.js";
const COOKIE_PREFIX = 'qilin-session-';
const PAYLOAD_VERSION = 1;
const SIGNATURE_VERSION = 's1';
const SIGNATURE_SEGMENTS = 3;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
/**
 * Header one hop in front of a runtime names the deployment's own authority in.
 *
 * A runtime reached through a deployment's single address is asked for a
 * *tenant* authority by its transport fences, while the sessions it mints belong
 * to the address the browser used. Naming them for the forwarded authority is
 * what keeps one cookie valid at every runtime of the deployment, so a browser
 * that signed in at the deployment's door reaches its own account's runtime
 * without signing in again.
 */
export const DEPLOYMENT_AUTHORITY_HEADER = 'x-qilin-deployment-authority';
/** Read one request header, whichever request representation supplied it. */
function header(headers, name) {
    if (headers instanceof Headers)
        return headers.get(name) ?? undefined;
    const value = headers[name];
    return typeof value === 'string' ? value : undefined;
}
/**
 * Read the authority and cookie header of one request together: a session is
 * only ever looked up for an authority this server can have been reached by.
 * @param headers - request headers from either representation.
 * @returns both facts, or undefined when the request names no usable authority.
 */
function lookupSession(headers) {
    // A forwarded authority wins when a hop in front named one: that is the
    // address the browser used, and the one its cookie is named for. Without one,
    // the Host header is the authority this server can have been reached by.
    const host = header(headers, DEPLOYMENT_AUTHORITY_HEADER) ?? header(headers, 'host');
    if (host === undefined)
        return undefined;
    try {
        return { authority: new URL(`http://${host}`).host, cookie: header(headers, 'cookie') };
    }
    catch {
        // A Host value the URL parser refuses is not an authority this server can
        // have been reached by; no cookie of ours names it either.
        return undefined;
    }
}
/**
 * Canonical request authority of one request: the Host header as a URL host,
 * which is the audience every issued cookie is bound to.
 * @param headers - request headers.
 * @returns the canonical authority, or undefined when the request carries none.
 */
export function requestAuthority(headers) {
    return lookupSession(headers)?.authority;
}
/** Cookie name private to one authority, so two ports never share a session. */
function cookieName(authority) {
    return COOKIE_PREFIX + createHash('sha256').update(authority).digest('base64url');
}
/**
 * Read one named cookie from a raw Cookie header. Session values are base64url
 * plus two dots, so the first `=` of a segment always separates name from value.
 */
function cookieValue(headerValue, name) {
    const segment = headerValue.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`));
    return segment?.slice(name.length + 1);
}
/** HMAC over one cookie body. */
function signature(secret, body) {
    return createHmac('sha256', secret).update(body).digest();
}
/** Decode one signed payload, or undefined when it is not this deployment's intact token. */
function unseal(value, secret) {
    const segments = value.split('.');
    if (segments.length !== SIGNATURE_SEGMENTS)
        return undefined;
    const [version, body, encodedSignature] = segments;
    if (version !== SIGNATURE_VERSION)
        return undefined;
    /* v8 ignore next -- a three-segment split always yields three entries; the
    guard exists for the element type under noUncheckedIndexedAccess */
    if (body === undefined || encodedSignature === undefined)
        return undefined;
    if (!BASE64URL_PATTERN.test(body) || !BASE64URL_PATTERN.test(encodedSignature))
        return undefined;
    const actualSignature = Buffer.from(encodedSignature, 'base64url');
    const expectedSignature = signature(secret, body);
    if (actualSignature.toString('base64url') !== encodedSignature)
        return undefined;
    if (actualSignature.byteLength !== expectedSignature.byteLength
        || !timingSafeEqual(actualSignature, expectedSignature))
        return undefined;
    let decoded;
    try {
        decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    }
    catch {
        // The signature matched, so the body is bytes this deployment signed; a
        // body that no longer parses is a truncated or hand-edited copy.
        return undefined;
    }
    return readPayload(decoded);
}
/** Narrow one decoded cookie body to a session payload. */
function readPayload(decoded) {
    if (!isRecord(decoded))
        return undefined;
    const { version, authority, subject, tokenVersion, issuedAt, expiresAt } = decoded;
    if (version !== PAYLOAD_VERSION)
        return undefined;
    if (typeof authority !== 'string' || typeof subject !== 'string')
        return undefined;
    if (typeof tokenVersion !== 'number' || !Number.isSafeInteger(tokenVersion))
        return undefined;
    if (typeof issuedAt !== 'number' || typeof expiresAt !== 'number')
        return undefined;
    return { version: PAYLOAD_VERSION, authority, subject, tokenVersion, issuedAt, expiresAt };
}
/** Account sessions issued by one deployment. */
export class SessionCookies {
    secret;
    maxAgeMilliseconds;
    secure;
    /**
     * @param secret - HMAC key every session of this deployment is signed with.
     * @param maxAgeMilliseconds - absolute session lifetime in milliseconds.
     * @param secure - whether the browser reaches this deployment over TLS, so
     * every cookie it sets must carry `Secure`. A deployment whose public address
     * terminates TLS sets this even though the runtime behind it speaks HTTP.
     */
    constructor(secret, maxAgeMilliseconds, secure = false) {
        this.secret = secret;
        this.maxAgeMilliseconds = maxAgeMilliseconds;
        this.secure = secure;
    }
    /** Attributes every cookie this deployment sets carries. */
    attributes() {
        return this.secure ? '; HttpOnly; SameSite=Strict; Secure' : '; HttpOnly; SameSite=Strict';
    }
    /**
     * Mint the Set-Cookie value that grants one account a session.
     * @param authority - request authority the browser reached this server by.
     * @param account - the account the session speaks for.
     * @param now - issuance timestamp in epoch milliseconds.
     * @returns the complete Set-Cookie header value.
     */
    issue(authority, account, now) {
        const expiresAt = now + this.maxAgeMilliseconds;
        const payload = {
            version: PAYLOAD_VERSION,
            authority,
            subject: account.id,
            tokenVersion: account.tokenVersion,
            issuedAt: now,
            expiresAt,
        };
        const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
        const value = `${SIGNATURE_VERSION}.${body}.${signature(this.secret, body).toString('base64url')}`;
        const maxAgeSeconds = Math.floor(this.maxAgeMilliseconds / 1000);
        return `${cookieName(authority)}=${value}; Max-Age=${String(maxAgeSeconds)}; Path=/; `
            + `Expires=${new Date(expiresAt).toUTCString()}${this.attributes()}`;
    }
    /**
     * Mint the Set-Cookie value that clears one authority's session.
     * @param authority - request authority whose cookie the browser should drop.
     * @returns the complete Set-Cookie header value.
     */
    clear(authority) {
        return `${cookieName(authority)}=; Max-Age=0; Path=/; Expires=${new Date(0).toUTCString()}${this.attributes()}`;
    }
    /**
     * Read the session one request carries.
     * @param request - incoming request headers.
     * @returns the verified payload, or undefined when the request carries no valid session.
     */
    read(request) {
        const lookup = lookupSession(request.headers);
        if (lookup === undefined || lookup.cookie === undefined)
            return undefined;
        const value = cookieValue(lookup.cookie, cookieName(lookup.authority));
        if (value === undefined)
            return undefined;
        const payload = unseal(value, this.secret);
        if (payload === undefined || payload.authority !== lookup.authority)
            return undefined;
        const now = Date.now();
        return payload.issuedAt <= now
            && payload.expiresAt > now
            && payload.expiresAt > payload.issuedAt
            && payload.expiresAt - payload.issuedAt <= this.maxAgeMilliseconds
            ? payload
            : undefined;
    }
}
//# sourceMappingURL=session.js.map