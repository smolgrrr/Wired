import type { Event, Filter } from "nostr-tools";
import type {
  FiniteRelaySession,
  QueryCompletion,
} from "./serverRelaySession.js";

const PARENT_CHUNK_SIZE = 50;
const DEFAULT_MAX_PASSES = 60;

export type SnapshotReplyTraversalIncompleteReason =
  | "cancelled"
  | "connect-failed"
  | "deadline"
  | "relay-closed"
  | "pass-bound";

type SnapshotReplyTraversalProgress = {
  passes: number;
  queries: number;
  parentCount: number;
};

export type SnapshotReplyTraversalCompletion =
  | ({ state: "complete" } & SnapshotReplyTraversalProgress)
  | ({
      state: "incomplete";
      reason: SnapshotReplyTraversalIncompleteReason;
    } & SnapshotReplyTraversalProgress);

export type CompleteSnapshotReplyTraversalOptions = {
  session: FiniteRelaySession;
  initialParentIds: readonly string[];
  knownEventIds?: readonly string[];
  relayUrls: readonly string[];
  since?: number;
  deadlineMs: number;
  maxPasses?: number;
  signal?: AbortSignal;
  onCompletion?: (completion: SnapshotReplyTraversalCompletion) => void;
};

export type CompleteSnapshotReplyTraversalResult = {
  events: Event[];
  relayHintsByEventId: Map<string, string[]>;
  completion: SnapshotReplyTraversalCompletion;
};

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function replyFilter(parentIds: string[], since: number | undefined): Filter {
  return {
    "#e": parentIds,
    kinds: [1],
    ...(since === undefined ? {} : { since }),
  };
}

function addRelayHint(
  relayHintsByEventId: Map<string, string[]>,
  eventId: string,
  relayUrl: string,
): void {
  const normalizedRelay = relayUrl.replace(/\/+$/, "");
  if (!normalizedRelay) return;
  const existing = relayHintsByEventId.get(eventId) ?? [];
  if (!existing.includes(normalizedRelay)) {
    relayHintsByEventId.set(eventId, [...existing, normalizedRelay]);
  }
}

export function snapshotQueryIncompleteReason(
  completion: QueryCompletion,
): SnapshotReplyTraversalIncompleteReason | null {
  if (
    completion.reason === "cancelled" ||
    completion.targets.some((target) => target.state === "cancelled")
  ) {
    return "cancelled";
  }
  if (
    completion.reason === "deadline" ||
    completion.targets.some((target) => target.state === "timed-out")
  ) {
    return "deadline";
  }
  if (completion.targets.some((target) => target.state === "connect-failed")) {
    return "connect-failed";
  }
  if (completion.targets.some((target) => target.state === "closed")) {
    return "relay-closed";
  }
  return completion.targets.every((target) => target.state === "eose")
    ? null
    : "relay-closed";
}

export async function traverseCompleteSnapshotReplies(
  options: CompleteSnapshotReplyTraversalOptions,
): Promise<CompleteSnapshotReplyTraversalResult> {
  const knownIds = new Set(
    [...(options.knownEventIds ?? []), ...options.initialParentIds]
      .map((eventId) => eventId.toLowerCase()),
  );
  const parentIds = new Set(
    options.initialParentIds.map((eventId) => eventId.toLowerCase()),
  );
  const events = new Map<string, Event>();
  const relayHintsByEventId = new Map<string, string[]>();
  const deadlineAt = Date.now() + Math.max(0, options.deadlineMs);
  const maxPasses = Math.max(1, options.maxPasses ?? DEFAULT_MAX_PASSES);
  let passes = 0;
  let queries = 0;

  const finish = (
    completion: SnapshotReplyTraversalCompletion,
  ): CompleteSnapshotReplyTraversalResult => {
    options.onCompletion?.(completion);
    return {
      events: [...events.values()],
      relayHintsByEventId,
      completion,
    };
  };
  const progress = (): SnapshotReplyTraversalProgress => ({
    passes,
    queries,
    parentCount: parentIds.size,
  });
  const incomplete = (
    reason: SnapshotReplyTraversalIncompleteReason,
  ): CompleteSnapshotReplyTraversalResult =>
    finish({ state: "incomplete", reason, ...progress() });

  if (options.signal?.aborted) return incomplete("cancelled");
  if (parentIds.size === 0) {
    return finish({ state: "complete", ...progress() });
  }
  if (options.relayUrls.length === 0) return incomplete("connect-failed");

  for (passes = 1; passes <= maxPasses; passes += 1) {
    let discoveredThisPass = 0;
    const passParentIds = [...parentIds];

    for (const parentChunk of chunks(passParentIds, PARENT_CHUNK_SIZE)) {
      if (options.signal?.aborted) return incomplete("cancelled");
      const remainingMs = deadlineAt - Date.now();
      if (remainingMs <= 0) return incomplete("deadline");

      queries += 1;
      const completion = await options.session.query({
        filters: [replyFilter(parentChunk, options.since)],
        relayUrls: options.relayUrls,
        deadlineMs: remainingMs,
        signal: options.signal,
        onEvent(event, relayUrl) {
          const eventId = event.id.toLowerCase();
          addRelayHint(relayHintsByEventId, eventId, relayUrl);
          if (event.kind !== 1) return;

          const discoveredParent = !parentIds.has(eventId);
          parentIds.add(eventId);
          if (knownIds.has(eventId)) {
            if (discoveredParent) discoveredThisPass += 1;
            return;
          }
          knownIds.add(eventId);
          events.set(eventId, event);
          if (discoveredParent) discoveredThisPass += 1;
        },
      });
      const reason = snapshotQueryIncompleteReason(completion);
      if (reason) return incomplete(reason);
    }

    if (discoveredThisPass === 0) {
      return finish({ state: "complete", ...progress() });
    }
  }

  passes = maxPasses;
  return incomplete("pass-bound");
}
