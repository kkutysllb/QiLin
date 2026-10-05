/**
 * The slots the Plugins page declares for plugins that carry their own
 * configuration: the official plugins listed beside the official bundles, one
 * bundle's configuration on its page, and one row's configuration opened from
 * that row. A registrant merges this contract with `import type` and registers
 * through `ctx.slots`; it never imports this package at runtime.
 *
 * Every entry is rendered in two views the owner asks for: `summary` for the
 * one-liner the page places under the title, `page` for the form with its own
 * save control. The page draws the title, the icon, and the crumb itself.
 */

import type {} from '@qilin/client-ui-slots'
import type { ConfigForm, ConfigFormSnapshot } from '@qilin/client-ui-settings/client'

/** The view the page asks a configuration entry for. */
export interface PluginConfigViewProps {
  /** `summary` renders the one-liner alone, as text or inline nodes; `page` renders the form with its save control. */
  readonly view: 'summary' | 'page'
  /** Host-owned configuration values and write actions for this page's entry, when the Host serves its namespace. */
  readonly form?: ConfigPageForm | undefined
}

/** One user-requested bundle activation and navigation to its configuration page. */
export interface PluginActivationOwnerProps {
  readonly packageName: string
  /** Dismiss guidance for this activation. */
  readonly onDismiss: () => void
  /** Dismiss guidance and open this bundle's detail page. */
  readonly onOpenDetails: () => void
}

/** Add-plugin menu actions, independent of any selected bundle or Session. */
export interface PluginAddActionsProps {
  /** Close the add-plugin menu before starting the contributed action. */
  readonly onDismiss: () => void
}

/** Reactive page values and commands supplied by the configuration page owner. */
export interface ConfigPageForm {
  /** Accepted Host values; refreshed by the page owner. */
  readonly state: ConfigFormSnapshot<Record<string, unknown>>
  /** Submit all field edits together with the revision the editor read. */
  readonly mutate: ConfigForm<Record<string, unknown>>['mutate']
}

declare module '@qilin/client-ui-slots' {
  interface SlotMap {
    /** Additional MenuItemButton rows after installation: 72px high, with a title and a description capped at two lines. */
    'plugins.add.actions': { kind: 'list'; scope: 'root'; owner: PluginAddActionsProps }
    /** Optional guidance after the user enables a bundle from the list, keyed by npm package name. */
    'plugins.bundle.activation': { kind: 'keyed'; scope: 'root'; owner: PluginActivationOwnerProps }
    /**
     * One official plugin the Plugins page lists in its Official group after
     * the official bundles: `label` is the card's title and `order` its place.
     * The page renders the entry as the card's one-liner (`view: 'summary'`)
     * and, once the card is opened, as the body of the plugin's own page
     * (`view: 'page'`). OCCUPIED by the host-plane configuration pages
     * `ui-settings-plugins` ships; a bundle's configuration belongs in
     * `plugins.bundle.config` or `plugins.row.config` instead.
     */
    'plugins.item': { kind: 'list'; scope: 'root'; owner: PluginConfigViewProps }
    /**
     * A bundle's own configuration, keyed by the bundle's package name and
     * rendered on the bundle's page between its description and its rows
     * (`view: 'page'` only).
     */
    'plugins.bundle.config': { kind: 'keyed'; scope: 'root'; owner: PluginConfigViewProps }
    /**
     * The configuration of one row a bundle declares, keyed by
     * `<package name>#<row id>` with the row id as the bundle's patch declares
     * it: the row on the bundle's page gains a configure control that opens
     * the entry's page, headed by the row id and the entry's summary.
     */
    'plugins.row.config': { kind: 'keyed'; scope: 'root'; owner: PluginConfigViewProps }
  }
}
