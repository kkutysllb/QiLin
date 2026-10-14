---
name: cordis-plugin-development
description: Use when adding, enabling, disabling, installing, configuring, or debugging a plugin, bundle, feature, page, panel, tool, or MCP connection in the current QiLin profile, including a shipped plugin that is disabled by default, and for any visual object, decoration, or widget request that names no other destination, which means an installed UI plugin rendered in the QiLin Web UI.
---

# Persistent QiLin plugins

Use ordinary workspace files to author a bundle, then `plugin_manager` with `action: install_bundle` and the absolute package directory as `target` to install it in the current profile. Changes affect every session in that profile and survive restart. Load `editing-cordis-compositions` for agent preset changes.

Do not write the profile's `package.json` or `cordis.patch.yml`, create packages under `$QILIN_HOME`, or run pnpm in the profile directory: `install_bundle` performs those steps, and each hand-made write outside the workspace needs its own approval. Every `plugin_manager` action, including `list_plugins` and `list_bundles`, also needs approval without Full access, so call it only when its result decides the next step.

## Enable a shipped plugin

A shipped bundle can resolve a plugin row and leave it `disabled`. The row id and its reason are in the shipped patch, `packages/bundle/*/cordis.patch.yml` in a source checkout. Write a workspace bundle whose patch overrides that row with `disabled: false` and inserts the Host rows it depends on; a source checkout's `apps/cli/config/examples/<feature>/` holds the overlay that lists them for opt-in features. Packages shipped with QiLin resolve from the QiLin installation, so the bundle declares no dependencies on them. Install it with `install_bundle`.

## Deliver a working plugin first

1. Resolve the requested result and destination. An unspecified visual destination is the current QiLin Web UI; a standalone image or HTML file does not complete such a request. Choose reasonable visual details and implement a small first version; install it before visual refinement.
2. Discover only the APIs needed for that version: `cordis_inspect_list`, then targeted `cordis_inspect_query` calls. For UI, query Client `Slots.listSubTree` and the selected slot's registration options and props. For anything beyond a static decoration, such as tool policy, agent context, session-derived state, or Chat rows, read `references/practices.md` before choosing the extension point. Once the chosen slot and registration API are known, write the plugin.
3. Read and copy the matching template files into one workspace directory, or author the package, patch, and required Host/Client files there. Before installing, complete the display checklist in `references/host-plugin.md`: meaningful localized titles/descriptions, an original or licensed icon, and exported resources with distribution checks where applicable. This applies to Host-only and configuration-only bundles too; adapt template text and artwork to the request. Check JavaScript syntax and the manifest, then install. Use the installed plugin as the first preview; do not create preview HTML, mock shells, design variants, screenshot scripts, or rasterizer tooling first.
4. Read the installation result: `application` and `warnings` decide whether the change is live, not logs, process lists, or the page's boot payload. Confirm new rows with approval-free `cordis_inspect_query`, not `list_plugins`. After `application: applied`, exercise the capability or inspect the live Client registration. Verify installed display metadata and the icon using `references/host-plugin.md`. Use the connected page when available; follow `references/verification.md` for page/panel design checks and unavailable browser control. Restore user state changed during testing. Report verification limits; installation and slot registration alone do not establish what the user sees.
5. Fix observed defects in the same plugin. When the requested result works, finish with its location, verification status, and the reason for any display-resource exception; never silently accept default artwork. Do not continue speculative variants, optional features, or mock previews. Close any task list you created.

## Knowledge sources, in order

1. Inspection: `cordis_inspect_query` answers exact Service methods and Event modes (`Service`, `Event`), the plain-JavaScript symbols a dynamic Host half can call (`Builtin`), the Tools this Agent can call (`Tool`), and live Client Slots and theme tokens (`Slots`, `Theme`).
2. Package documentation: read `<packageDir>/README.md` for the package a row names. Bundled packages resolve from the QiLin installation while profile-installed bundles live under the active profile's `node_modules`, so neither location alone is authoritative; `plugin_manager` `list_bundles` reports for each bundle whether the profile or the installation holds it. Do not assume a path.
3. Source: installed packages ship built `lib/index.js` and `lib/types/**/*.d.ts` with JSDoc under that same `packageDir`, not `src/`; a source checkout of QiLin has `packages/<group>/<name>/src`. Read them when inspection and the README leave a question open, and start source-level diagnosis from a concrete installation or runtime failure.

## Read next

The files below live in this skill's base directory, which the `skill` tool reported, and the table is the complete list: do not enumerate that directory. In every deployment, including a source checkout, read these files with the file-read tool, write copies into the workspace with the file-write tool, and verify a copy by reading it back. Never install or syntax-check a template in place; copy its contents into the workspace first.

| Task | File |
|---|---|
| Bundle manifest, locale resources, icons, installation, Host exports and Config | `references/host-plugin.md` |
| Web UI: Client manifest, module loader, slot registration | `references/ui-plugin.md` |
| Connecting an MCP server through a configuration-only bundle | `references/mcp-bundle.md` |
| Page/panel design checks and verification without browser control | `references/verification.md` |
| UI plugin template, including display resources | `templates/decoration/package.json`, `templates/decoration/cordis.patch.yml`, `templates/decoration/index.js`, `templates/decoration/client.js`, `templates/decoration/locale/en.json`, `templates/decoration/icon.svg` |
| MCP bundle template, including display resources | `templates/mcp/package.json`, `templates/mcp/cordis.patch.yml`, `templates/mcp/locale/en.json`, `templates/mcp/icon.svg` |
| UI plugin starting point, four files | `templates/decoration/package.json`, `templates/decoration/cordis.patch.yml`, `templates/decoration/index.js`, `templates/decoration/client.js` |
| MCP bundle starting point, two files | `templates/mcp/package.json`, `templates/mcp/cordis.patch.yml` |
| Loader patch dialect and the list of installable plugin packages | the `cordis-composition-reference` skill |
| Choosing extension points, contexts, and state mechanisms for upgrade stability and performance | `references/practices.md` |
