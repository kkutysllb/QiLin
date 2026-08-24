import type { ID } from './common';

export interface Agent {
  name: ID;
  description?: string;
  model: string;
  system_prompt?: string;
  tools?: string[];
  skills?: string[];
  metadata?: Record<string, unknown>;
}
