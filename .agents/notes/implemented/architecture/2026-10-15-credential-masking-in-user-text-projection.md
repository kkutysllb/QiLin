# Agent Note: Credential masking lives in the user-text projection

Status: implemented

English | [中文](2026-10-15-credential-masking-in-user-text-projection.zh.md)

## Problem

A credential pasted into a message stayed readable where the user reads it back: the sent bubble, a queued row's preview, and the goal command echo all rendered it verbatim. Providers publish those values in recognizable formats — a key or token prefix, a JSON Web Token, a PEM private key block, the password of an address that carries credentials — and a secret written in one of them can be masked without a user deciding anything per message.

Upstream DSH closes this in two layers: a rule registry in `ui-conversation` (`ctx.uiConversation.userText.register(rule)` with the keyed `conversation.user.text.node` slot) and a companion `packages/client/ui-secret-mask` plugin that registers one `secret` rule and one node renderer. QiLin's user text is not a registry. [`projectUserText`](../../../../packages/client/ui-primitives/src/user-text.tsx) is a pure projection in `ui-primitives` whose four decoration sources — the wire session form, recalled session labels, bare `@name` tokens, and caller-named `/name` tokens — are each derived from data the consuming plugin already holds.

## Decision

Credential recognition and masking live inside `ui-primitives`, beside the projection that uses them, as four modules: [`credential-formats.ts`](../../../../packages/client/ui-primitives/src/credential-formats.ts) holds the published prefix formats as data; [`credential-scanner.ts`](../../../../packages/client/ui-primitives/src/credential-scanner.ts) finds candidates, validates each against its format, merges overlapping candidates into the range that starts first, and returns masked ranges; [`credential-masks.ts`](../../../../packages/client/ui-primitives/src/credential-masks.ts) builds each mask form; [`SecretText.tsx`](../../../../packages/client/ui-primitives/src/SecretText.tsx) renders one masked range and its reveal control. None of the four is exported: the projection is their only consumer, and same-package specs import them through their source paths.

`projectUserText` gains a fifth decoration source, `secret`, and an optional `UserTextSecretLabels`. A masked range renders as a masked run rather than a reference chip, and a credential outranks every reference decoration it shares text with: the scanner's mask wins, so an `@name` token whose name is itself a key — or a wire session form whose label is one — cannot render the key raw as a chip label. Decoration ranges that only neighbour a credential keep their chips.

Only the display changes. The logged text, the copied characters, and the model input keep the original characters; masking never writes back to a session event, a request, or persisted state, and the mask characters stay in the DOM for copying and assistive technology while a stylesheet draws them as centered tiles.

The reveal control is supplied copy, not owned copy. `projectUserText` takes `UserTextSecretLabels` optional and `SecretText` renders the control only when it receives them, so the sent bubble passes `ui-chat`'s localized `secret.reveal` and `secret.hide` and the surfaces that offer no reveal control — the queue preview and the goal command echo — pass nothing and stay masked.

The published prefix table and the mask forms are upstream's, value for value: the same literals (`sk-`, `AIza`, `ghp_`, `github_pat_`, `glpat-`, `npm_`, `hf_`, `AKIA`/`ASIA`/`LTAI`/`AKID`, the `xox*` family, `sk_live_`/`sk_test_`/`rk_live_`/`rk_test_`, `whsec_`, `eyJ`), the same run checks, the same eight characters left readable on a prefixed key, the same BEGIN/END retention on a private key block, and the same password-only mask on an address. QiLin validates them with regular expressions instead of upstream's memoized character tables.

## Alternatives considered

**Port the upstream rule registry and its keyed slot.** `ui-goal`, `ui-reference`, and `ui-skill` would each register a rule, and the projection would become an evaluator over a mutable rule set. The registry exists so a feature plugin can claim a text range without the projection knowing it; in QiLin the same decorations already arrive as caller-supplied data (`sessionLabels`, `slashNames`), so the port would re-express four working sources as rules, add a plugin seam with no current consumer outside the built-in four, and make the shared baseline module depend upward on a feature package for its own scanner. [`packages/AGENTS.md`](../../../../packages/AGENTS.md) requires a current owner and need for each abstraction, and QiLin has no third-party plugin waiting for a user-text rule.

**Port upstream's scanner implementation as it stands.** Its table-driven, memoized derivation is built for a hot matching path; its own `regex-oracle` equivalence suite treats a regular-expression validation as the behavior's reference. QiLin renders a message once, so the same formats and the same masks come from a shorter validation that the per-file coverage gate can hold at 100%.

**Ship a separate `packages/client/ui-secret-mask` plugin package.** The scanner has one consumer — the projection — and that consumer is a statically linked baseline module every browser bundle inlines. A feature package would either duplicate its own copy of the scanner or invert the dependency direction; keeping the four modules internal to `ui-primitives` adds no package, no manifest row, and no module-table request.

**Rank credentials in the same-start tie-break.** A credential never starts where a reference token does — no credential literal begins with `@` or `/`, and the token matcher starts at those characters — so a secret rank in `rankOf` is unreachable logic. Precedence belongs one level up, where an overlapping decoration is dropped before rendering.

## Consequences

A credential in sent user text draws masked on every surface that projects user text, and the message bubble offers a per-value reveal that resets on remount and on a different value at the same position. Recognition is format-driven: a free-form password, a `name=value` assignment, and an unrecognized prefix stay plain, so the feature never guesses at a value's sensitivity. A private key block whose footer is missing masks to the end of the text rather than leaving its body readable.

The cost is the prefix table's maintenance: a new provider format is one row in `credential-formats.ts`, and the same table is what the mask shapes read. `ui-primitives` gains four internal modules and no new dependency, export, manifest entry, or package.

## Testing

[`credential-scanner.client.spec.ts`](../../../../packages/client/ui-primitives/tests/credential-scanner.client.spec.ts) covers every published prefix family, the formats a near-miss must not match (`sk-` without a digit, a digit past the window, a `bounded` run over its maximum or closed by a word character, an invalid PEM header, a broken JSON Web Token), each mask form including line breaks and surrogate pairs, and the two merge directions. [`secret-text.client.spec.tsx`](../../../../packages/client/ui-primitives/tests/secret-text.client.spec.tsx) covers the reveal round trip, the value without control copy, and the remask on a replaced value. [`user-text.client.spec.tsx`](../../../../packages/client/ui-primitives/tests/user-text.client.spec.tsx) covers the projection: masked output without control copy, the reveal control with it, a slash chip beside a credential, and the three decorations a credential suppresses. `pnpm run test:gui` runs them, and the four sources sit inside the package's per-file 100% coverage gate.

## Related

- [Locale-owned client UI copy](2026-08-23-locale-owned-client-ui-copy.md) — why the reveal copy arrives through a prop from the composing plugin instead of a dictionary in the primitive.
- [Upstream 0.2.1-alpha.3 alignment plan](../../../../plans/2026-10-15-upstream-0.2.1-alpha.3-alignment.md) — the delta this decision settles and the window it belongs to.
