import type { StreamEvent } from '@/lib/types';

export type { StreamEvent };

export type StreamHandler = (event: StreamEvent) => void;
export type StreamStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';
