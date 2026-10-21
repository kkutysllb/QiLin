/** Assistant reasoning disclosure, independent of Tool-call presentation. */
import { memo, useCallback, useMemo, useState } from 'react'
import { DisclosureRow, IconThinkOutlineRegular, TextShimmer } from '@qilin-agent/client-ui-primitives'
import type { PropsRenderSlots } from '@qilin-agent/client-ui-slots'
import type { ChatViewSlotProps, UseDisclosure, UsePresentation } from '../contract/slots.ts'
import a11yCss from './accessibility.module.css'
import css from './ReasoningRow.module.css'

const THINK_ICON = <IconThinkOutlineRegular size={14} />

function firstLine(text: string): string {
  const newline = text.indexOf('\n')
  return newline === -1 ? text : text.slice(0, newline)
}

/**
 * First line of the latest paragraph that holds a completed first line. An
 * unfinished single line has no preview, and later text in the same paragraph
 * leaves the preview unchanged.
 * @param text - streaming reasoning text.
 * @returns the preview text, or an empty string before the first line completes.
 */
function latestCompletedParagraphFirstLine(text: string): string {
  let summary = ''
  let paragraphStart = 0
  const separator = /\r?\n(?:[\t ]*\r?\n)+/g
  while (true) {
    const nextParagraph = separator.exec(text)
    const paragraphEnd = nextParagraph === null ? text.length
      : nextParagraph.index + nextParagraph[0].indexOf('\n')
    const newline = text.indexOf('\n', paragraphStart)
    if (newline !== -1 && newline <= paragraphEnd) {
      const candidate = text.slice(paragraphStart, newline).trim()
      if (candidate !== '') summary = candidate
    }
    if (nextParagraph === null) return summary
    paragraphStart = nextParagraph.index + nextParagraph[0].length
  }
}

/**
 * Own one row's disclosure when no Chat seat supplies the Turn-scoped hook: a
 * detached composition, which has no enclosing Turn to reset it.
 * @returns independent open state for one reasoning row.
 */
const useDetachedDisclosure: UseDisclosure = () => {
  const [expanded, setExpanded] = useState(false)
  const setOpen = useCallback((open: boolean) => { setExpanded(open) }, [])
  const toggle = useCallback(() => { setExpanded(value => !value) }, [])
  return { expanded, setExpanded: setOpen, toggle }
}

/**
 * Render one assistant reasoning block collapsed until the reader opens it. The
 * collapsed summary omits double-asterisk markers; expanded content renders
 * the complete Markdown with secondary typography. A streaming preview advances
 * when a paragraph's first line completes. Mode changes toggle CSS display without unmounting
 * collapsed summaries.
 * @param props.text - complete or streaming reasoning text.
 * @param props.running - whether this block is the streaming tail.
 * @param props.usePresentation - live display-policy selector for this reasoning row.
 * @param props.useDisclosure - independent open state with enclosing-Turn resets.
 * @param props.renderSlot - framework renderer for the standard reasoning Body Slot.
 * @param props.t - conversation locale seat for the disclosure and running status.
 * @returns the reasoning disclosure.
 */
export const ReasoningRow = memo(function ReasoningRow({ text, running, usePresentation, useDisclosure, renderSlot, t }: {
  text: string
  running: boolean
  usePresentation?: UsePresentation | undefined
  useDisclosure?: UseDisclosure | undefined
  renderSlot: PropsRenderSlots<'conversation.chat.reasoning.body'>['renderSlot']
  t: ChatViewSlotProps['t']
}) {
  // The seat's hook identity is fixed per render position, so the chosen hook
  // keeps a stable call order for this row.
  const { expanded, toggle } = (useDisclosure ?? useDetachedDisclosure)()
  const summaryText = running ? latestCompletedParagraphFirstLine(text) : firstLine(text)
  const summary = useMemo(() => summaryText.replaceAll('**', ''), [summaryText])
  const preview = usePresentation === undefined
    ? summary !== ''
    : usePresentation(policy => !expanded && summary !== ''
      && (running || policy.settledReasoningPreview))
  const collapsedContent = useMemo(() => (
    <>
      <span className={css.separator} data-shimmer-decoration aria-hidden />
      <span className={css.summary} data-streaming={running || undefined}>
        <span className={css.summaryText}>
          <TextShimmer>{summary}</TextShimmer>
        </span>
      </span>
    </>
  ), [running, summary])
  const content = useMemo(() => expanded ? (
    <div className={css.thinkBody}>
      {renderSlot('conversation.chat.reasoning.body', { text, running })}
    </div>
  ) : undefined, [expanded, renderSlot, running, text])

  return (
    <div
      className={css.root}
      data-variant="think"
      data-state={running ? 'running' : 'ok'}
      data-expanded={expanded || undefined}
      data-preview={preview || undefined}
    >
      {running && <span className={a11yCss.visuallyHidden}>{t('row.running')}</span>}
      <DisclosureRow
        rowClassName={css.row}
        leadingClassName={css.leading}
        titleClassName={css.title}
        icon={THINK_ICON}
        title={t('message.think')}
        running={running}
        open={expanded}
        expandable
        expandOnRowClick
        onToggle={toggle}
        collapsedContent={collapsedContent}
      >
        {content}
      </DisclosureRow>
    </div>
  )
})
