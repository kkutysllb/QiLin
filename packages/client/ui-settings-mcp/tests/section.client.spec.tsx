// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Context, Service } from '@qilin-agent/kylin'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@qilin-agent/client-locale/client'
import { SlotRegistry } from '@qilin-agent/client-ui-renderer/client'
import { resolveSlotLabel } from '@qilin-agent/client-ui-slots'
import { usePinnedBrowserLanguages } from '@qilin-agent/client-test-runtime'
import type { McpServersSnapshot } from '@qilin-agent/mcp-servers/types'
import type { ReactElement } from 'react'
import { McpSection } from '../src/client/McpSection.tsx'
import type { McpSectionProps } from '../src/client/McpSection.tsx'
import { McpServersStore, type McpPageState } from '../src/client/store.ts'
import { apply, inject, MCP_PANEL_ID, NS } from '../src/client/index.ts'
import { apply as hostApply } from '../src/index.ts'
import { en } from '../src/client/locales.ts'

usePinnedBrowserLanguages('en')
afterEach(cleanup)

const t = (key: keyof typeof en): string => en[key]

/** One configured server row. */
const SERVER = {
  serverName: 'context7',
  entryId: 'mcp-context7',
  transport: 'stdio' as const,
  detail: 'npx -y @upstash/context7-mcp',
  enabled: true,
  command: 'npx',
  args: ['-y', '@upstash/context7-mcp'],
  cwd: '',
  url: '',
  failOnStartupError: false,
}

/** One disabled Streamable HTTP server row. */
const HTTP_SERVER = {
  ...SERVER,
  serverName: 'remote',
  entryId: 'mcp-remote',
  transport: 'streamable-http' as const,
  detail: 'https://example.test/mcp',
  enabled: false,
  command: '',
  args: [] as string[],
  url: 'https://example.test/mcp',
}

function pageState(overrides: Partial<McpPageState> = {}): McpPageState {
  return {
    status: 'ready',
    error: null,
    layerError: null,
    patchPath: '/home/.qilin/cordis.patch.yml',
    servers: [],
    busy: null,
    ...overrides,
  }
}

/** A controller whose every method resolves as the caller asks. */
function controller(landed = true) {
  return {
    load: vi.fn(async () => landed),
    save: vi.fn(async () => landed),
    remove: vi.fn(async () => landed),
    setEnabled: vi.fn(async () => landed),
  }
}

function props(current: McpPageState, store = controller()): { props: McpSectionProps; store: ReturnType<typeof controller> } {
  return {
    store,
    props: {
      close: () => {},
      controller: store,
      useSnapshot: <Selected,>(select: (snapshot: McpPageState) => Selected): Selected => select(current),
      t,
    } as unknown as McpSectionProps,
  }
}

describe('McpSection', () => {
  it('lists a configured server and toggles it through the store', () => {
    const bench = props(pageState({ servers: [SERVER] }))
    render(<McpSection {...bench.props} />)
    expect(screen.getByRole('button', { name: 'Edit context7' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Delete context7' })).toBeDefined()
    fireEvent.click(screen.getByRole('switch', { name: 'Disable context7' }))
    expect(bench.store.setEnabled).toHaveBeenCalledWith('context7', false)
  })

  it('reads the page once on mount', () => {
    const bench = props(pageState())
    render(<McpSection {...bench.props} />)
    expect(bench.store.load).toHaveBeenCalledTimes(1)
  })

  it('submits one argument per line as a stdio draft', async () => {
    const bench = props(pageState())
    render(<McpSection {...bench.props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add server' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'files' } })
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'npx' } })
    fireEvent.change(screen.getByLabelText('Arguments'), { target: { value: '-y\n@modelcontextprotocol/server-filesystem\n' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(bench.store.save).toHaveBeenCalledWith({
        serverName: 'files',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
        cwd: '',
        failOnStartupError: false,
      })
    })
  })

  it('keeps the editor open when the write is refused', async () => {
    const bench = props(pageState(), controller(false))
    render(<McpSection {...bench.props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add server' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'files' } })
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'npx' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => { expect(bench.store.save).toHaveBeenCalled() })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDefined()
  })

  it('switches to a Streamable HTTP draft and submits its endpoint', async () => {
    const bench = props(pageState())
    render(<McpSection {...bench.props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add server' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'remote' } })
    fireEvent.change(screen.getByLabelText('Transport'), { target: { value: 'streamable-http' } })
    fireEvent.change(screen.getByLabelText('Endpoint URL'), { target: { value: 'https://example.test/mcp' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(bench.store.save).toHaveBeenCalledWith({
        serverName: 'remote',
        transport: 'streamable-http',
        url: 'https://example.test/mcp',
        failOnStartupError: false,
      })
    })
  })

  it('edits a configured server with its name locked', () => {
    const bench = props(pageState({ servers: [SERVER] }))
    render(<McpSection {...bench.props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit context7' }))
    expect(screen.getByLabelText('Name')).toHaveProperty('disabled', true)
    expect(screen.getByText('A saved server keeps its name; add a new server to use a different one.')).toBeDefined()
  })

  it('confirms before deleting a server', () => {
    const bench = props(pageState({ servers: [SERVER] }))
    render(<McpSection {...bench.props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete context7' }))
    expect(bench.store.remove).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(bench.store.remove).toHaveBeenCalledWith('context7')
  })

  it('reports a broken layer and offers no mutation', () => {
    const bench = props(pageState({ layerError: 'the file is not valid YAML' }))
    render(<McpSection {...bench.props} />)
    expect(screen.getByText('This patch file cannot be read, so no server can be changed until it is repaired by hand.')).toBeDefined()
    expect(screen.getByText('the file is not valid YAML')).toBeDefined()
    expect(screen.getByText('Patch file: /home/.qilin/cordis.patch.yml')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Add server' })).toHaveProperty('disabled', true)
  })

  it('reports a failed call and retries through the store', () => {
    const bench = props(pageState({ error: 'the layer is unreadable' }))
    render(<McpSection {...bench.props} />)
    expect(screen.getByRole('alert')).toBeDefined()
    expect(screen.getByText('the layer is unreadable')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(bench.store.load).toHaveBeenCalledTimes(2)
  })

  it('renders an empty configured list', () => {
    const bench = props(pageState())
    render(<McpSection {...bench.props} />)
    expect(screen.getByText('No MCP server is configured yet.')).toBeDefined()
  })

  it('enables a disabled Streamable HTTP server and names its transport', () => {
    const bench = props(pageState({ servers: [HTTP_SERVER] }))
    render(<McpSection {...bench.props} />)
    expect(screen.getByText('Streamable HTTP')).toBeDefined()
    fireEvent.click(screen.getByRole('switch', { name: 'Enable remote' }))
    expect(bench.store.setEnabled).toHaveBeenCalledWith('remote', true)
  })

  it('cancels a pending deletion and an open draft', () => {
    const bench = props(pageState({ servers: [SERVER] }))
    render(<McpSection {...bench.props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete context7' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add server' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Add server' })).toBeDefined()
  })

  it('marks an open draft as being saved', () => {
    const view = render(<McpSection {...props(pageState()).props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add server' }))
    view.rerender(<McpSection {...props(pageState({ busy: 'draft' })).props} />)
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDefined()
  })

  it('edits every stdio field, the failure switch, and a transport switched back', async () => {
    const bench = props(pageState())
    render(<McpSection {...bench.props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add server' }))
    const transport = screen.getByLabelText('Transport')
    fireEvent.change(transport, { target: { value: 'streamable-http' } })
    fireEvent.change(transport, { target: { value: 'stdio' } })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'files' } })
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'npx' } })
    fireEvent.change(screen.getByLabelText('Working directory'), { target: { value: '/tmp' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(bench.store.save).toHaveBeenCalledWith({
        serverName: 'files',
        transport: 'stdio',
        command: 'npx',
        args: [],
        cwd: '/tmp',
        failOnStartupError: true,
      })
    })
  })
})

describe('ui-settings-mcp browser plugin', () => {
  it('keeps the host Loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('declares only the services the page and its Remote need', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.mcpServers'])
  })

  it('registers one sidebar panel and reads nothing until it mounts', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    const locale = new LocaleRuntime(ctx)
    ctx.provide('locale', locale)
    class RemoteService extends Service {
      constructor(serviceCtx: Context) {
        super(serviceCtx, 'remote')
      }
    }
    new RemoteService(ctx)
    const list = vi.fn(async (): Promise<{ ok: true; value: McpServersSnapshot }> => ({
      ok: true,
      value: { patchPath: '/tmp/patch.yml', servers: [] },
    }))
    ctx.provide('remote.mcpServers', { list })
    const slots = ctx.get('slots') as SlotRegistry
    slots.register({
      name: 'root',
      children: {
        main: { kind: 'keyed', scope: 'root' },
        'sidebar.panellist': { kind: 'list', scope: 'root' },
      },
    } as never, () => null)

    await ctx.plugin({ inject: [...inject], apply }).await()

    // The page is a workspace panel, not a Settings section.
    expect(slots.entries('settings.section')).toHaveLength(0)
    const panel = slots.entries('main')[0]
    expect(panel?.options.key).toBe(MCP_PANEL_ID)
    expect(NS).toBe('settings.mcp')
    expect(list).not.toHaveBeenCalled()
    // The registry keeps the inject factory beside the registration options.
    const face = panel?.inject?.() as { controller: unknown; t: (key: keyof typeof en) => string } | undefined
    expect(face?.controller).toBeInstanceOf(McpServersStore)
    expect(face?.t('nav')).toBe('MCP servers')
    expect(new McpServersStore(ctx).store.getSnapshot().status).toBe('idle')
    // One sidebar row addresses the panel and draws its protocol mark.
    const row = slots.entries('sidebar.panellist')[0]
    expect(row?.options.id).toBe(MCP_PANEL_ID)
    expect(row?.options.order).toBe(20)
    expect(resolveSlotLabel(row!.options.label)).toBe('MCP servers')
    const draw = (active: boolean): ReactElement<{ size: number }> => (row!.component as (
      props: { size: number; active: boolean },
    ) => ReactElement<{ size: number }>)({ size: 16, active })
    expect(draw(false).props.size).toBe(16)
    expect(draw(true).props.size).toBe(16)
    expect(draw(true).type).not.toBe(draw(false).type)
    await ctx.fiber.dispose()
    expect(slots.entries('main')).toHaveLength(0)
    expect(slots.entries('sidebar.panellist')).toHaveLength(0)
  })

})
