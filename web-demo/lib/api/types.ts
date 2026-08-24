import type { ApiError } from '@/lib/types';

export type { ApiError, Result } from '@/lib/types';

export class GatewayError extends Error {
  constructor(public readonly apiError: ApiError) {
    super(apiError.message);
    this.name = 'GatewayError';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}
