# Agent Note: Pre-session entry, session lifetime, and usernames

Status: implemented

English | [中文](2026-09-16-pre-session-entry-and-usernames.zh.md)

## Problem

An unauthenticated browser that asked for a gated page was sent straight to a credential form: `/setup` while the deployment had no account, otherwise `/login?next=<path>`. That contradicts the product's entry flow — a visitor should meet the public landing page first and reach sign-in from there — and it made signing out land on the sign-in page too. Sessions lasted 30 days. Accounts were keyed only by an email address, so a deployment that wanted a name rather than an address had no way to record one.

## Decision

The account-session gate redirects every unauthenticated index request to the public landing page with `?next=<request path>`, and never to a credential form. The landing page reads `GET /api/auth/status` and points its entry calls to action at the document this deployment can serve — the sign-in document, or the first-run document while the account file is empty — carrying the validated `next` path so the visitor lands where they were going. Signing out navigates the browser to the same landing page. Both pre-session documents share one `?next=` validator (`next-destination.ts`) and one status reader (`account-status.ts`), so the open-redirect fence and the fact set have one home.

A browser session is valid for seven days by default (`sessionMaxAgeDays`, absolute: issued-at plus the configured lifetime, no sliding renewal), so an idle browser must sign in again after a week.

An account carries a username and an optional email address. Usernames are 3 to 32 characters of letters, digits, dot, dash, or underscore starting with a letter or digit, trimmed and lowercased before storage and lookup, and unique among accounts; the address stays optional and unique when present. `setup` and `register` read `{ username, email?, password }`; `login` reads `{ identifier, password }` and accepts either spelling; `change-password` updates each identity field it names, with an empty address clearing it. The account file moves to version 2 and reads version 1 records as accounts whose username is their stored address, so accounts created before this change keep signing in by address.

## Alternatives considered

- Keeping the gate's choice between the first-run and sign-in documents was rejected: the product wants the public page to be the way in, and a landing page whose only call to action led back to the gate could not offer one.
- Sliding renewal (a fresh cookie per request, expiring after a week of inactivity) was rejected: it needs a `Set-Cookie` on index responses and widens the session surface, while the requirement is a fixed validity period.
- Dropping the email address entirely was rejected: it would strand accounts that already exist and give up the one field an operator can use to recognize an account later.
- Two sign-in fields (name or address) were rejected in favor of one: the lookup normalizes either spelling to the same key, so a second control would only duplicate the rule.
- Deciding the entry destination on the server (a redirect straight to `/login` or `/setup`) was rejected: it would make the landing page a pass-through instead of the page the visitor sees, which is the behavior being changed.

## Consequences

Both the landing page and the sign-in document must stay public documents of the bundle, because the gate's redirect target and the call-to-action targets must be paths this server answers. An account that registered without an address can never sign in by address, and an operator cannot recover it by address either. A version 1 account file is read as usernames that look like addresses, so those names do not satisfy the new username pattern until an operator changes them. The landing page's entry link is rewritten after one status read; a visitor whose status read fails is sent to sign-in rather than the first-run form.

## Verification

`accounts-local` specifications cover the account-file version 2 shape, the version 1 read path, username and address uniqueness, identifier sign-in, and the gate's landing-page redirect, and the fixture now fails a boot whose row did not activate. `apps/web/tests/session-entry.spec.ts` covers the `?next=` fence (including scheme, protocol-relative, backslash, and folded-character refusals) and the three entry destinations the landing page chooses. `ui-account` specifications cover the signed-out and signed-in menu, and the sign-out navigation now asserts the landing page. The browser scenario `apps/web/tests/accounts-auth.e2e.ts` walks landing, first-run, sign-in, and sign-out against the new flow; it cannot execute in this working tree because the scaffold fails earlier on a pre-existing `ui-onboarding` settings-namespace registration.
