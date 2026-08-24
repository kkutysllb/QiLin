'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { StreamEvent, StreamHandler, StreamStatus } from './stream-types';

interface UseEventSourceOptions {
  url: string | null;
  onEvent: StreamHandler;
  onError?: (err: Event) => void;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export function useEventSource({
  url,
  onEvent,
  onError,
  maxRetries = Infinity,
  baseDelayMs = 1000,
  maxDelayMs = 30000
}: UseEventSourceOptions) {
  const [status, setStatus] = useState<StreamStatus>('idle');
  const retryRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  const onErrorRef = useRef(onError);
  onEventRef.current = onEvent;
  onErrorRef.current = onError;

  const connect = useCallback(() => {
    if (!url) return;
    setStatus('connecting');
    const es = new EventSource(url, { withCredentials: true });
    esRef.current = es;

    es.onopen = () => {
      retryRef.current = 0;
      setStatus('open');
    };

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as StreamEvent;
        onEventRef.current(event);
      } catch {
        // ignore non-JSON heartbeats
      }
    };

    es.onerror = (e) => {
      setStatus('error');
      es.close();
      onErrorRef.current?.(e);
      if (retryRef.current < maxRetries) {
        const delay = Math.min(baseDelayMs * 2 ** retryRef.current, maxDelayMs);
        retryRef.current += 1;
        setTimeout(() => connect(), delay);
      } else {
        setStatus('closed');
      }
    };
  }, [url, maxRetries, baseDelayMs, maxDelayMs]);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      setStatus('closed');
    };
  }, [connect]);

  return { status };
}
