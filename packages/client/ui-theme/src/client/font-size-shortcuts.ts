/** Desktop keyboard shortcuts that step all three font sizes together. */

import type { Context as ClientContext } from '@qilin-agent/kylin'
import type { ShortcutCommandId } from '@qilin-agent/client-shortcuts/client'


/**
 * Register the desktop font-size keys and consume their gestures.
 * The web client keeps the browser's own zoom for these keys, so the
 * registration exists only where the keyboard service reports the desktop
 * runtime.
 * @param ctx - client cordis context owning the registration effects.
 * @param namespace - locale namespace carrying the shortcut labels (this package's own).
 * @param adjust - applies one +1 or -1 px step to every font-size role.
 */
export function installFontSizeShortcuts(
  ctx: ClientContext,
  namespace: 'settings.theme',
  adjust: (delta: 1 | -1) => void,
): void {
  ctx.inject(['shortcuts', 'locale'], (scope) => {
    if (scope.shortcuts.runtime !== 'desktop') return
    const t = scope.locale.bind(namespace)
    for (const [direction, code, label] of [
      ['increase', 'Equal', 'fontSize.text.increase'],
      ['decrease', 'Minus', 'fontSize.text.decrease'],
    ] as const) {
      const binding = { code, modifiers: ['primary'] as const }
      const bindings = direction === 'increase'
        ? [binding, { code, modifiers: ['primary', 'shift'] as const }] as const : [binding] as const
      scope.effect(() => scope.shortcuts.registerFixed({
        id: `fontSize.${direction}` as ShortcutCommandId, label: () => t(label),
        keys: scope.shortcuts.describeBinding(binding).keys,
        bindings, group: 'application',
      }), `ui-theme: ${direction} font size reference`)
    }
    scope.effect(() => scope.shortcuts.observeFixedInput((input) => {
      if (input.type === 'reset') return
      const { gesture, context } = input
      if (gesture.composing || gesture.defaultPrevented || gesture.repeat || context.region === 'terminal'
        || gesture.alt || (scope.shortcuts.platform === 'macos' ? !gesture.meta || gesture.control : !gesture.control || gesture.meta)
        || (gesture.code !== 'Equal' && gesture.code !== 'Minus') || (gesture.code === 'Minus' && gesture.shift)) return
      input.consume()
      adjust(gesture.code === 'Equal' ? 1 : -1)
    }), 'ui-theme: font size input')
  })
}
