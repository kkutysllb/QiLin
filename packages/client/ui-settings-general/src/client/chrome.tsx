/**
 * Shell chrome content registered into the settings header seat.
 * The shell renders the surrounding chrome and reads the entry's own copy.
 */
import type { PropsLocale, PropsRuntime } from '@qilin/client-ui-slots'

/** Header content props: the standard locale seat only. */
export type HeaderContentProps = PropsRuntime<'settings.header'> & PropsLocale<'settings'>

/**
 * Render the panel title text.
 * @param props - composed slot props.
 * @returns the title text node.
 */
export function HeaderContent({ t }: HeaderContentProps) {
  return <>{t('title')}</>
}
