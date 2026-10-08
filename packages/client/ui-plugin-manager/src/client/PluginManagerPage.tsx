/**
 * Global plugin management: the Official group's cards for the bundles the
 * installation ships switched off and for the official plugins that register
 * their configuration, the Installed group's cards for the profile's bundles,
 * their row switches, the install dialog with its guide and folded pnpm
 * output, the uninstall confirmation, and the toasts an action's outcome
 * becomes. A bundle's page lists the rows it contributes as the Host runs
 * them; a plugin's configuration renders on its own page through the slots
 * the page declares.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { PluginAudience, PluginInstallFailureKind, Registry } from '@qilin-agent/api-remotes/client'
import type { ConfigPageForm } from './slot-contract.ts'
import {
  Button, IconCheckOutline16, IconChevronDownOutline14, IconChevronLeftOutline14, IconChevronRightOutline14, IconCloseOutline16,
  IconCordisPluginOutline14, IconDownloadOutline16, IconPluginPinwheelOutline16, IconPlusOutline16, IconRefreshOutline16,
  IconRightUpOutline16, IconSearchOutline16, IconTrashOutline16,
  IconWarningOutline16, Input, Modal, StateDot, Switch, Tag, TerminalBlock, Toast,
  useDismissOnOutsidePointer,
  type StateDotState, type TerminalBlockLabels,
} from '@qilin-agent/client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@qilin-agent/client-ui-slots'
import { rowConfigKey, type OfficialItem } from './config-ledger.ts'
import type { PluginManagerLocaleKey } from './locales.ts'
import {
  asksMirror, githubRecoveryRegistry, isInstallPending, offeredRegistries, rowKey,
  type CatalogState, type ConfirmState, type InstallInputError, type InstallState, type InstallSubject, type PackageRow,
  type PackageView, type PluginManagerFace, type RegistryChoice, type UpdateState,
} from './manager-store.ts'
import { managementText, noticeText, packageText, registryText, type Translate } from './presentation.ts'
import type {} from './slot-contract.ts'
import css from './PluginManagerPage.module.css'

/** Full component props assembled by the Settings tab renderer. */
export type PluginManagerPageProps =
  PropsRuntime<'settings.plugins.tab'>
  & PropsLocale<'pluginManager'>
  & PropsRenderSlots<'plugins.item' | 'plugins.bundle.activation' | 'plugins.bundle.config' | 'plugins.row.config' | 'plugins.add.actions'>
  & InjectFace<PluginManagerFace>

/** The audience choices the detail page and the install dialog offer, in display order. */
const AUDIENCES: readonly PluginAudience[] = ['general', 'coding', 'both']

/** The page's slot renderer, narrowed to the configuration slots. */
type RenderConfig = PluginManagerPageProps['renderSlot']

/** What the page shows: the cards, a bundle's page, an official plugin's page, or a row's configuration page. */
type View =
  | { readonly kind: 'list' }
  | { readonly kind: 'package'; readonly name: string }
  | { readonly kind: 'item'; readonly id: string }
  | { readonly kind: 'row'; readonly name: string; readonly rowId: string }

type RowPhase = NonNullable<PackageRow['phase']>

/**
 * The primary action installs; the adjacent menu offers every add-plugin path.
 * A page-local anchored list because the contributed rows are rendered
 * elements (`plugins.add.actions`), not the data entries the shared Menu
 * primitive takes.
 * @param props - copy, the load gate, the install dialog opener, and the slot renderer.
 * @returns the split add-plugin control with its open menu.
 */
function AddPluginMenu({ t, disabled, openInstall, renderSlot }: {
  readonly t: Translate
  readonly disabled: boolean
  readonly openInstall: () => void
  readonly renderSlot: PropsRenderSlots<'plugins.add.actions'>['renderSlot']
}): ReactNode {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)
  useDismissOnOutsidePointer(rootRef, open, setOpen)
  const onDismiss = (): void => { setOpen(false) }
  return (
    <span ref={rootRef} className={css.addGroup} role="group" aria-label={t('addPlugin')}>
      <Button variant="primary" size="sm" className={css.addPrimary} icon={<IconPlusOutline16 size={13} />}
        disabled={disabled} onClick={() => { onDismiss(); openInstall() }}>
        {t('addPlugin')}
      </Button>
      <button
        type="button"
        className={css.addMore}
        disabled={disabled}
        aria-label={t('chooseAddMethod')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => { setOpen(value => !value) }}
        onKeyDown={(event) => {
          if (!open && event.key === 'ArrowDown') { event.preventDefault(); setOpen(true) }
        }}
      >
        <IconChevronDownOutline14 size={12} />
      </button>
      {open && (
        <div className={css.addMenu} role="menu" aria-label={t('chooseAddMethod')}>
          <button
            type="button"
            role="menuitem"
            className={css.addMenuItemRow}
            onClick={() => { onDismiss(); openInstall() }}
          >
            <IconDownloadOutline16 size={14} />
            <span className={css.addMenuItem}>
              <span>{t('installExisting')}</span>
              <span className={css.addMenuDescription}>{t('installExistingDescription')}</span>
            </span>
          </button>
          {renderSlot('plugins.add.actions', { onDismiss })}
        </div>
      )}
    </span>
  )
}

/** How long the list marks a package an install just enabled. */
const HIGHLIGHT_MS = 2_400

/** Built-in profile bundles stay out of this page even when the profile declares them as dependencies. */
const BUILTIN_PROFILE_BUNDLES = new Set([
  '@qilin-agent/base',
  '@qilin-agent/web-app',
  '@qilin-agent/headless',
  '@qilin-agent/sdk-app',
  '@qilin-agent/acp-app',
  '@qilin-agent/sdk-minimal',
])

/** How long a toast holds: long enough to read a failure that names what broke. */
function toastHoldMs(text: string): number {
  return Math.min(8_000, Math.max(3_000, text.length * 80))
}

const PHASE_KEYS = {
  pending: 'rowPhasePending',
  loading: 'rowPhaseLoading',
  active: 'rowPhaseActive',
  failed: 'rowPhaseFailed',
  unloading: 'rowPhaseUnloading',
} satisfies Record<RowPhase, PluginManagerLocaleKey>

/** Status dot naming a live root-fiber phase: pending and unloading fibers do nothing; only loading is in progress. */
const PHASE_STATES = {
  pending: 'idle',
  loading: 'ongoing',
  active: 'done',
  failed: 'error',
  unloading: 'idle',
} satisfies Record<RowPhase, StateDotState>

/** The count line over a pack's components: the total, then only the states that occur. */
function partsSummary(rows: readonly PackageRow[], t: Translate): string {
  const failed = rows.filter(row => row.phase === 'failed').length
  const off = rows.filter(row => !row.enabled).length
  const running = rows.filter(row => row.enabled && row.phase === 'active').length
  return [
    t('partsCountTotal', { count: String(rows.length) }),
    ...running > 0 ? [t('partsCountRunning', { count: String(running) })] : [],
    ...off > 0 ? [t('partsCountOff', { count: String(off) })] : [],
    ...failed > 0 ? [t('partsCountFailed', { count: String(failed) })] : [],
  ].join(' · ')
}

/** Switching for a pack's rows: which rows have a write in flight, and the write. */
interface RowToggles {
  readonly busy: (row: PackageRow) => boolean
  readonly onSetEnabled: (row: PackageRow, enabled: boolean) => void
}

/** Configuration for a pack's rows: which rows registered a page of their own, and opening it. */
interface RowConfigure {
  readonly has: (row: PackageRow) => boolean
  readonly open: (row: PackageRow) => void
}

/** Rows beyond this count get a filter box above the list. */
const ROW_FILTER_THRESHOLD = 10

/** A row's switch: locked, saying why, when the Host refuses to address the row through the profile patch. */
function RowSwitch({ row, t, busy, onChange }: {
  readonly row: PackageRow
  readonly t: Translate
  readonly busy: boolean
  readonly onChange: (enabled: boolean) => void
}): ReactNode {
  const locked = row.readOnlyReason !== undefined || row.entryId === undefined
  return (
    <Switch
      checked={row.enabled}
      label={t('partToggle', { name: row.rowId })}
      disabled={busy || locked}
      {...row.readOnlyReason === undefined ? {} : { title: managementText({ code: row.readOnlyReason }, t) }}
      onChange={onChange}
    />
  )
}

/** What a row's state line says: off, or the phase its fiber is in. */
function rowStateText(row: PackageRow, t: Translate): string {
  if (!row.enabled) return t('partOff')
  return row.phase === null ? t('rowStateIdle') : t(PHASE_KEYS[row.phase])
}

/** The dot beside a row: its fiber phase, or idle. */
function rowDotState(row: PackageRow): StateDotState {
  if (!row.enabled || row.phase === null) return 'idle'
  return PHASE_STATES[row.phase]
}

/**
 * A pack's rows as a list in the order the pack declares them: a state dot,
 * the row id, one line saying its state, a configure control for a row that
 * registered a page, and, when the pack is on, a switch. A pack like base
 * carries close to a hundred rows, so a long list gets a filter.
 */
function RowsSection({ rows, t, toggle, configure }: {
  readonly rows: readonly PackageRow[]
  readonly t: Translate
  readonly toggle?: RowToggles | undefined
  readonly configure?: RowConfigure | undefined
}): ReactNode {
  const [filter, setFilter] = useState('')
  const query = filter.trim().toLowerCase()
  const shown = query === '' ? rows : rows.filter(row => row.rowId.toLowerCase().includes(query))
  return (
    <section className={css.detailSection} data-plugin-rows>
      <div className={css.sectionHead}>
        <h4 className={css.sectionTitle}>{t('partsLabel')}</h4>
        {rows.length === 0 ? null : <span className={css.sectionCount}>{partsSummary(rows, t)}</span>}
      </div>
      {rows.length === 0 ? <p className={css.status}>{t('partsEmpty')}</p> : null}
      {rows.length > ROW_FILTER_THRESHOLD
        ? (
          <Input
            type="search"
            className={css.partsFilter}
            placeholder={t('partsFilter')}
            aria-label={t('partsFilter')}
            value={filter}
            onChange={(event) => { setFilter(event.target.value) }}
          />
        )
        : null}
      {rows.length > 0 && shown.length === 0 ? <p className={css.status}>{t('partsFilterEmpty')}</p> : null}
      {shown.length === 0
        ? null
        : (
          <ul className={css.rows}>
            {shown.map(row => (
              <li
                key={row.rowId}
                className={css.row}
                data-plugin-row={row.entryId ?? row.rowId}
                {...row.phase === 'failed' ? { 'data-state': 'failed' } : row.enabled ? {} : { 'data-state': 'off' }}
              >
                <div className={css.rowLine}>
                  <span className={css.rowIcon} aria-hidden="true"><IconCordisPluginOutline14 /></span>
                  <div className={css.rowMain}>
                    {configure?.has(row) === true
                      ? (
                        <button type="button" className={css.rowOpen} aria-label={t('configureRow', { name: row.rowId })} onClick={() => { configure.open(row) }}>
                          <span className={css.rowId}>{row.rowId}</span>
                          <IconChevronRightOutline14 className={css.rowOpenIcon} aria-hidden="true" />
                        </button>
                      )
                      : <span className={css.rowId}>{row.rowId}</span>}
                    <span className={css.rowModule}>{row.moduleName}</span>
                  </div>
                  <span className={css.rowState}>
                    <StateDot state={rowDotState(row)} size={8} />
                    {rowStateText(row, t)}
                  </span>
                  {toggle === undefined
                    ? null
                    : <RowSwitch row={row} t={t} busy={toggle.busy(row)} onChange={(enabled) => { toggle.onSetEnabled(row, enabled) }} />}
                </div>
              </li>
            ))}
          </ul>
        )}
    </section>
  )
}

/**
 * A bundle's enable switch on its card and its page: locked, saying why, for
 * one the Host protects; off and locked for one it cannot read.
 */
function EnableSwitch({ pkg, title, t, busy, onSetEnabled }: {
  readonly pkg: PackageView
  readonly title: string
  readonly t: Translate
  readonly busy: boolean
  readonly onSetEnabled: (enabled: boolean) => void
}): ReactNode {
  return (
    <Switch
      checked={pkg.enabled}
      label={t('enableToggle', { name: title })}
      disabled={busy || pkg.readOnlyReason !== undefined || (!pkg.enabled && pkg.error !== undefined)}
      {...pkg.readOnlyReason === undefined ? {} : { title: managementText({ code: pkg.readOnlyReason }, t) }}
      onChange={onSetEnabled}
    />
  )
}

/** The status one card carries: running, off, or a problem the Host reported. */
function packageStatus(pkg: PackageView): 'running' | 'disabled' | 'problem' {
  if (pkg.error !== undefined) return 'problem'
  return pkg.enabled ? 'running' : 'disabled'
}

/** The head every card shares: the pinwheel icon, the name that opens the page beside its tags, its one-liner, and what sits at the end. */
function CardHead({ title, t, onOpen, tags, description, end }: {
  readonly title: string
  readonly t: Translate
  readonly onOpen: () => void
  readonly tags?: ReactNode
  readonly description: ReactNode
  readonly end?: ReactNode
}): ReactNode {
  return (
    <div className={css.cardHead}>
      <span className={css.cardIcon} aria-hidden="true"><IconPluginPinwheelOutline16 size={20} /></span>
      <div className={css.cardMain}>
        <div className={css.titleRow}>
          <button type="button" className={`${css.cardTitle} ${css.cardOpen}`} aria-label={t('openDetail', { name: title })} onClick={onOpen}>{title}</button>
          {tags}
        </div>
        {description === undefined ? null : <span className={css.cardDesc}>{description}</span>}
      </div>
      {end === undefined ? null : <div className={css.cardEnd}>{end}</div>}
    </div>
  )
}

/** The top every page shares: the crumb that leads back, then the icon with the page's actions at its right. */
function DetailTop({ crumbLabel, crumbText, onBack, icon, actions }: {
  readonly crumbLabel: string
  readonly crumbText: string
  readonly onBack: () => void
  readonly icon?: ReactNode
  readonly actions?: ReactNode
}): ReactNode {
  // The mark sits on the head row the detail views share (crumb over the
  // icon/actions row), not on the detail container: marking the container would
  // drag the window over its text and form labels wherever no control covers
  // them.
  return (
    <div className={css.detailTop} data-window-drag>
      <button type="button" className={css.crumb} aria-label={crumbLabel} onClick={onBack}>
        <IconChevronDownOutline14 className={css.crumbIcon} aria-hidden="true" />
        <span>{crumbText}</span>
      </button>
      <div className={css.detailHead}>
        <span className={css.cardIcon} aria-hidden="true">{icon ?? <IconPluginPinwheelOutline16 size={20} />}</span>
        {actions}
      </div>
    </div>
  )
}

/** One package as a card that opens its page: its name, its one-liner, its tags, and its bundle switch. */
function PackageCard({ pkg, t, resolveText, busy, highlighted, onOpen, onSetEnabled }: {
  readonly pkg: PackageView
  readonly t: Translate
  readonly resolveText: PluginManagerFace['resolveText']
  readonly busy: boolean
  readonly highlighted: boolean
  readonly onOpen: () => void
  readonly onSetEnabled: (enabled: boolean) => void
}): ReactNode {
  const { title, description, beta } = packageText(pkg, t, resolveText)
  const status = packageStatus(pkg)
  return (
    <li
      className={`${css.card} ${css.cardLink}`}
      data-plugin-package={pkg.name}
      data-plugin-status={status}
      {...highlighted ? { 'data-plugin-highlight': '' } : {}}
    >
      <CardHead
        title={title}
        t={t}
        onOpen={onOpen}
        tags={(
          <>
            {beta ? <Tag className={css.statusTag} tone="info">{t('statusBeta')}</Tag> : null}
            {status === 'problem' ? <Tag className={css.statusTag} tone="danger">{t('statusProblem')}</Tag> : null}
            {pkg.audience === 'both'
              ? null
              : <Tag className={css.statusTag} tone="neutral">{t(pkg.audience === 'coding' ? 'audienceTagCoding' : 'audienceTagGeneral')}</Tag>}
          </>
        )}
        description={description}
        end={<EnableSwitch pkg={pkg} title={title} t={t} busy={busy} onSetEnabled={onSetEnabled} />}
      />
    </li>
  )
}

/**
 * One official plugin as a card that opens its page: its icon, its title from
 * the registration, and the one-liner the entry renders in its summary view.
 */
function ItemCard({ item, t, onOpen, renderSlot }: {
  readonly item: OfficialItem
  readonly t: Translate
  readonly onOpen: () => void
  readonly renderSlot: RenderConfig
}): ReactNode {
  return (
    <li className={`${css.card} ${css.cardLink}`} data-plugin-item={item.id}>
      <CardHead title={item.label} t={t} onOpen={onOpen} description={renderSlot('plugins.item', { view: 'summary' }, { only: item.id })} />
    </li>
  )
}

/** An official plugin's page: the crumb back to the cards, its icon, its title over its one-liner, and the form the entry renders. */
function ItemDetail({ item, t, onBack, renderSlot, form }: {
  readonly item: OfficialItem
  readonly t: Translate
  readonly onBack: () => void
  readonly renderSlot: RenderConfig
  readonly form: ConfigPageForm | undefined
}): ReactNode {
  return (
    <div className={css.detail} data-plugin-item-detail={item.id}>
      <DetailTop crumbLabel={t('backToList')} crumbText={t('crumbRoot')} onBack={onBack} />
      <div className={css.detailMain}>
        <div className={css.titleRow}>
          <h3 className={css.detailTitle}>{item.label}</h3>
        </div>
        <p className={css.detailDesc}>{renderSlot('plugins.item', { view: 'summary' }, { only: item.id })}</p>
      </div>
      <div className={css.detailSections} data-plugin-config>
        {renderSlot('plugins.item', { view: 'page', form }, { only: item.id })}
      </div>
    </div>
  )
}

/**
 * A row's configuration page: the crumb back to its bundle's page, the row id
 * over the module it names and the entry's one-liner, and the form the entry renders.
 */
function RowDetail({ pkg, row, t, resolveText, onBack, renderSlot, form }: {
  readonly pkg: PackageView
  readonly t: Translate
  readonly resolveText: PluginManagerFace['resolveText']
  readonly row: PackageRow
  readonly onBack: () => void
  readonly renderSlot: RenderConfig
  readonly form: ConfigPageForm | undefined
}): ReactNode {
  const { title } = packageText(pkg, t, resolveText)
  const key = rowConfigKey(pkg.name, row.rowId)
  return (
    <div className={css.detail} data-plugin-row-detail={key}>
      <DetailTop crumbLabel={t('backToPackage', { name: title })} crumbText={title} onBack={onBack} icon={<IconCordisPluginOutline14 size={20} />} />
      <div className={css.detailMain}>
        <div className={css.titleRow}>
          <h3 className={css.detailTitle}>{row.rowId}</h3>
        </div>
        <p className={css.detailName}><code>{row.moduleName}</code></p>
        <p className={css.detailDesc}>{renderSlot('plugins.row.config', { view: 'summary' }, { entryKey: key })}</p>
      </div>
      <div className={css.detailSections} data-plugin-config>
        {renderSlot('plugins.row.config', { view: 'page', form }, { entryKey: key })}
      </div>
    </div>
  )
}

/**
 * Where a bundle comes from: the spec that installs it elsewhere, or built in
 * for one whose loaded copy the installation supplies, and its version. A
 * selected bundle that neither the profile nor the installation holds has no
 * section.
 */
function SourceSection({ pkg, t }: { readonly pkg: PackageView; readonly t: Translate }): ReactNode {
  if (pkg.source === undefined && !pkg.installed && !pkg.optional) return null
  return (
    <section className={css.detailSection} data-plugin-source>
      <h4 className={css.sectionTitle}>{t('sourceTitle')}</h4>
      <dl className={css.facts}>
        <div>
          <dt>{t('sourceSpec')}</dt>
          <dd>{pkg.source === undefined ? t('sourceBuiltIn') : <code>{pkg.source}</code>}</dd>
        </div>
        {pkg.version === undefined
          ? null
          : (
            <div>
              <dt>{t('sourceVersion')}</dt>
              <dd>{pkg.version}</dd>
            </div>
          )}
      </dl>
    </section>
  )
}

/**
 * One package's page: the crumb back to the list; its icon with its switch
 * and, for a package the profile installed, uninstall; its title beside its
 * version tag, its beta tag, and its problem tag; the package name the title
 * stands for, which is what installs it elsewhere; its one-liner; the Host's
 * problem when it reports one; the configuration the bundle registered for
 * itself; its rows with their switches and configure controls; and where it
 * comes from.
 */
function PackageDetail({
  pkg, t, resolveText, busy, rowBusy, configured, configure, renderSlot,
  onBack, onSetEnabled, onUninstall, onSetRowEnabled, onSetAudience,
}: {
  readonly pkg: PackageView
  readonly t: Translate
  readonly resolveText: PluginManagerFace['resolveText']
  readonly busy: boolean
  /** Whether a row has a write in flight. */
  readonly rowBusy: (row: PackageRow) => boolean
  /** Whether the bundle registered a configuration of its own. */
  readonly configured: boolean
  readonly configure: RowConfigure
  readonly renderSlot: RenderConfig
  readonly onBack: () => void
  readonly onSetEnabled: (enabled: boolean) => void
  readonly onUninstall: () => void
  readonly onSetRowEnabled: (row: PackageRow, enabled: boolean) => void
  readonly onSetAudience: (audience: PluginAudience) => void
}): ReactNode {
  const { title, description, beta } = packageText(pkg, t, resolveText)
  const status = packageStatus(pkg)
  const audienceId = useId()
  return (
    <div className={css.detail} data-plugin-detail={pkg.name}>
      <DetailTop
        crumbLabel={t('backToList')}
        crumbText={t('crumbRoot')}
        onBack={onBack}
        actions={(
          <div className={css.detailActions}>
            {pkg.installed
              ? (
                <Button
                  variant="outline"
                  size="sm"
                  className={css.danger}
                  icon={<IconTrashOutline16 size={13} />}
                  aria-label={t('uninstallLabel', { name: title })}
                  disabled={busy || pkg.readOnlyReason !== undefined}
                  onClick={onUninstall}
                >
                  {t('uninstall')}
                </Button>
              )
              : null}
            <EnableSwitch pkg={pkg} title={title} t={t} busy={busy} onSetEnabled={onSetEnabled} />
          </div>
        )}
      />
      <div className={css.detailMain}>
        <div className={css.titleRow}>
          <h3 className={css.detailTitle}>{title}</h3>
          {pkg.version === undefined ? null : <Tag className={css.versionTag} tone="neutral">{t('versionTag', { version: pkg.version })}</Tag>}
          {beta ? <Tag className={css.statusTag} tone="info">{t('statusBeta')}</Tag> : null}
          {status === 'problem' ? <Tag className={css.statusTag} tone="danger">{t('statusProblem')}</Tag> : null}
        </div>
        <p className={css.detailName}><code data-plugin-name>{pkg.name}</code></p>
        <p className={css.detailDesc}>{description ?? t('noDescription')}</p>
      </div>
      {pkg.error === undefined ? null : <p className={css.reason} role="status">{t('reasonLabel')}: {managementText(pkg.error, t)}</p>}
      {pkg.readOnlyReason === undefined ? null : <p className={css.reason} role="status">{managementText({ code: pkg.readOnlyReason }, t)}</p>}
      <fieldset className={css.audience} data-plugin-audience aria-label={t('audienceLabel')}>
        <legend className={css.audienceLegend}>{t('audienceLabel')}</legend>
        {AUDIENCES.map((audience) => {
          const checked = pkg.audience === audience
          return (
            <label key={audience} className={css.audienceOption} data-checked={checked}>
              <input
                type="radio"
                name={audienceId}
                checked={checked}
                disabled={busy || pkg.readOnlyReason !== undefined}
                {...pkg.readOnlyReason === undefined ? {} : { title: managementText({ code: pkg.readOnlyReason }, t) }}
                onChange={() => { onSetAudience(audience) }}
              />
              <span>{t(audience === 'coding' ? 'audienceCoding' : audience === 'general' ? 'audienceGeneral' : 'audienceBoth')}</span>
            </label>
          )
        })}
        <span className={css.audienceHint}>{t('audienceHint')}</span>
      </fieldset>
      <div className={css.detailSections}>
        {configured
          ? (
            <section className={css.detailSection} data-plugin-config>
              {renderSlot('plugins.bundle.config', { view: 'page' }, { entryKey: pkg.name })}
            </section>
          )
          : null}
        <RowsSection
          rows={pkg.rows}
          t={t}
          toggle={pkg.enabled ? { busy: row => busy || rowBusy(row), onSetEnabled: onSetRowEnabled } : undefined}
          configure={configure}
        />
        <SourceSection pkg={pkg} t={t} />
      </div>
    </div>
  )
}

/** Output lines an install run's terminal shows before its middle folds: the first and last six of a long pnpm log. */
const INSTALL_TERMINAL_LINES = 12

/** The install terminal's display copy, from the tab's dictionary. */
function terminalLabels(t: Translate): TerminalBlockLabels {
  return {
    /* v8 ignore next -- the Host reports a killed pnpm as a null exit code, never a signal name; the label interface needs one */
    signal: signal => t('terminalSignal', { signal }),
    exitCode: code => t('terminalExitCode', { code: String(code) }),
    noExitCode: t('terminalNoExitCode'),
    running: t('terminalRunning'),
    failed: t('terminalFailed'),
    done: t('terminalDone'),
    copy: t('terminalCopy'),
    copied: t('terminalCopied'),
    noOutput: t('terminalNoOutput'),
    collapseAria: t('terminalCollapseAria'),
    collapse: t('terminalCollapse'),
    expandAria: hidden => t('terminalExpandAria', { n: String(hidden) }),
    expand: hidden => t('terminalExpand', { n: String(hidden) }),
  }
}

/** The sentence under the field for a spec the check refused. */
const INPUT_PROBLEM_KEYS = {
  'invalid-spec': 'installProblemInvalid',
  'already-installed': 'installProblemInstalled',
  'not-found': 'installProblemNotFound',
  'not-a-package': 'installProblemNotPackage',
  'not-a-bundle': 'installProblemNotBundle',
  'network': 'installProblemNetwork',
  'unknown': 'installProblemUnknown',
  'shipped': 'installProblemShipped',
} satisfies Record<InstallInputError['problem'], PluginManagerLocaleKey>

/** One row of the install guide: a spec form's title, its example, and where the person finds it. */
interface GuideExample {
  readonly key: string
  readonly titleKey: PluginManagerLocaleKey
  readonly exampleKey: PluginManagerLocaleKey
  readonly hintKey: PluginManagerLocaleKey
}

/** The spec form the install guide shows, with an example the person can drop into the field. */
const GUIDE_EXAMPLES = [
  { key: 'id', titleKey: 'installGuideIdTitle', exampleKey: 'installGuideIdExample', hintKey: 'installGuideIdHint' },
] as const satisfies readonly GuideExample[]

/** The one-line reading of a classified pnpm failure. */
const FAILURE_KIND_KEYS = {
  'pnpm-missing': 'installFailurePnpmMissing',
  'timeout': 'installFailureTimeout',
  'not-found': 'installFailureNotFound',
  'no-matching-version': 'installFailureNoMatchingVersion',
  'network': 'installFailureNetwork',
  'disk-full': 'installFailureDiskFull',
  'permission': 'installFailurePermission',
  'build-blocked': 'installFailureBuildBlocked',
  'integrity': 'installFailureIntegrity',
  'unknown': 'installFailureGeneric',
} satisfies Record<PluginInstallFailureKind, PluginManagerLocaleKey>

/** The heading of each screen past the spec. */
const SCREEN_TITLE_KEYS = {
  starting: 'installStarting',
  running: 'installingTitle',
  cancelling: 'installCancelling',
  applying: 'installApplying',
  done: 'installedTitle',
  failed: 'installFailedTitle',
} satisfies Record<Exclude<InstallState['phase'], 'idle' | 'checking'>, PluginManagerLocaleKey>

/** What the spec's kind reads as when the package carries no description of its own. */
const SUBJECT_KIND_KEYS = {
  registry: undefined,
  path: 'installSubjectPath',
  git: 'installSubjectGit',
  tarball: 'installSubjectTarball',
} satisfies Record<InstallSubject['kind'], PluginManagerLocaleKey | undefined>

/** The registries asked, by name, in the dictionary's list form. */
function registryList(registries: readonly Registry[], t: Translate, resolved: string | null): string {
  return registries.map(registry => registryText(registry, t, resolved).name).join(t('registryListSeparator'))
}

/** An option's label: the registry's name with the host it names, unless the host is the name. */
function registryOption(registry: Registry, t: Translate, resolved: string | null): string {
  const { name, host } = registryText(registry, t, resolved)
  return name === host ? name : t('registryWithHost', { name, host })
}

/**
 * The failed screen's one line: a pnpm failure by its kind, a refusal by its
 * code, any other failure in the Host's words; the run's output stays behind the details.
 * A run the Host laid at the spec's own host says so; one it laid at a registry
 * names every registry asked when there were several.
 */
function failureText(
  failure: InstallState['failure'], t: Translate, install?: Pick<InstallState, 'attempts' | 'subject' | 'registries'>,
): string {
  if (failure === null) return t('installFailureGeneric')
  // A compatibility refusal is the package's own answer, whatever pnpm's exit classified the run as.
  if (failure.code === 'incompatible-version') {
    return managementText({ code: failure.code, ...failure.incompatible === undefined ? {} : { incompatible: failure.incompatible } }, t)
  }
  // Blocked scripts the Host could not name leave the person to allow them in the profile's pnpm settings by hand.
  if (failure.kind === 'build-blocked' && !failure.pendingBuilds?.length) return t('installFailureBuildBlockedManual')
  const host = install?.subject?.host
  if (failure.failedAt === 'spec-host' && host !== undefined) return t('installFailureNetworkHost', { host })
  const asked = install?.attempts?.registries ?? []
  if (failure.failedAt === 'registry' && (failure.kind === 'network' || failure.kind === 'timeout') && asked.length > 1) {
    return t('installFailureNetworkAll', { registries: registryList(asked, t, install?.registries?.resolved ?? null) })
  }
  if (failure.kind !== undefined) return t(FAILURE_KIND_KEYS[failure.kind])
  if (failure.code !== undefined) return managementText({ code: failure.code, diagnostic: failure.reason }, t)
  return failure.reason === '' ? t('installFailureGeneric') : failure.reason
}

/** The package the install is about: its name, one-liner, and version, as the Host read them before installing. */
function SubjectCard({ subject, t }: { readonly subject: InstallSubject; readonly t: Translate }): ReactNode {
  const title = subject.name ?? subject.spec
  const kindKey = SUBJECT_KIND_KEYS[subject.kind]
  const description = subject.description ?? (kindKey === undefined ? undefined : t(kindKey))
  return (
    <div className={css.subject} data-install-subject={subject.spec}>
      <p className={css.subjectName}>{title}</p>
      {description === undefined ? null : <p className={css.subjectDesc}>{description}</p>}
      {subject.version === undefined ? null : <p className={css.subjectMeta}>{t('installVersion', { version: subject.version })}</p>}
    </div>
  )
}

/**
 * The install dialog: the spec and its check, then the installing, installed,
 * and failed screens over the same subject card. A failed run that left
 * install scripts undecided shows them for approval in place of plain retry.
 */
function InstallDialog({
  install, t, onClose, onEditSpec, onRun, onCancel, onCancelAndClose, onToggleDetails, onEnableNow, onApproveBuilds,
  onToggleRegistry, onChooseRegistry, onChangeRegistry, onUseGithubMirror, onChooseAudience,
}: {
  readonly install: InstallState
  readonly t: Translate
  readonly onClose: () => void
  readonly onEditSpec: (text: string) => void
  readonly onRun: () => void
  readonly onCancel: () => void
  /** The close control while the Host runs the install: stop the run, then close. */
  readonly onCancelAndClose: () => void
  readonly onToggleDetails: () => void
  readonly onEnableNow: () => void
  readonly onApproveBuilds: () => void
  readonly onToggleRegistry: () => void
  readonly onChooseRegistry: (choice: RegistryChoice) => void
  /** From the failed screen: back to the spec with the registry options unfolded. */
  readonly onChangeRegistry: () => void
  readonly onUseGithubMirror: () => void
  readonly onChooseAudience: (audience: PluginAudience) => void
}): ReactNode {
  const errorId = useId()
  const guideId = useId()
  const approvalId = useId()
  const registryId = useId()
  const registryErrorId = useId()
  const audienceId = useId()
  const [guideOpen, setGuideOpen] = useState(false)
  const { phase } = install
  if (phase === 'idle' || phase === 'checking') {
    const checking = phase === 'checking'
    const empty = install.spec.trim() === ''
    const choice = install.registry
    const resolved = install.registries?.resolved ?? null
    const chosenTitle = choice.kind === 'custom' ? t('registryCustom') : registryText(choice.registry, t, resolved).name
    const inputProblem = install.inputError
    // A check no registry answered names every registry asked; any other refusal reads by its problem.
    const askedByCheck = inputProblem?.registries ?? []
    const inputSentence = inputProblem === null
      ? null
      : inputProblem.problem === 'network' && askedByCheck.length > 1
        ? t('installProblemNetworkAll', { registries: registryList(askedByCheck, t, resolved) })
        : t(INPUT_PROBLEM_KEYS[inputProblem.problem], { reason: inputProblem.reason })
    const registryShown = install.registryOpen && !checking
    return (
      <Modal
        open={install.open}
        onClose={onClose}
        title={t('installTitle')}
        closeLabel={t('close')}
        {...install.mirrorRecovery === true ? {} : { description: t('installDescription') }}
        className={css.installDialog as string}
        footer={(
          <Button variant="primary" className={css.wide} disabled={checking || empty} aria-busy={checking} onClick={onRun}>
            {checking ? <span className={css.spinner} aria-hidden="true" /> : null}
            {t(checking ? 'installChecking' : 'installRun')}
          </Button>
        )}
      >
        <div className={css.installBody}>
          <label className={css.installField}>
            <span>{t(install.mirrorRecovery === true ? 'installPackageLabel' : 'installSpecLabel')}</span>
            <input
              type="text"
              autoFocus={install.mirrorRecovery === true}
              value={install.spec}
              placeholder={t('installSpecPlaceholder')}
              disabled={checking}
              aria-invalid={install.inputError !== null}
              aria-describedby={install.inputError === null ? undefined : errorId}
              onChange={(event) => { onEditSpec(event.currentTarget.value) }}
              onKeyDown={(event) => { if (event.key === 'Enter' && !empty && !checking) onRun() }}
            />
          </label>
          {inputSentence === null
            ? null
            : <p id={errorId} className={css.inputError} role="alert">{inputSentence}</p>}
          <fieldset className={css.audience} data-install-audience aria-label={t('audienceLabel')}>
            <legend className={css.audienceLegend}>{t('audienceLabel')}</legend>
            {AUDIENCES.map((audience) => {
              const checked = install.audience === audience
              return (
                <label key={audience} className={css.audienceOption} data-checked={checked}>
                  <input
                    type="radio"
                    name={audienceId}
                    checked={checked}
                    disabled={checking}
                    onChange={() => { onChooseAudience(audience) }}
                  />
                  <span>{t(audience === 'coding' ? 'audienceCoding' : audience === 'general' ? 'audienceGeneral' : 'audienceBoth')}</span>
                </label>
              )
            })}
            <span className={css.audienceHint}>{t('audienceHint')}</span>
          </fieldset>
          <div className={css.optionsRow}>
            <button
              type="button"
              className={css.registryToggle}
              aria-expanded={install.registryOpen}
              aria-controls={registryId}
              disabled={checking}
              onClick={onToggleRegistry}
            >
              <span>{t('registryToggle')}</span>
              {' '}
              <span className={css.registryChosen}>{chosenTitle}</span>
              <IconChevronDownOutline14 className={css.guideChevron} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={css.guideToggle}
              aria-expanded={guideOpen}
              aria-controls={guideId}
              onClick={() => { setGuideOpen(open => !open) }}
            >
              <IconChevronDownOutline14 className={css.guideChevron} aria-hidden="true" />
              <span>{t(guideOpen ? 'installGuideHide' : 'installGuideToggle')}</span>
            </button>
          </div>
          {registryShown
            ? (
              <fieldset id={registryId} className={css.registry} data-install-registry aria-label={t('registryLegend')}>
                {offeredRegistries(install.registries).map((registry) => {
                  const checked = choice.kind === 'offered' && choice.registry === registry
                  return (
                    <label key={registry ?? ''} className={css.registryOption} data-checked={checked}>
                      <input type="radio" name={registryId} checked={checked} onChange={() => { onChooseRegistry({ kind: 'offered', registry }) }} />
                      <span className={css.registryTitle}><span>{registryOption(registry, t, resolved)}</span></span>
                    </label>
                  )
                })}
                <div className={css.registryOption} data-checked={choice.kind === 'custom'}>
                  <label className={css.registryCustomPick}>
                    <input
                      type="radio"
                      name={registryId}
                      checked={choice.kind === 'custom'}
                      onChange={() => { onChooseRegistry({ kind: 'custom', url: '' }) }}
                    />
                    <span className={css.registryTitle}><span>{t('registryCustom')}</span></span>
                  </label>
                  <input
                    type="text"
                    className={css.registryCustomField}
                    aria-label={t('registryCustom')}
                    placeholder={t('registryCustomPlaceholder')}
                    value={choice.kind === 'custom' ? choice.url : ''}
                    disabled={choice.kind !== 'custom'}
                    aria-invalid={install.registryError}
                    aria-describedby={install.registryError ? registryErrorId : undefined}
                    onChange={(event) => { onChooseRegistry({ kind: 'custom', url: event.currentTarget.value }) }}
                    onKeyDown={(event) => { if (event.key === 'Enter' && !empty) onRun() }}
                  />
                  {install.registryError
                    ? <p id={registryErrorId} className={css.inputError} role="alert">{t('registryCustomInvalid')}</p>
                    : null}
                  <span className={css.registryHint}>{t('registryCustomHint')}</span>
                </div>
              </fieldset>
            )
            : null}
          {guideOpen
            ? (
              <div id={guideId} className={css.guide} data-install-guide>
                <p className={css.guideIntro}>{t('installGuideIntro')}</p>
                <p className={css.guideNote}>{t('installGuideIdNote')}</p>
                <ol className={css.guideList}>
                  {GUIDE_EXAMPLES.map(({ key, titleKey, exampleKey, hintKey }, index) => (
                    <li key={key} className={css.guideItem}>
                      <span className={css.guideIndex} aria-hidden="true">{index + 1}</span>
                      <div className={css.guideMain}>
                        <span className={css.guideTitle}>{t(titleKey)}</span>
                        <span className={css.guideExample}>
                          <span className={css.guideExampleLabel}>{t('installGuideExampleLabel')}</span>
                          <code>{t(exampleKey)}</code>
                        </span>
                        <span className={css.guideHint}>{t(hintKey)}</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={t('installGuideFillAria', { example: t(exampleKey) })}
                        disabled={checking}
                        onClick={() => { onEditSpec(t(exampleKey)) }}
                      >
                        {t('installGuideFill')}
                      </Button>
                    </li>
                  ))}
                </ol>
                <p className={css.guideSafety} role="note">
                  <IconWarningOutline16 size={14} aria-hidden="true" />
                  <span>{t('installGuideSafety')}</span>
                </p>
              </div>
            )
            : null}
        </div>
      </Modal>
    )
  }
  const heading = t(SCREEN_TITLE_KEYS[phase])
  const pending = isInstallPending(phase)
  // Only a run the Host acknowledged can be stopped; before that, and while it stops or applies, the controls wait.
  const stoppable = phase === 'running' || phase === 'failed'
  const unconfirmed = install.failure?.cancelUnconfirmed === true ? install.failure.reason : undefined
  const pendingBuilds = phase === 'failed' ? install.failure?.pendingBuilds ?? [] : []
  const approvable = pendingBuilds.length > 0
  const firstRun = install.runs[0]
  // The registries the Host asked, once there is more than one: the attempt under way while it runs, a badge on each run.
  const asked = install.attempts !== null && install.attempts.registries.length > 1 ? install.attempts : null
  const current = asked === null ? undefined : asked.registries.at(-1)
  const previous = asked === null ? undefined : asked.registries.at(-2)
  const registryResolved = install.registries?.resolved ?? null
  const attemptLine = pending && asked !== null && current !== undefined && previous !== undefined
    ? t('installAttempt', {
      previous: registryText(previous, t, registryResolved).name, registry: registryText(current, t, registryResolved).name,
      index: String(asked.registries.length), total: String(asked.total),
    })
    : null
  // Another registry is worth offering only for a failure the Host laid at the one it asked.
  const changeable = phase === 'failed' && !approvable && install.failure?.failedAt === 'registry'
  // A confirmed GitHub connection failure offers the configured mainland mirror instead of a plain retry.
  const mirror = githubRecoveryRegistry(install)
  const mirrorOffered = mirror !== undefined
  return (
    <Modal open={install.open} onClose={onClose} title={heading} headless className={css.installDialog as string}>
      <div className={css.wizard} data-install-phase={phase}>
        <div className={css.wizardHead}>
          {phase === 'done'
            ? <span />
            : (
              <button type="button" className={css.wizardBack} aria-label={t('installEditAria')} disabled={!stoppable} onClick={onCancel}>
                <IconChevronLeftOutline14 aria-hidden="true" />
                <span>{t('installEdit')}</span>
              </button>
            )}
          <button
            type="button"
            className={css.wizardClose}
            aria-label={t(phase === 'running' ? 'installCloseCancels' : 'close')}
            disabled={pending && phase !== 'running'}
            onClick={phase === 'running' ? onCancelAndClose : onClose}
          >
            <IconCloseOutline16 size={14} />
          </button>
        </div>
        <div className={css.wizardScroll}>
          <div className={css.wizardHero}>
            <span className={css.wizardIcon} data-tone={pending ? 'pending' : phase} aria-hidden="true">
              {pending
                ? <span className={css.spinnerLarge} />
                : phase === 'done' ? <IconCheckOutline16 size={28} /> : <IconWarningOutline16 size={28} />}
            </span>
            <h2 className={css.wizardTitle} role={phase === 'failed' ? 'alert' : 'status'}>{heading}</h2>
            {phase === 'failed' ? <p className={css.wizardSub}>{failureText(install.failure, t, install)}</p> : null}
            {attemptLine === null ? null : <p className={css.attemptLine} role="status">{attemptLine}</p>}
            {unconfirmed === undefined ? null : <p className={css.wizardSub} role="alert">{t('installCancelUnconfirmed', { reason: unconfirmed })}</p>}
          </div>
          {install.subject === null ? null : <SubjectCard subject={install.subject} t={t} />}
          {approvable
            ? (
              <section className={css.approval} role="group" aria-labelledby={approvalId} data-install-approval>
                <h3 id={approvalId} className={css.approvalTitle}>{t('installApprovalTitle')}</h3>
                <p className={css.approvalText}>{t('installApprovalDescription')}</p>
                <ul className={css.approvalList}>
                  {pendingBuilds.map(name => <li key={name}><code>{name}</code></li>)}
                </ul>
                <p className={css.approvalText}>{t('installApprovalConsequence')}</p>
                <p className={css.approvalCaution}>{t('installApprovalCaution')}</p>
                <Button variant="primary" className={css.wide} onClick={onApproveBuilds}>{t('installApproveAndRetry')}</Button>
              </section>
            )
            : null}
          {phase === 'done' && install.installed === null
            ? <p className={css.result} role="status">{t('installDoneNothing')}</p>
            : null}
          {phase === 'done' && install.restartRequired
            ? <p className={css.resultWarn} role="status">{t('installDoneRestart')}</p>
            : null}
          {phase === 'done' && install.subject?.kind === 'registry' && install.subject.version !== undefined
            && install.installedVersion !== null && install.installedVersion !== install.subject.version
            ? (
              <p className={css.resultWarn} role="status">
                {t('installDoneOtherVersion', {
                  installed: install.installedVersion, version: install.subject.version,
                  exact: `${install.subject.name ?? install.subject.spec}@${install.subject.version}`,
                })}
              </p>
            )
            : null}
          {phase === 'done' && install.approvedBuilds.length > 0
            ? <p className={css.result} role="status">{t('installDoneApproved', { names: install.approvedBuilds.join(', ') })}</p>
            : null}
          <div className={css.wizardFoot}>
            <button type="button" className={css.detailsToggle} aria-expanded={install.detailsOpen} onClick={onToggleDetails}>
              <span>{t(install.detailsOpen ? 'installDetailsHide' : 'installDetailsShow')}</span>
              <IconChevronDownOutline14 className={css.detailsChevron} aria-hidden="true" />
            </button>
            {pending
              ? (
                <Button variant="outline" size="sm" disabled={phase !== 'running'} onClick={onCancel}>
                  {t(phase === 'cancelling' ? 'installCancelling' : 'installCancel')}
                </Button>
              )
              : null}
            {changeable
              ? <Button variant="outline" size="sm" className={css.footAction} onClick={onChangeRegistry}>{t('installChangeRegistry')}</Button>
              : null}
            {mirrorOffered
              ? (
                <Button variant={asksMirror(install) ? 'outline' : 'primary'} size="sm" className={css.footAction} onClick={onUseGithubMirror}>
                  {t(asksMirror(install) ? 'installTryAnotherWay' : 'installUseGithubMirror')}
                </Button>
              )
              : null}
            {phase === 'failed' && !approvable && !mirrorOffered ? <Button variant="primary" size="sm" onClick={onRun}>{t('installRetry')}</Button> : null}
          </div>
          {install.detailsOpen
            ? (
              <div className={css.detailsBody}>
                <p className={css.installLocation}>{firstRun === undefined ? t('terminalNoOutput') : t('installLocation', { dir: firstRun.cwd })}</p>
                {install.runs.map((run, index) => {
                  const askedHere = asked?.registries[index]
                  return (
                    <div key={run.jobId} className={css.run}>
                      {askedHere === undefined ? null : (
                        <p className={css.attemptBadge}>
                          {t('installAttemptBadge', { index: String(index + 1), registry: registryText(askedHere, t, registryResolved).name })}
                        </p>
                      )}
                      <TerminalBlock
                        command={run.command}
                        output={run.output}
                        running={run.exitCode === undefined}
                        exitCode={run.exitCode}
                        maxLines={INSTALL_TERMINAL_LINES}
                        labels={{ ...terminalLabels(t), ...phase === 'cancelling' ? { failed: t('installCancelledShort') } : {} }}
                        className={css.terminal}
                      />
                    </div>
                  )
                })}
              </div>
            )
            : null}
          {phase !== 'done'
            ? null
            : install.installed !== null
              ? <Button variant="primary" className={css.wide} disabled={install.enabling} aria-busy={install.enabling} onClick={onEnableNow}>{t('installEnableNow')}</Button>
              : <Button variant="primary" className={css.wide} onClick={onClose}>{t('installClose')}</Button>}
        </div>
      </div>
    </Modal>
  )
}

/** The confirmation an uninstall waits on. */
function ConfirmDialog({ confirm, t, resolveText, onConfirm, onCancel }: {
  readonly confirm: ConfirmState
  readonly t: Translate
  readonly resolveText: PluginManagerFace['resolveText']
  readonly onConfirm: () => void
  readonly onCancel: () => void
}): ReactNode {
  const { title: name } = packageText({ name: confirm.packageName }, t, resolveText)
  return (
    <Modal
      open
      onClose={onCancel}
      title={t('confirmUninstallTitle', { name })}
      closeLabel={t('close')}
      description={t('confirmUninstallDescription')}
      footer={(
        <>
          <Button variant="outline" onClick={onCancel}>{t('cancel')}</Button>
          <Button variant="primary" className={css.dangerButton} onClick={onConfirm}>
            {t('confirmUninstall')}
          </Button>
        </>
      )}
    />
  )
}

/**
 * The update check's result: every layer the registry has a newer version
 * for, each with the control that moves it, or the reason the check failed.
 */
function UpdatesPanel({ updates, t, busy, onUpdate, onDismiss }: {
  readonly updates: UpdateState
  readonly t: Translate
  readonly busy: (name: string) => boolean
  readonly onUpdate: (name: string) => void
  readonly onDismiss: () => void
}): ReactNode {
  return (
    <section className={css.panel} data-plugin-updates data-status={updates.status} aria-busy={updates.status === 'checking'}>
      <div className={css.panelHead}>
        <h3 className={css.panelTitle}>{t('updatesTitle')}</h3>
        <button type="button" className={css.iconButton} aria-label={t('updatesClose')} title={t('updatesClose')} onClick={onDismiss}>
          <span className={css.iconWrap} aria-hidden="true"><IconCloseOutline16 size={14} /></span>
        </button>
      </div>
      {updates.status === 'checking' ? <p className={css.status}>{t('updatesChecking')}</p> : null}
      {updates.status === 'failed' ? <p className={css.panelFailure} role="alert">{t('updatesFailed', { reason: updates.reason })}</p> : null}
      {updates.status === 'ready' && updates.entries.length === 0 ? <p className={css.status}>{t('updatesCurrent')}</p> : null}
      {updates.entries.length === 0
        ? null
        : (
          <ul className={css.panelList}>
            {updates.entries.map(entry => (
              <li key={entry.name} className={css.panelRow} data-plugin-update={entry.name}>
                <div className={css.panelMain}>
                  <span className={css.panelName}>{entry.name}</span>
                  <span className={css.panelMeta}>
                    {t('updatesVersions', { current: entry.currentVersion ?? t('versionUnknown'), latest: entry.latestVersion })}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy(entry.name)}
                  aria-label={t('updateLabel', { name: entry.name })}
                  onClick={() => { onUpdate(entry.name) }}
                >
                  {t('update')}
                </Button>
              </li>
            ))}
          </ul>
        )}
    </section>
  )
}

/**
 * The plugin catalog: a search over GitHub's plugin topic and the repositories
 * it answered. Each result installs through the same dialog a typed spec uses,
 * so the Host reads it and the person approves it before anything runs.
 */
function CatalogPanel({ catalog, t, busy, onSearch, onMore, onInstall }: {
  readonly catalog: CatalogState
  readonly t: Translate
  readonly busy: boolean
  readonly onSearch: (query: string) => void
  readonly onMore: () => void
  readonly onInstall: (spec: string) => void
}): ReactNode {
  const [query, setQuery] = useState('')
  return (
    <section className={css.panel} data-plugin-catalog data-status={catalog.status} aria-busy={catalog.status === 'searching'}>
      <div className={css.panelHead}>
        <h3 className={css.panelTitle}>{t('catalogTitle')}</h3>
      </div>
      <form className={css.catalogSearch} onSubmit={(event) => { event.preventDefault(); onSearch(query) }}>
        <Input
          type="search"
          className={css.catalogField}
          icon={<IconSearchOutline16 size={14} />}
          placeholder={t('catalogSearchPlaceholder')}
          aria-label={t('catalogSearchLabel')}
          value={query}
          onChange={(event) => { setQuery(event.target.value) }}
        />
        <Button variant="outline" type="submit" disabled={busy}>{t('catalogSearch')}</Button>
      </form>
      {catalog.status === 'idle' ? <p className={css.status}>{t('catalogIdle')}</p> : null}
      {catalog.status === 'searching' ? <p className={css.status}>{t('catalogSearching')}</p> : null}
      {catalog.status === 'failed' ? <p className={css.panelFailure} role="alert">{t('catalogFailed', { reason: catalog.reason })}</p> : null}
      {catalog.status === 'ready' && catalog.entries.length === 0 ? <p className={css.status}>{t('catalogEmpty')}</p> : null}
      {catalog.entries.length === 0
        ? null
        : (
          <ul className={css.panelList}>
            {catalog.entries.map(entry => (
              <li key={entry.fullName} className={css.panelRow} data-plugin-catalog-entry={entry.fullName}>
                <div className={css.panelMain}>
                  <a
                    className={css.catalogName}
                    href={entry.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t('catalogOpen', { name: entry.fullName })}
                  >
                    <span>{entry.fullName}</span>
                    <IconRightUpOutline16 size={12} aria-hidden="true" />
                  </a>
                  {entry.description === null ? null : <span className={css.panelMeta}>{entry.description}</span>}
                  <span className={css.panelMeta}>{t('catalogStars', { count: String(entry.stars) })}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  aria-label={t('catalogInstallLabel', { name: entry.fullName })}
                  onClick={() => { onInstall(entry.url) }}
                >
                  {t('catalogInstall')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      {catalog.hasMore ? <Button variant="outline" size="sm" disabled={busy} onClick={onMore}>{t('catalogMore')}</Button> : null}
    </section>
  )
}

/** Render the plugin manager: the official plugins and installed bundles, their pages, the install dialog, and the confirmation. */
export function PluginManagerPage(props: PluginManagerPageProps): ReactNode {
  const { t, ensure, renderSlot, resolveText } = props
  const state = props.usePluginManager(snapshot => snapshot)
  const ledger = props.useConfigLedger(snapshot => snapshot)
  // A contributed page that wants the shared form gets it only for a namespace the Host serves.
  const configurations = props.useConfigurations(snapshot => snapshot.view?.namespaces)
  const formFor = (id: string): ConfigPageForm | undefined => {
    if (!configurations?.some(view => view.ns === id)) return undefined
    const form = props.configForm<Record<string, unknown>>(id)
    return { state: form.getSnapshot(), mutate: (ops, expectedRevision) => form.mutate(ops, expectedRevision) }
  }
  // What is open; a package that leaves the list (uninstalled) drops back to the cards.
  const [view, setView] = useState<View>({ kind: 'list' })
  const [activation, setActivation] = useState<string | null>(null)
  useEffect(() => { ensure() }, [ensure])
  // The navigation channel's reveal: a bundle name opens its detail; a name
  // outside the managed list falls back to the cards through the lookup below.
  useEffect(() => props.registerOpen?.((name) => {
    setActivation(null)
    setView({ kind: 'package', name })
  }), [props.registerOpen])
  // A package an install just enabled: scroll it into view and mark it for a moment.
  const { highlight, clearHighlight } = { highlight: state.highlight, clearHighlight: props.clearHighlight }
  useEffect(() => {
    if (highlight === null) return
    const card = document.querySelector(`[data-plugin-package="${highlight}"]`)
    if (card !== null && typeof card.scrollIntoView === 'function') card.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const timer = setTimeout(clearHighlight, HIGHLIGHT_MS)
    return () => { clearTimeout(timer) }
  }, [highlight, clearHighlight])
  // A refresh failure announces through the shell overlay toast, so the page's
  // own toast keeps the notices about install and row actions only.
  const noticeLine = state.notice === null || state.notice.kind === 'refresh-failed'
    ? null
    : noticeText(state.notice, t)

  // The page manages what the person installed, what the installation ships for them to switch on, what a
  // profile-installed copy can upgrade in place, and a selected name the Host cannot read; the installation's
  // other bundles are inspected in the Settings Plugins section's Plugin list tab.
  const listed = state.packages.filter(pkg => !BUILTIN_PROFILE_BUNDLES.has(pkg.name)
    && (pkg.installed || pkg.optional || pkg.updatable || pkg.error !== undefined))
  const mine = listed.filter(pkg => pkg.installed || !pkg.optional)
  const official = listed.filter(pkg => pkg.optional && !pkg.installed)
  const loaded = state.status === 'ready' || state.status === 'error'
  const refreshing = state.refreshStatus === 'refreshing'
  const openPkg = view.kind === 'package' || view.kind === 'row' ? listed.find(pkg => pkg.name === view.name) : undefined
  const openItem = view.kind === 'item' ? ledger.items.find(item => item.id === view.id) : undefined
  const openRow = view.kind === 'row' && openPkg !== undefined ? openPkg.rows.find(row => row.rowId === view.rowId) : undefined
  const showsCards = openPkg === undefined && openItem === undefined
  const activated = listed.find(pkg => pkg.name === activation && pkg.enabled && !state.busy.includes(pkg.name))
  const setRowEnabled = (row: PackageRow, enabled: boolean): void => {
    /* v8 ignore next -- a row without a live entry has its switch disabled */
    if (row.entryId !== undefined) props.setRowEnabled(row.entryId, enabled)
  }
  const configure = (pkg: PackageView): RowConfigure => ({
    has: row => ledger.rows.has(rowConfigKey(pkg.name, row.rowId)),
    open: (row) => { setView({ kind: 'row', name: pkg.name, rowId: row.rowId }) },
  })
  const packageCard = (pkg: PackageView): ReactNode => (
    <PackageCard
      key={pkg.name}
      pkg={pkg}
      t={t}
      resolveText={resolveText}
      busy={state.busy.includes(pkg.name)}
      highlighted={state.highlight === pkg.name}
      onOpen={() => { setActivation(null); setView({ kind: 'package', name: pkg.name }) }}
      onSetEnabled={(enabled) => { setActivation(enabled ? pkg.name : null); props.setEnabled(pkg.name, enabled) }}
    />
  )
  // The Official group: the bundles the installation ships, then the plugins that registered their configuration.
  const officialCards = [
    ...official.map(packageCard),
    ...ledger.items.map(item => (
      <ItemCard key={`item:${item.id}`} item={item} t={t} renderSlot={renderSlot} onOpen={() => { setView({ kind: 'item', id: item.id }) }} />
    )),
  ]
  // One group of cards under its heading and count; the Official group comes first, and a group with nothing in it takes no room.
  const renderGroup = (id: 'official' | 'bundles', heading: string, cards: readonly ReactNode[]): ReactNode => cards.length === 0
    ? null
    : (
      <section className={css.group} data-plugin-scope="global" data-plugin-group={id}>
        <div className={css.groupHead}>
          <h3 className={css.groupTitle}>{heading}</h3>
          <span className={css.count} data-plugin-count={cards.length}>{cards.length}</span>
        </div>
        <ul className={css.cards}>{cards}</ul>
      </section>
    )

  return (
    <section className={css.page} data-plugin-panel aria-busy={state.status === 'loading' || refreshing}>
      {showsCards
        ? (
          <header className={css.pageHead} data-window-drag>
            <div>
              <h1 className={css.pageTitle}>{t('title')}</h1>
              <p className={css.pageIntro}>{t('intro')}</p>
            </div>
            <div className={css.toolbar}>
              <button
                type="button"
                className={css.iconButton}
                aria-label={t('checkUpdates')}
                title={t('checkUpdates')}
                disabled={!loaded || state.updates.status === 'checking'}
                onClick={props.checkUpdates}
              >
                <span className={css.iconWrap} aria-hidden="true"><IconDownloadOutline16 /></span>
              </button>
              <button
                type="button"
                className={css.iconButton}
                aria-label={t('refresh')}
                title={t('refresh')}
                aria-busy={refreshing}
                disabled={!loaded || refreshing}
                onClick={props.refresh}
              >
                <span className={css.iconWrap} aria-hidden="true">
                  {refreshing ? <StateDot state="ongoing" /> : <IconRefreshOutline16 />}
                </span>
              </button>
              <AddPluginMenu t={t} disabled={!loaded} openInstall={props.openInstall} renderSlot={renderSlot} />
            </div>
          </header>
        )
        : null}
      {state.status === 'loading' ? <p className={css.status}>{t('loading')}</p> : null}
      {state.status === 'unavailable' ? <p className={css.status} role="status">{t('unavailable')}</p> : null}
      {state.status === 'error' && !refreshing
        ? (
          <div className={css.failure}>
            <p role="alert">{t(state.refreshStatus === 'failed' ? 'refreshError' : 'error')}</p>
            <Button variant="outline" size="sm" onClick={props.refresh}>{t('retry')}</Button>
          </div>
        )
        : null}
      {loaded && showsCards && state.updates.status !== 'idle'
        ? (
          <UpdatesPanel
            updates={state.updates}
            t={t}
            busy={name => state.busy.includes(name)}
            onUpdate={props.updatePackage}
            onDismiss={props.dismissUpdates}
          />
        )
        : null}
      {state.notice === null || noticeLine === null
        ? null
        : (
          <Toast
            key={state.notice.seq}
            text={noticeLine}
            icon={<IconWarningOutline16 />}
            holdMs={toastHoldMs(noticeLine)}
            onDone={props.dismissNotice}
          />
        )}
      {loaded && openPkg !== undefined && openRow !== undefined
        ? (
          <RowDetail
            pkg={openPkg}
            row={openRow}
            t={t}
            resolveText={resolveText}
            renderSlot={renderSlot}
            form={formFor(rowConfigKey(openPkg.name, openRow.rowId))}
            onBack={() => { setView({ kind: 'package', name: openPkg.name }) }}
          />
        )
        : null}
      {loaded && openPkg !== undefined && openRow === undefined
        ? (
          <PackageDetail
            pkg={openPkg}
            t={t}
            resolveText={resolveText}
            busy={state.busy.includes(openPkg.name)}
            rowBusy={row => row.entryId !== undefined && state.busy.includes(rowKey(row.entryId))}
            configured={ledger.bundles.has(openPkg.name)}
            configure={configure(openPkg)}
            renderSlot={renderSlot}
            onBack={() => { setView({ kind: 'list' }) }}
            onSetEnabled={(enabled) => { props.setEnabled(openPkg.name, enabled) }}
            onUninstall={() => { props.uninstall(openPkg.name) }}
            onSetAudience={(audience) => { props.setAudience(openPkg.name, audience) }}
            onSetRowEnabled={setRowEnabled}
          />
        )
        : null}
      {loaded && openItem !== undefined
        ? <ItemDetail item={openItem} t={t} renderSlot={renderSlot} form={formFor(openItem.id)} onBack={() => { setView({ kind: 'list' }) }} />
        : null}
      {loaded && showsCards
        ? officialCards.length === 0 && mine.length === 0
          ? <p className={css.empty}>{t('empty')}</p>
          : (
            <>
              {renderGroup('official', t('officialTitle'), officialCards)}
              {renderGroup('bundles', t('bundlesTitle'), mine.map(packageCard))}
            </>
          )
        : null}
      {loaded && showsCards
        ? (
          <CatalogPanel
            catalog={state.catalog}
            t={t}
            busy={state.catalog.status === 'searching'}
            onSearch={(query) => { props.catalog(query, 1) }}
            onMore={() => { props.catalog(state.catalog.query, state.catalog.page + 1) }}
            onInstall={props.installCatalogSpec}
          />
        )
        : null}
      {showsCards && activated !== undefined && !state.install.open
        ? renderSlot('plugins.bundle.activation', {
          packageName: activated.name,
          onDismiss: () => { setActivation(null) },
          onOpenDetails: () => { setActivation(null); setView({ kind: 'package', name: activated.name }) },
        }, { entryKey: activated.name }) : null}
      <InstallDialog
        install={state.install}
        t={t}
        onClose={props.closeInstall}
        onEditSpec={props.editInstallSpec}
        onRun={props.runInstall}
        onCancel={props.cancelInstall}
        onCancelAndClose={props.cancelInstallAndClose}
        onToggleDetails={props.toggleInstallDetails}
        onEnableNow={props.enableInstalled}
        onApproveBuilds={props.approveBuildsAndRetry}
        onToggleRegistry={props.toggleRegistryOptions}
        onChooseRegistry={props.chooseRegistry}
        onChangeRegistry={props.changeRegistry}
        onUseGithubMirror={props.useGithubMirror}
        onChooseAudience={props.chooseAudience}
      />
      {state.confirm === null
        ? null
        : (
          <ConfirmDialog
            confirm={state.confirm}
            t={t}
            resolveText={resolveText}
            onConfirm={props.confirm}
            onCancel={props.cancelConfirm}
          />
        )}
    </section>
  )
}
