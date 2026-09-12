export type ConversationPublishState = {
  turns: Set<string>;
  calls: Set<string>;
  results: Map<string, string>;
  deliverables: Map<string, string>;
};

export function createConversationPublishState(): ConversationPublishState {
  return {
    turns: new Set(),
    calls: new Set(),
    results: new Map(),
    deliverables: new Map(),
  };
}

export function shouldPublishTurn(
  state: ConversationPublishState,
  turn: string,
): boolean {
  if (!turn || state.turns.has(turn)) return false;
  state.turns.add(turn);
  return true;
}

function pairKey(turn: string, id: string): string {
  return JSON.stringify([turn, id]);
}

export function shouldPublishCall(
  state: ConversationPublishState,
  turn: string,
  callId: string,
): boolean {
  if (!turn || !callId) return false;
  const key = pairKey(turn, callId);
  if (state.calls.has(key)) return false;
  state.calls.add(key);
  return true;
}

export function shouldPublishResult(
  state: ConversationPublishState,
  turn: string,
  callId: string,
  isError: boolean,
): boolean {
  if (!turn || !callId) return false;
  const key = pairKey(turn, callId);
  const signature = isError ? "error" : "success";
  if (state.results.get(key) === signature) return false;
  state.results.set(key, signature);
  return true;
}

export function shouldPublishDeliverables(
  state: ConversationPublishState,
  turn: string,
  paths: readonly string[],
): boolean {
  if (!turn) return false;
  const normalized = [...new Set(paths.filter((path) => path.length > 0))].sort();
  if (normalized.length === 0) return false;
  const signature = JSON.stringify(normalized);
  if (state.deliverables.get(turn) === signature) return false;
  state.deliverables.set(turn, signature);
  return true;
}
