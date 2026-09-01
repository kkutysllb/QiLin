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
  conversationSnapshot,
  subscribeConversation,
} from "./conversation-store";
import { boundTranslator } from "./locale";
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
  // DSH contract: the component's `turn` prop is a TurnLocation object —
  // the map key lives at `turn.turn` (ProducedFiles reads
  // `turnLocation.turn` as the collectReviews key). The registry-level
  // SlotRenderProps.turn stays the raw string id.
  const turnLocation = useMemo(
    () => (turn === undefined ? undefined : { turn }),
    [turn],
  );
  if (contribution.component !== undefined) {
    const Contrib = contribution.component as unknown as (
      props: Record<string, unknown>,
    ) => ReactNode;
    // DSH slot hosts render the contribution component with the inject()
    // bag spread at the top level alongside the positional fields.
    if (contribution.select !== undefined) {
      return (
        <SelectGatedContribution
          contribution={contribution}
          Contrib={Contrib}
          sessionId={sessionId}
          turn={turn}
          bag={props.bag}
        />
      );
    }
    return (
      <SlotErrorBoundary name={contribution.name}>
        <Contrib
          {...props.bag}
          sessionId={props.sessionId}
          turn={turnLocation}
        />
      </SlotErrorBoundary>
    );
  }
  if (contribution.mount !== undefined) {
    return (
      <SlotDomMount
        contribution={contribution}
        props={{ ...props, turn: turnLocation }}
      />
    );
  }
  return null;
}

/**
 * DSH turn-tail claim contract: a contribution carrying select(owner)
 * mounts only when its match is non-null, and the match becomes the
 * component's `matched` prop (file-review-tab ProducedFiles shape:
 * select reads the turn's own "fileReviewChanges" data first, falling
 * back to the built-in "deliverables" data). The host re-runs select
 * whenever the conversation face emits.
 */
function SelectGatedContribution({
  contribution,
  Contrib,
  sessionId,
  turn,
  bag,
}: {
  contribution: SlotContribution;
  Contrib: (props: Record<string, unknown>) => ReactNode;
  sessionId: string;
  turn?: string;
  bag: Record<string, unknown>;
}) {
  const snapshot = useSyncExternalStore(
    subscribeConversation,
    () => conversationSnapshot(sessionId),
    () => conversationSnapshot(sessionId),
  );
  const select = contribution.select;
  const matched = useMemo<string[] | null>(() => {
    if (select === undefined) return null;
    const location = snapshot.timeline.turns.get(turn ?? "");
    if (location === undefined) return null;
    try {
      // QiLin turns carry no seq currency; Infinity keeps every produced
      // entry (select's own guard is `produced.seq > seq`).
      const result = select({
        turn: location,
        seq: Number.POSITIVE_INFINITY,
      });
      return Array.isArray(result) && result.length > 0 ? result : null;
    } catch (err) {
      console.error(
        "[slots] select failed for " + contribution.name + ":",
        err,
      );
      return null;
    }
  }, [contribution.name, select, snapshot, turn]);
  if (matched === null) return null;
  const t =
    contribution.locale !== undefined
      ? boundTranslator(contribution.locale)
      : undefined;
  return (
    <SlotErrorBoundary name={contribution.name}>
      <Contrib
        {...bag}
        sessionId={sessionId}
        turn={turn === undefined ? undefined : { turn }}
        matched={matched}
        t={t}
      />
    </SlotErrorBoundary>
  );
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
