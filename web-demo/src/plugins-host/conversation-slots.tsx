"use client";
import {
  Component,
  memo,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  getSlotEntries,
  subscribeSlots,
  type SlotContribution,
  type SlotRenderProps,
} from "./slots";

/**
 * Host-side mount points for conversation slot contributions (H4-d).
 * The chat UI renders ConversationSlotMount("conversation.chat.turnTail")
 * after each completed assistant turn; entries come from the slots
 * service sorted by priority.
 */

export function ConversationSlotMount({
  name,
  sessionId,
  turn,
}: {
  name: string;
  sessionId: string;
  turn?: string;
}) {
  const entries = useSyncExternalStore(subscribeSlots, () =>
    getSlotEntries(name),
  );
  if (entries.length === 0) return null;
  return (
    <>
      {entries.map((entry) => (
        <SlotContributionView
          key={entry.key}
          contribution={entry.contribution}
          sessionId={sessionId}
          turn={turn}
        />
      ))}
    </>
  );
}

function SlotContributionView({
  contribution,
  sessionId,
  turn,
}: {
  contribution: SlotContribution;
  sessionId: string;
  turn?: string;
}) {
  const bag = useMemo<Record<string, unknown>>(() => {
    try {
      return (
        (contribution.inject?.(sessionId) as
          | Record<string, unknown>
          | undefined) ?? {}
      );
    } catch (err) {
      console.error(
        "[slots] inject failed for " + contribution.name + ":",
        err,
      );
      return {};
    }
  }, [contribution, sessionId]);
  const props = useMemo<SlotRenderProps>(
    () => ({ sessionId, turn, bag }),
    [sessionId, turn, bag],
  );
  if (contribution.component !== undefined) {
    const Contrib = contribution.component as unknown as (
      props: Record<string, unknown>,
    ) => ReactNode;
    // DSH slot hosts render the contribution component with the inject()
    // bag spread at the top level alongside the positional fields.
    return (
      <SlotErrorBoundary name={contribution.name}>
        <Contrib {...props.bag} sessionId={props.sessionId} turn={props.turn} />
      </SlotErrorBoundary>
    );
  }
  if (contribution.mount !== undefined) {
    return <SlotDomMount contribution={contribution} props={props} />;
  }
  return null;
}

/** A throwing contribution must never take down the chat (host parity). */
class SlotErrorBoundary extends Component<
  { name: string; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(err: Error) {
    console.error("[slots] contribution render failed:", err);
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

const SlotDomMount = memo(function SlotDomMount({
  contribution,
  props,
}: {
  contribution: SlotContribution;
  props: SlotRenderProps;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    contribution.mount?.(el, props);
    return () => contribution.unmount?.(el);
  }, [contribution, props]);
  return <div ref={ref} />;
});
