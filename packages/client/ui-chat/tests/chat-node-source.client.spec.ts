import { describe, expect, it, vi } from 'vitest'
import type {
  ChatConversationViewNode, ChatNodeSource,
} from '@qilin-agent/client-ui-chat/client'
import type { ConversationTimelineSnapshot } from '@qilin-agent/client-ui-conversation/client'
import { ChatSnapshotBuilder } from '../src/client/conversation-nodes/chat-snapshot-builder.ts'

const timeline: ConversationTimelineSnapshot = { turnOrder: [], turns: new Map() }

function userNode(index: number, text = `message ${String(index)}`): ChatConversationViewNode {
  return {
    key: `user:${String(index)}`,
    id: String(index),
    target: 'chat',
    kind: 'user',
    anchorSeq: index,
    location: { kind: 'session' },
    visibility: 'visible',
    data: {
      kind: 'user',
      messageId: `message-${String(index)}`,
      seq: index,
      time: index,
      content: [{ type: 'text', text }],
      source: null,
    },
  }
}

describe('Chat Node keyed sources', () => {
  it('notifies only the updated key among 4,000 mounted sources', () => {
    const builder = new ChatSnapshotBuilder()
    const nodes = Array.from({ length: 4_000 }, (_, index) => userNode(index + 1))
    const initial = builder.replace({ nodes, timeline })
    builder.publish()
    const listeners = nodes.map(() => vi.fn())
    const sources: ChatNodeSource[] = nodes.map((node, index) => {
      const source = initial.nodes.source(node.key)
      source.subscribe(listeners[index]!)
      return source
    })

    const target = 2_347
    const changed = userNode(target + 1, 'streamed update')
    const next = builder.apply({ upserts: [changed], timeline })
    builder.publish()

    expect(listeners[target]).toHaveBeenCalledOnce()
    expect(listeners.reduce((count, listener) => count + listener.mock.calls.length, 0)).toBe(1)
    expect(next.nodes.source(changed.key)).toBe(sources[target])
    expect(next.nodes.get(changed.key)).toBe(changed)
  })

  it('retires a removed node\'s keyed sources with its last consumer', () => {
    const builder = new ChatSnapshotBuilder()
    const nodes = [userNode(1), userNode(2), userNode(3)]
    const first = builder.replace({ nodes, timeline })
    builder.publish()
    const survivor = first.nodes.source(nodes[0]!.key)
    const observed = first.nodes.source(nodes[1]!.key)
    const idle = first.nodes.source(nodes[2]!.key)
    const unsubscribe = observed.subscribe(() => {})

    const second = builder.replace({ nodes: [nodes[0]!], timeline })
    builder.publish()
    // A surviving row keeps its source identity.
    expect(second.nodes.source(nodes[0]!.key)).toBe(survivor)
    // An observed source outlives the removal, then retires with its consumer.
    expect(second.nodes.source(nodes[1]!.key)).toBe(observed)
    // An unobserved removed row leaves no entry behind for the Session.
    expect(second.nodes.source(nodes[2]!.key)).not.toBe(idle)

    unsubscribe()
    expect(second.nodes.source(nodes[1]!.key)).not.toBe(observed)
  })
})
