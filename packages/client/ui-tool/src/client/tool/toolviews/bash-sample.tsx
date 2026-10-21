import { useMemo, type KeyboardEvent } from 'react'
import type { Context } from '@qilin-agent/kylin'
import clsx from 'clsx'
import {
  CommandText, IconApiOutlineRegular, IconChevronDownOutlineRegular, IconInspectOutlineRegular, StateDot, TerminalBlock, TextShimmer,
} from '@qilin-agent/client-ui-primitives'
import type { PropsLocale } from '@qilin-agent/client-ui-slots'
import type { ToolCallViewProps } from '../../contract/slots.ts'
import {
  isBackgroundShellCall,
  isSettledPersistentShellCall,
  isSpilledShellCall,
  localizeTerminalCardModel,
  terminalBlockLabels,
  terminalCardModel,
  terminalExitLabel,
  terminalFailed,
} from '../models/terminal-card-model.ts'
import { formatToolBody, toolRowModel, type ToolRowState } from '../models/tool-call-model.ts'
import { CONVERSATION_NS as NS } from '../../locale.ts'
import { ExitCodeBadge } from '../components/ExitCodeBadge.tsx'
import css from './bash-sample.module.css'

type BashRowProps = ToolCallViewProps & PropsLocale<'conversation'>

const BASH_ICON = <IconApiOutlineRegular size={14} />

function leadingFor(state: ToolRowState) {
  switch (state) {
    case 'error': return <StateDot state="error" />
    case 'stopped': return <StateDot state="warning" />
    // Running keeps the icon — the shimmer carries the in-flight signal.
    default: return BASH_ICON
  }
}

/** Visually hidden status — StateDot is aria-hidden; AT needs a text label. */
function stateStatus(state: ToolRowState, t: BashRowProps['t']): string | null {
  switch (state) {
    case 'preparing': return t('row.preparing')
    case 'running': return t('bash.running')
    case 'error': return t('bash.failed')
    case 'stopped': return t('bash.stopped')
    default: return null
  }
}

/**
 * Render expandable Bash output with an accessible lifecycle label. While the
 * call is preparing the row shows the tool name and cannot expand.
 * @param props - tool call, Session sources, locale, and inspection callback.
 * @returns the Bash output row.
 */
export function BashRow({ toolName, block, sessionId, useSessions, inspect, useDisclosure, t }: BashRowProps) {
  const model = toolRowModel(toolName, block)
  // An omitted shell workdir is the session workspace; relative values resolve
  // against it before reaching the terminal primitive.
  const cwd = useSessions(list => list.byId[sessionId]?.cwd)
  const terminalModel = terminalCardModel(block, cwd)
  const terminal = terminalModel === null ? null : localizeTerminalCardModel(terminalModel, t)
  // Exit failures are result data even when the tool call itself succeeds.
  const state = model.state === 'ok' && terminalModel !== null && terminalFailed(terminalModel)
    ? 'error'
    : model.state
  const status = stateStatus(state, t)
  // The injected disclosure state is the row's whole open state; an enclosing
  // Turn's collapse resets it.
  const { expanded, toggle: toggleExpand } = useDisclosure()
  const background = isBackgroundShellCall(block)
  // Failed or interrupted background launches retain raw input/output, as do
  // other execution failures, persistent results, and spill previews.
  const genericBody = terminal === null
    && (model.state === 'error' || isSettledPersistentShellCall(block) || isSpilledShellCall(block) || background)
    && (model.bodyRaw !== null || model.output !== null)
  const expandable = terminal !== null || genericBody
  const open = expanded && expandable
  const body = useMemo(
    () => open && genericBody && model.bodyRaw !== null
      ? formatToolBody(model.variant, model.bodyRaw)
      : null,
    [genericBody, model.bodyRaw, model.variant, open],
  )
  const normalSummary = terminal?.description ?? model.summary
  const exitLabel = terminalExitLabel(terminalModel, t)
  const failureLine = model.state === 'error' ? model.errorSummary : null
  // An interrupted call states its stop in the summary slot instead of the name;
  // a settled exit keeps its command description and states the code in a capsule.
  const settlementLine = exitLabel !== null
    ? null
    : failureLine ?? (state === 'stopped' ? t('bash.stopped') : null)
  const running = state === 'running' || state === 'preparing'
  const toggleFromKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!expandable || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    toggleExpand()
  }
  const leading = open
    ? <IconChevronDownOutlineRegular className={css.chevron} />
    : expandable
      ? (
        <>
          <span className={css.iconIdle}>{leadingFor(state)}</span>
          <IconChevronDownOutlineRegular className={clsx(css.chevron, css.chevronHover)} />
        </>
      )
      : leadingFor(state)
  return (
    <div className={css.card}>
      <div
        className={css.root}
        data-sample="bash"
        data-variant="bash"
        data-state={state}
        data-expandable={expandable || undefined}
        role={expandable ? 'button' : undefined}
        tabIndex={expandable ? 0 : undefined}
        aria-expanded={expandable ? open : undefined}
        onClick={expandable ? toggleExpand : undefined}
        onKeyDown={expandable ? toggleFromKeyboard : undefined}
      >
        <span className={css.leading}>{leading}</span>
        {status !== null && <span className={css.visuallyHidden}>{status}</span>}
        <TextShimmer active={running}>
          <TextShimmer className={css.title}>{t(model.titleKey)}</TextShimmer>
          <span className={css.sep} data-shimmer-decoration aria-hidden />
          <span className={clsx(
            css.summary,
            exitLabel === null && state === 'error' && css.errorSummary,
            exitLabel === null && state === 'stopped' && css.stoppedSummary,
          )}>
            <TextShimmer>{settlementLine ?? normalSummary}</TextShimmer>
          </span>
          {exitLabel !== null && <ExitCodeBadge label={exitLabel} />}
        </TextShimmer>
      </div>
      {open && (
        <div className={css.bodyWrap}>
          {terminal !== null
            ? (
              <TerminalBlock
                {...terminal.card}
                maxLines={Infinity}
                labels={terminalBlockLabels(t)}
                className={css.terminal}
              />
            )
            : (
              <div className={css.ioCard}>
                {body !== null && (
                  <div className={css.ioSection}>
                    <span className={css.ioLabel}>{t('row.input')}</span>
                    {background
                      ? <CommandText className={css.commandInput} text={body} label={t('row.commandArguments')} />
                      : <span className={css.ioText}>{body}</span>}
                  </div>
                )}
                {body !== null && model.output !== null && (
                  <span className={css.ioDivider} aria-hidden />
                )}
                {model.output !== null && (
                  <div className={css.ioSection}>
                    <span className={css.ioLabel}>{t('row.output')}</span>
                    <span className={css.ioText} data-error={state === 'error' || undefined}>
                      {model.output}
                    </span>
                  </div>
                )}
              </div>
            )}
          {inspect !== undefined && (
            <button type="button" className={css.inspectButton} onClick={inspect}>
              <IconInspectOutlineRegular />
              {t('row.inspect')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Registers the standalone Bash conversation-row sample. */
export const bashToolviewSample = {
  name: 'bash-toolview-sample',
  inject: ['slots'],
  apply(ctx: Context): void {
    ctx.slots.inject('tool.call.toolview', () =>
      ctx.slots.register({ name: 'tool.call.toolview', key: 'bash', locale: NS }, BashRow))
  },
}
