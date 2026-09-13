/**
 * Shell chrome content registered into the settings header and close seats.
 * The shell renders the surrounding chrome and reads each entry's own copy.
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

/** Close-button label text props: the standard locale seat only. */
export type CloseLabelProps = PropsRuntime<'settings.close'> & PropsLocale<'settings'>

/**
 * Render the close button's visually-hidden label text.
 * @param props - composed slot props.
 * @returns the label text node.
 */
export function CloseLabel({ t }: CloseLabelProps) {
  return <>{t('close')}</>
}
