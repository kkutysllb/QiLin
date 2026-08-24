import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  withCredentials: boolean | undefined;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  closed = false;
  constructor(url: string, init?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = init?.withCredentials;
    MockEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
  }
  fireMessage(data: string) {
    this.onmessage?.({ data });
  }
  fireOpen() {
    this.onopen?.();
  }
  fireError() {
    this.onerror?.(new Event('error'));
  }
}

beforeEach(() => {
  MockEventSource.instances = [];
  (global as unknown as { EventSource: typeof MockEventSource }).EventSource =
    MockEventSource;
});

import { useEventSource } from '@/lib/sse/use-event-source';

describe('useEventSource', () => {
  it('connects and parses messages', async () => {
    const onEvent = vi.fn();
    renderHook(() => useEventSource({ url: '/api/stream', onEvent }));
    await act(async () => {
      MockEventSource.instances[0].fireOpen();
      MockEventSource.instances[0].fireMessage(
        JSON.stringify({ type: 'message.chunk', run_id: 'r', delta: 'hi' })
      );
    });
    expect(onEvent).toHaveBeenCalledWith({
      type: 'message.chunk',
      run_id: 'r',
      delta: 'hi'
    });
  });

  it('ignores non-JSON data', async () => {
    const onEvent = vi.fn();
    renderHook(() => useEventSource({ url: '/api/stream', onEvent }));
    await act(async () => {
      MockEventSource.instances[0].fireOpen();
      MockEventSource.instances[0].fireMessage('heartbeat');
    });
    expect(onEvent).not.toHaveBeenCalled();
  });
});
