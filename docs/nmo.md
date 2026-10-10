# NMO — product philosophy

English | [中文](nmo.zh.md)

NMO is the charter of the product line anchored by QiLin: the QiLin harness itself and every product that ships on it follow it. A new product states how it follows all three principles before it builds features; a design dispute is settled by them; a feature that violates one does not ship. This page is the one home of the philosophy — products link here and never restate it.

Version 1.0. A revision bumps the version and records its reason; product instances never fork the text.

## the-three-principles

| Principle | What it guards | The question that settles a dispute |
|---|---|---|
| Native | Facts leaking out of the product into third-party services or the user's memory | Where does the truth of this fact live? The answer must be our own runtime. |
| Minimal | Work pushed back onto the user as forms, choices, and procedures | How many steps does the user take? What the system can infer is not asked. |
| Open | Capabilities growing into black boxes | Is the contract public? A capability without a public contract cannot become a dependency. |

One line each: Native means you own it; Minimal means the user spends the fewest operations the task allows; Open means the world can enter.

## native

Agent, session, domain, and plugin lifecycles and runtime facts are managed by the product's own runtime, never parked in a third-party service, an external tool, or the user's memory.

Promises: every product fact — a session, a domain entity, plugin state, a configuration — answers "where is the truth" with our own runtime or storage; any session is rebuildable from its local log; uninstalling or migrating leaves no unexplained residue.

Not promised: shipping every backend in the box (third-party APIs may be called, but the call records and the resulting state are ours), and offline availability.

A design violates native when the product depends on state that cannot be found after leaving the product, or when a key fact exists only in the user's head or a screenshot.

Acceptance: sample any ten product facts and each one points at its storage location and rebuild path; kill the process and restart, and session and domain state survive through log replay.

## minimal

The user completes a task with the fewest operations the task allows. Natural language is the primary operating surface; the system and its agents infer, match, and execute; interruption happens only at irreversible, high-cost, or integrity-critical decision points.

Promises: a fresh install reaches a first result without reading documentation or filling configuration; the system matches the task to modes, tools, and skills instead of exposing a picker; every interruption maps to a real user decision and never to an empty "continue?"; internal vocabulary — presets, workspaces, sessions, plugin mechanics — stays out of the user's vocabulary.

Not promised: few features — Minimal bounds interaction cost, not feature scope; full autonomy — a confirmation gate is part of Minimal, not a violation of it.

A design violates minimal when it asks the user for a choice the system could have inferred, stacks procedural steps where one statement would do, or opens on a configuration page.

Acceptance: each product registers N, the maximum number of user inputs for its standard task, and M, the maximum steps from first launch to a first result crossing no configuration; every interruption can answer "what did the user decide here," and one that cannot is a defect.

## open

Official, third-party, and user capabilities all extend the product through public contracts; a capability is defined by its contract, not by its implementation.

Promises: the discovery, registration, and invocation contracts for extensions are public, so a third party integrates without reading product source; an official implementation can be replaced by a third-party implementation under the same contract; an installed extension is discovered and invoked without touching the product core.

Not promised: unreviewed trust (risky extensions still pass the permission and approval surfaces), and compatibility with every historical contract (contracts themselves version).

A design violates open when a capability integrates only after reading source, when built-in and external implementations speak different protocols for the same job, or when a third-party extension needs hand wiring before the product discovers it.

Acceptance: a new third-party capability lands without changing product code or reading product source; removing any official plugin leaves the product's core function intact.

## use-and-revision

A new product opens with an NMO accounting section: how it follows each principle and where it consciously yields. A yield is registered explicitly — who yielded, why, and when it is reclaimed. A revision of this page bumps the version and records the reason.
