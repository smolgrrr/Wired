import type { Event } from "nostr-tools";

/**
 * PROTOTYPE — do not ship this module as a production traversal.
 *
 * Question: can a bounded-subscription traversal resolve deep, wide, and
 * >100-result reply graphs without a handoff omission, and which parent-set
 * strategy should each runtime implement through its existing transport seam?
 */

export type ReplyFrontierCandidate = "frontier-once" | "cumulative-fixpoint";

export type ReplyFrontierIncompleteReason =
  | "deadline"
  | "cancelled"
  | "connect-failed"
  | "relay-closed"
  | "pass-bound";

export type ReplyFrontierQueryResult =
  | { state: "complete" }
  | { state: "incomplete"; reason: Exclude<ReplyFrontierIncompleteReason, "pass-bound"> };

export type ReplyFrontierState = {
  candidate: ReplyFrontierCandidate;
  rootIds: string[];
  knownIds: string[];
  frontierIds: string[];
  pass: number;
  terminal: boolean;
  completion: "running" | "settled" | ReplyFrontierIncompleteReason;
};

export type ReplyFrontierQuery = (input: {
  candidate: ReplyFrontierCandidate;
  parentIds: readonly string[];
  pass: number;
  onEvent(event: Event, relayUrl: string): void;
}) => Promise<ReplyFrontierQueryResult>;

export type ReplyFrontierRun = {
  state: ReplyFrontierState;
  eventIds: string[];
  queryCount: number;
  requestParentCounts: number[];
  deliveredEvents: number;
  repeatedDeliveries: number;
  peakSubscriptions: number;
  initialResultLatencyMs: number | null;
  completionLatencyMs: number;
};

export type PrototypeLiveHandle = {
  close(): void;
};

export type OpenPrototypeLiveQuery = (input: {
  parentIds: readonly string[];
  onEvent(event: Event, relayUrl: string): void;
  onEose(): void;
}) => PrototypeLiveHandle;

export function startOverlappingLivePrototype({
  rootIds,
  open,
  onEvent = () => {},
}: {
  rootIds: readonly string[];
  open: OpenPrototypeLiveQuery;
  onEvent?: (event: Event, relayUrl: string) => void;
}) {
  const knownIds = new Set(rootIds.map((id) => id.toLowerCase()));
  let current: PrototypeLiveHandle | null = null;
  let successor: PrototypeLiveHandle | null = null;
  let dirty = false;
  let closed = false;
  let replacements = 0;
  let activeSubscriptions = 0;
  let peakSubscriptions = 0;
  let resolveReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  const owned = (handle: PrototypeLiveHandle): PrototypeLiveHandle => {
    activeSubscriptions += 1;
    peakSubscriptions = Math.max(peakSubscriptions, activeSubscriptions);
    let handleClosed = false;
    return {
      close() {
        if (handleClosed) return;
        handleClosed = true;
        activeSubscriptions -= 1;
        handle.close();
      },
    };
  };
  const accept = (event: Event, relayUrl: string) => {
    const id = event.id.toLowerCase();
    const isNew = !knownIds.has(id);
    knownIds.add(id);
    if (!isNew || closed) return;
    onEvent(event, relayUrl);
    dirty = true;
    if (!successor) startSuccessor();
  };
  const openQuery = (
    parentIds: readonly string[],
    onEose: () => void,
  ) => owned(open({ parentIds, onEvent: accept, onEose }));
  function startSuccessor() {
    if (closed || successor) return;
    dirty = false;
    replacements += 1;
    const previous = current;
    const next = openQuery([...knownIds], () => {
      if (closed || successor !== next) return;
      previous?.close();
      current = next;
      successor = null;
      if (dirty) startSuccessor();
      else resolveReady();
    });
    successor = next;
  }

  current = openQuery([...knownIds], () => {
    if (!successor) resolveReady();
  });

  return {
    ready,
    close() {
      if (closed) return;
      closed = true;
      successor?.close();
      current?.close();
      successor = null;
      current = null;
    },
    snapshot() {
      return {
        knownIds: [...knownIds],
        replacements,
        activeSubscriptions,
        peakSubscriptions,
      };
    },
  };
}

export function createReplyFrontierState(
  candidate: ReplyFrontierCandidate,
  rootIds: readonly string[],
): ReplyFrontierState {
  const normalizedRoots = [...new Set(rootIds.map((id) => id.toLowerCase()))];
  return {
    candidate,
    rootIds: normalizedRoots,
    knownIds: normalizedRoots,
    frontierIds: normalizedRoots,
    pass: 0,
    terminal: normalizedRoots.length === 0,
    completion: normalizedRoots.length === 0 ? "settled" : "running",
  };
}

export function planReplyFrontierPass(
  state: ReplyFrontierState,
  parentChunkSize: number,
): string[][] {
  if (state.terminal) return [];
  const parentIds = state.candidate === "frontier-once"
    ? state.frontierIds
    : state.knownIds;
  const chunks: string[][] = [];
  for (let index = 0; index < parentIds.length; index += parentChunkSize) {
    chunks.push(parentIds.slice(index, index + parentChunkSize));
  }
  return chunks;
}

export function completeReplyFrontierPass(
  state: ReplyFrontierState,
  discoveredIds: readonly string[],
): ReplyFrontierState {
  const known = new Set(state.knownIds);
  const nextFrontier: string[] = [];
  discoveredIds.forEach((id) => {
    const normalized = id.toLowerCase();
    if (known.has(normalized)) return;
    known.add(normalized);
    nextFrontier.push(normalized);
  });
  const terminal = nextFrontier.length === 0;
  return {
    ...state,
    knownIds: [...known],
    frontierIds: nextFrontier,
    pass: state.pass + 1,
    terminal,
    completion: terminal ? "settled" : "running",
  };
}

export async function runReplyFrontierPrototype({
  candidate,
  rootIds,
  query,
  parentChunkSize = 50,
  maxPasses = 100,
}: {
  candidate: ReplyFrontierCandidate;
  rootIds: readonly string[];
  query: ReplyFrontierQuery;
  parentChunkSize?: number;
  maxPasses?: number;
}): Promise<ReplyFrontierRun> {
  const startedAt = Date.now();
  let state = createReplyFrontierState(candidate, rootIds);
  const eventIds = new Set<string>();
  const requestParentCounts: number[] = [];
  let deliveredEvents = 0;
  let initialResultLatencyMs: number | null = null;
  let queryCount = 0;

  while (!state.terminal && state.pass < maxPasses) {
    const discoveredThisPass = new Set<string>();
    const chunks = planReplyFrontierPass(state, parentChunkSize);
    let incompleteReason: ReplyFrontierIncompleteReason | undefined;
    for (const parentIds of chunks) {
      queryCount += 1;
      requestParentCounts.push(parentIds.length);
      const result = await query({
        candidate,
        parentIds,
        pass: state.pass + 1,
        onEvent(event) {
          deliveredEvents += 1;
          initialResultLatencyMs ??= Date.now() - startedAt;
          const id = event.id.toLowerCase();
          eventIds.add(id);
          discoveredThisPass.add(id);
        },
      });
      if (result.state === "incomplete") {
        incompleteReason = result.reason;
        break;
      }
    }
    if (incompleteReason) {
      state = {
        ...state,
        pass: state.pass + 1,
        terminal: true,
        completion: incompleteReason,
      };
      break;
    }
    state = completeReplyFrontierPass(state, [...discoveredThisPass]);
  }

  if (!state.terminal) {
    state = {
      ...state,
      terminal: true,
      completion: "pass-bound",
    };
  }

  return {
    state,
    eventIds: [...eventIds],
    queryCount,
    requestParentCounts,
    deliveredEvents,
    repeatedDeliveries: deliveredEvents - eventIds.size,
    peakSubscriptions: 1,
    initialResultLatencyMs,
    completionLatencyMs: Date.now() - startedAt,
  };
}
