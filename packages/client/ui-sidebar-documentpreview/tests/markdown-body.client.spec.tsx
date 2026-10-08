// @vitest-environment jsdom
/** Markdown preview uses one accumulated document across page arrivals and EOF. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { makeTranslate } from '@qilin-agent/client-test-runtime'
import { MarkdownBody, type MarkdownBodyProps } from '../src/client/markdown/MarkdownBody.tsx'
import { en, zh } from '../src/client/markdown/locales.ts'
import type { DocumentContent } from '../src/client/document/contract.ts'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

function content(pageTexts: readonly string[], eof: boolean): DocumentContent {
  let offset = 1
  const pages = pageTexts.map((text) => {
    const lines = text.split('\n').length
    const page = { offset, text, lines }
    offset += lines
    return page
  })
  return { kind: 'text', text: pageTexts.join('\n'), pages, eof }
}

// Unused framework seats belong to the slot integration tests.
function props(value: DocumentContent, t: MarkdownBodyProps['t'] = makeTranslate(en), absolutePath?: string): MarkdownBodyProps {
  return {
    resourceAddress: 'qilin-resource://file/session/markdown/notes.md', content: value, wrap: false, t,
    useResource: () => ({
      status: absolutePath === undefined ? 'loading' : 'live',
      value: absolutePath === undefined ? undefined : { absolutePath, version: 'v1' },
      failure: undefined,
    }),
  } as MarkdownBodyProps
}

describe('MarkdownBody', () => {
  it('loads document images and failure text under http://localhost/', () => {
    vi.spyOn(document, 'baseURI', 'get').mockReturnValue('http://localhost/')
    const text = '![relative](images/a.png) ![absolute](/tmp/a.png) ![external](https://example.test/a.png)'
    const view = render(<MarkdownBody {...props(content([text], true), undefined, '/work/guide/notes.md')} />)
    expect(new URL(view.getByAltText('relative').getAttribute('src')!).searchParams.get('path'))
      .toBe('/work/guide/images/a.png')
    expect(new URL(view.getByAltText('absolute').getAttribute('src')!).searchParams.get('path')).toBe('/tmp/a.png')
    expect(view.getByAltText('external').getAttribute('src')).toBe('https://example.test/a.png')
    fireEvent.error(view.getByAltText('relative'))
    expect(view.getByText('relative').tagName).toBe('SPAN')
  })

  it('resolves reference images at EOF and updates their directory when metadata changes', () => {
    const first = '![figure][image]'
    const second = '\n[image]: images/a.png'
    const view = render(<MarkdownBody {...props(content([first], false))} />)
    view.rerender(<MarkdownBody {...props(content([first, second], false), undefined, '/work/guide/notes.md')} />)
    expect(view.container.querySelector('img')).toBeNull()
    view.rerender(<MarkdownBody {...props(content([first, second], true))} />)
    expect(view.container.querySelector('img')).toBeNull()
    for (const directory of ['/work/guide', '/other']) {
      view.rerender(<MarkdownBody {...props(content([first, second], true), undefined, `${directory}/notes.md`)} />)
      expect(new URL(view.getByAltText('figure').getAttribute('src')!).searchParams.get('path'))
        .toBe(`${directory}/images/a.png`)
    }
  })

  it('renders GFM headings, tables, task lists, strikeout, and localized code and footnote chrome', () => {
    const text = [
      '# Notes', '', '| Item | Value |', '| --- | --- |', '| a | 1 |', '',
      '- [x] Done', '- [ ] Pending', '', '~~Old~~ and **new**.', '',
      '```ts', 'const answer = 42', '```', '', 'Note[^one].', '', '[^one]: Detail.',
    ].join('\n')
    const view = render(<MarkdownBody {...props(content([text], true))} />)
    expect(view.getByRole('heading', { name: 'Notes' })).toBeDefined()
    expect(view.getAllByRole('columnheader').map(node => node.textContent)).toEqual(['Item', 'Value'])
    expect(view.getAllByRole('cell').map(node => node.textContent)).toEqual(['a', '1'])
    const tasks = view.getAllByRole('checkbox') as HTMLInputElement[]
    expect(tasks.map(task => task.checked)).toEqual([true, false])
    expect(tasks.every(task => task.disabled)).toBe(true)
    expect(view.container.querySelector('del')?.textContent).toBe('Old')
    expect(view.container.querySelector('strong')?.textContent).toBe('new')
    expect(view.getByRole('button', { name: 'Copy' })).toBeDefined()
    expect(view.getByRole('heading', { name: 'Footnotes' })).toBeDefined()
    expect(view.container.querySelector('pre')?.textContent).toBe('const answer = 42')
  })

  it('retains the Markdown and highlighted fence elements as pages extend and close a fence', () => {
    const first = '# Notes\n\nIntroduction.\n\n```ts\nconst first = 1'
    const second = 'const second = 2\n```\n\nFollowing paragraph.'
    const view = render(<MarkdownBody {...props(content([first], false))} />)
    const document = view.container.querySelector('[data-document-markdown]')
    const heading = view.getByRole('heading', { name: 'Notes' })
    const code = view.container.querySelector('pre.shiki')
    const firstLine = code?.querySelector('.line')
    expect(firstLine?.textContent).toBe('const first = 1')

    view.rerender(<MarkdownBody {...props(content([first, second], false))} />)
    expect(view.container.querySelector('[data-document-markdown]')).toBe(document)
    expect(view.getByRole('heading', { name: 'Notes' })).toBe(heading)
    expect(view.container.querySelectorAll('pre')).toHaveLength(1)
    expect(view.container.querySelector('pre.shiki')).toBe(code)
    expect(code?.querySelector('.line')).toBe(firstLine)
    expect(code?.textContent).toBe('const first = 1\nconst second = 2')
    expect(view.getByText('Following paragraph.')).toBeDefined()

    view.rerender(<MarkdownBody {...props(content([first, second], true))} />)
    expect(view.container.querySelector('pre.shiki')).toBe(code)
    expect(code?.querySelector('.line')).toBe(firstLine)
  })

  it('resolves cross-page references and math when the cumulative text reaches EOF', () => {
    const first = 'Read [the guide][guide].\n\nFirst.\n\nSecond.\n\nThird.\n\nFourth.'
    const second = '\n[guide]: https://example.test/guide\n\nValue $x^2$.'
    const view = render(<MarkdownBody {...props(content([first], false))} />)
    view.rerender(<MarkdownBody {...props(content([first, second], false))} />)
    expect(view.container.querySelector('.katex')).toBeNull()
    view.rerender(<MarkdownBody {...props(content([first, second], true))} />)
    expect(view.container.querySelector('a[href="https://example.test/guide"]')?.textContent).toBe('the guide')
    expect(view.container.querySelector('.katex')).not.toBeNull()
  })

  it('updates labels when translations change without replacing the translation function', () => {
    let dictionary = en
    const t: MarkdownBodyProps['t'] = key => Object.hasOwn(dictionary, key) ? dictionary[key as keyof typeof dictionary] : key
    const text = '```ts\nconst answer = 42\n```\n\nNote[^one].\n\n[^one]: Detail.'
    const value = content([text], true)
    const view = render(<MarkdownBody {...props(value, t)} />)
    expect(view.getByRole('button', { name: 'Copy' })).toBeDefined()
    dictionary = zh
    view.rerender(<MarkdownBody {...props(value, t)} />)
    expect(view.getByRole('button', { name: '复制' })).toBeDefined()
    expect(view.getByRole('heading', { name: '脚注' })).toBeDefined()
  })

  it('renders empty text and leaves non-text deliveries to their selected implementation', () => {
    const view = render(<MarkdownBody {...props({ kind: 'text', text: '', pages: [], eof: true })} />)
    expect(view.container.querySelector('[data-document-markdown]')?.textContent).toBe('')
    view.rerender(<MarkdownBody {...props({ kind: 'bytes', data: new TextEncoder().encode('text') })} />)
    expect(view.container.childElementCount).toBe(0)
  })
})

describe('MarkdownBody — authored raw HTML', () => {
  it('renders sanitized HTML elements around the Markdown that carries them', () => {
    vi.spyOn(document, 'baseURI', 'get').mockReturnValue('http://localhost/')
    const text = [
      'before',
      '',
      '<div class="note"><b>bold</b> and <i>italic</i></div>',
      '',
      'after',
    ].join('\n')
    const view = render(<MarkdownBody {...props(content([text], true), undefined, '/work/guide/notes.md')} />)
    const note = view.container.querySelector('div.note')
    expect(note?.querySelector('b')?.textContent).toBe('bold')
    expect(note?.querySelector('i')?.textContent).toBe('italic')
    expect(view.container.textContent).toContain('before')
    expect(view.container.textContent).toContain('after')
  })

  it('keeps an inline tag literal and a block opening that closes in another run', () => {
    const text = [
      'a paragraph with <sub>subscript</sub> inline',
      '',
      '<div class="note">',
      '',
      'Markdown body',
      '',
      '</div>',
    ].join('\n')
    const view = render(<MarkdownBody {...props(content([text], true))} />)
    // Both stay literal text: the parse hands the inline tag over one tag at a
    // time, and the block would render as an empty element around nothing.
    expect(view.container.querySelector('sub')).toBeNull()
    expect(view.container.textContent).toContain('<sub>subscript</sub>')
    expect(view.container.querySelector('div.note')).toBeNull()
    expect(view.container.textContent).toContain('Markdown body')
  })

  it('never lets active content reach the document', () => {
    const text = [
      '<script>globalThis.compromised = true</script>',
      '',
      '<img src="x" onerror="globalThis.compromised = true">',
      '',
      '<iframe src="https://evil.test"></iframe>',
      '',
      '<form action="/x"><input value="1"><button>go</button></form>',
      '',
      '<p onclick="globalThis.compromised = true">kept</p>',
    ].join('\n')
    const view = render(<MarkdownBody {...props(content([text], true))} />)
    expect(view.container.querySelector('script')).toBeNull()
    expect(view.container.querySelector('iframe')).toBeNull()
    expect(view.container.querySelector('form')).toBeNull()
    expect(view.container.querySelector('input')).toBeNull()
    expect(view.container.querySelector('button')).toBeNull()
    expect(view.container.querySelector('[onerror]')).toBeNull()
    expect(view.container.querySelector('[onclick]')).toBeNull()
    expect((globalThis as { compromised?: boolean }).compromised).toBeUndefined()
    expect(view.container.querySelector('p')?.textContent).toBe('kept')
  })

  it('renders nothing for a block run whose every element is refused', () => {
    const view = render(<MarkdownBody {...props(content(['<form action="/x"><input value="1"></form>', '', 'kept'], true))} />)
    expect(view.container.querySelector('form')).toBeNull()
    expect(view.container.textContent).not.toContain('<form')
    expect(view.container.textContent).toContain('kept')
  })

  it('hardens anchors and rewrites a local image through the file route', () => {
    vi.spyOn(document, 'baseURI', 'get').mockReturnValue('http://localhost/')
    const text = '<div><a href="https://example.test/x">link</a><img src="images/a.png" alt="local"></div>'
    const view = render(<MarkdownBody {...props(content([text], true), undefined, '/work/guide/notes.md')} />)
    const anchor = view.container.querySelector('a')
    expect(anchor?.getAttribute('target')).toBe('_blank')
    expect(anchor?.getAttribute('rel')).toBe('noopener noreferrer')
    const image = view.getByAltText('local')
    expect(new URL(image.getAttribute('src')!).searchParams.get('path')).toBe('/work/guide/images/a.png')
  })
})
