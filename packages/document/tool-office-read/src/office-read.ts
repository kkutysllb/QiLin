/**
 * The model-facing `office_read` tool: resolve one document through the mounted
 * filesystem backend, read its bytes under a size cap, and return a compact
 * text rendering of what the read-only reader found.
 * @module @qilin-agent/tool-office-read/office-read
 */

import type { Context } from '@qilin-agent/kylin'
import { FsError } from '@qilin-agent/fs'
import { OfficeReadError, readOffice, type OfficeContent, type OfficeFormat } from '@qilin-agent/office-read'
import { defineTool } from '@qilin-agent/tools'
import type { GenericCallView, ToolExecution } from '@qilin-agent/tools'
import type {} from '@qilin-agent/fs'

/** Registration bounds the composing plugin supplies. */
export interface OfficeReadToolConfig {
  /** Largest document the tool reads, in bytes. */
  readonly maxBytes: number
}

/** Value the tool returns to the model and to presentation. */
export interface OfficeReadValue {
  /** Resolved path the tool read. */
  readonly path: string
  /** Detected or requested format. */
  readonly format: OfficeFormat
  /** Whether a read limit stopped the summary early. */
  readonly truncated: boolean
  /** Compact text rendering of the document's content. */
  readonly content: string
}

/** Extensions the tool claims, mapped to the format they name. */
const EXTENSIONS: Readonly<Record<string, OfficeFormat>> = {
  '.docx': 'docx',
  '.xlsx': 'xlsx',
  '.pptx': 'pptx',
}

/** Resolve options for one tool call: the calling session's workspace is the base directory. */
function resolveOptions(exec: ToolExecution): { cwd?: string; signal?: AbortSignal } {
  const cwd = exec.agent?.session.header.cwd
  return { ...cwd === undefined ? {} : { cwd }, signal: exec.signal }
}

/** Heading prefix for one paragraph level. */
function heading(level: number | undefined): string {
  return level === undefined ? '' : '#'.repeat(Math.min(level, 6)) + ' '
}

/** Render one table as tab-separated rows. */
function renderTable(rows: readonly (readonly string[])[]): string {
  return rows.map(row => row.join('\t')).join('\n')
}

/**
 * Render a read document as compact model-facing text: headings keep their
 * level, tables stay tab-separated, cells and slides are labelled.
 * @param value - the read content.
 * @returns the text rendering.
 */
export function renderOfficeContent(value: OfficeContent): string {
  const lines: string[] = []
  if (value.format === 'docx') {
    for (const paragraph of value.paragraphs) lines.push(heading(paragraph.level) + paragraph.text)
    for (const [index, table] of value.tables.entries()) {
      lines.push('', `Table ${String(index + 1)}:`, renderTable(table))
    }
    return lines.join('\n')
  }
  if (value.format === 'xlsx') {
    for (const sheet of value.sheets) {
      lines.push(`Sheet ${JSON.stringify(sheet.name)}:`, renderTable(sheet.rows), '')
    }
    return lines.join('\n').trimEnd()
  }
  lines.push(`Slide size: ${String(value.width)} x ${String(value.height)} EMU`)
  for (const slide of value.slides) {
    lines.push('', `Slide ${String(slide.index + 1)}:`, slide.texts.join('\n'))
    for (const table of slide.tables) lines.push(renderTable(table))
  }
  return lines.join('\n')
}

/** Map a reader failure onto the message the model sees. */
function readFailure(error: OfficeReadError, path: string): Error {
  if (error.code === 'too-large') return new Error(`cannot read "${path}": the document exceeds a read limit (${error.message})`)
  if (error.code === 'unsupported') return new Error(`cannot read "${path}": not a DOCX, XLSX, or PPTX document this reader supports`)
  return new Error(`cannot read "${path}": the Office package is damaged or incomplete (${error.message})`)
}

/**
 * Register the tool.
 * @param ctx - registration scope; execution uses its `fs` service.
 * @param config - registration bounds.
 */
export function applyOfficeReadTool(ctx: Context, config: OfficeReadToolConfig): void {
  ctx.tools.register(defineTool({
    name: 'office_read',
    description: 'Read a DOCX, XLSX, or PPTX document and return its text: paragraphs with heading levels, tables, spreadsheet cells, or slide text. '
      + 'Use this instead of converting the document or installing a parser when you need the content. '
      + 'The result is text, not a rendered page; styles, comments, charts, and embedded objects are excluded.',
    parameters: {
      file_path: {
        type: 'string', required: true,
        description: 'Path to the Office document, resolved by the filesystem backend.',
      },
      format: { type: 'string', enum: ['docx', 'xlsx', 'pptx'], description: 'Document format when the path extension does not name it.' },
      limit: { type: 'integer', description: 'Largest number of paragraphs, rows per sheet, or slides to return.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          format: { type: 'string', required: true, enum: ['docx', 'xlsx', 'pptx'] },
          truncated: { type: 'boolean', required: true },
          content: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.content }],
      presentationMeta: (_args, value) => ({ path: value.path }),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec): Promise<OfficeReadValue> {
      const requested = args.file_path.trim()
      if (requested.length === 0) throw new Error('file_path must be a non-empty string')
      const declared = args.format ?? EXTENSIONS[requested.slice(requested.lastIndexOf('.')).toLowerCase()]
      const target = await ctx.fs.resolve(requested, resolveOptions(exec))
      const info = await ctx.fs.stat(target, exec.signal)
      if (info === undefined) throw new FsError(`cannot read "${target.displayPath}": not found`, 'FS_NOT_FOUND')
      if (info.type !== 'file') throw new FsError(`cannot read "${target.displayPath}": not a regular file`, 'FS_NOT_REGULAR_FILE')
      if (info.size !== undefined && info.size > config.maxBytes) {
        throw new Error(`cannot read "${target.displayPath}": ${String(info.size)} bytes exceeds the ${String(config.maxBytes)}-byte read limit`)
      }
      const bytes = await ctx.fs.readBytes(target, exec.signal, config.maxBytes)
      const limit = args.limit === undefined ? {} : {
        limits: {
          maxParagraphs: args.limit,
          maxRows: args.limit,
          maxSlides: args.limit,
        },
      }
      let content: OfficeContent
      try {
        content = readOffice(bytes, { ...declared === undefined ? {} : { format: declared }, ...limit })
      } catch (error: unknown) {
        if (error instanceof OfficeReadError) throw readFailure(error, target.displayPath)
        throw error
      }
      return { path: target.displayPath, format: content.format, truncated: content.truncated, content: renderOfficeContent(content) }
    },
    presentCall(args): GenericCallView {
      return {
        card: 'generic',
        title: `Read document ${args.file_path}`,
        kind: 'read',
        locations: [{ path: args.file_path }],
      }
    },
  }))
}
