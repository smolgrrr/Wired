import type { Relay, Subscription } from "nostr-tools";
import type {
  FiniteQuery,
  QueryCompletion,
  QueryHandle,
  RelayCompletionState,
} from "./browser-relay-access";

export type RelayLocation = { mapKey: string; relay: Relay };

export type FiniteConnectionLease = {
  promise: Promise<RelayLocation | undefined>;
  release(state?: RelayCompletionState): void;
};

export type BrowserQueryEvidencePrimitives = {
  completion: QueryCompletion;
  completionMs: number;
  duplicates: number;
  firstResultMs: number | null;
  requestBytes: number;
  requestsSent: number;
  uniqueResults: number;
};

export type BrowserFiniteQueryTransport = {
  normalizeCoverage(urls: readonly string[]): string[];
  findRelay(relayUrl: string): RelayLocation | undefined;
  acquireConnection(
    relayUrl: string,
    workflowOwner: FiniteQuery["workflowOwner"],
  ): FiniteConnectionLease;
  addCloseListener(relayUrl: string, listener: () => void): () => void;
  trackSubscription(mapKey: string, subscription: Subscription): void;
  untrackSubscription(mapKey: string | undefined, subscription: Subscription): void;
  recordCompletion?(primitives: BrowserQueryEvidencePrimitives): void;
};

type QueryTarget = {
  relayUrl: string;
  state?: RelayCompletionState;
  subscription?: Subscription;
  relayMapKey?: string;
  removeCloseListener?: () => void;
  releaseConnection?: FiniteConnectionLease["release"];
};

export function startBrowserFiniteQuery(
  query: FiniteQuery,
  transport: BrowserFiniteQueryTransport,
): QueryHandle {
  const relayUrls = transport.normalizeCoverage([
    ...query.coverage.configuredRelayUrls,
    ...(query.coverage.hintedRelayUrls ?? []),
  ]);
  const targets: QueryTarget[] = relayUrls.map((relayUrl) => ({ relayUrl }));
  const startedAt = performance.now();
  const uniqueEventIds = new Set<string>();
  let receivedEvents = 0;
  let duplicates = 0;
  let firstResultMs: number | null = null;
  let requestBytes = 0;
  let requestsSent = 0;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let finished = false;
  let resolveDone!: (completion: QueryCompletion) => void;
  const done = new Promise<QueryCompletion>((resolve) => {
    resolveDone = resolve;
  });

  const cleanupTarget = (target: QueryTarget) => {
    target.releaseConnection?.(target.state);
    target.releaseConnection = undefined;
    target.removeCloseListener?.();
    target.removeCloseListener = undefined;
    const subscription = target.subscription;
    target.subscription = undefined;
    if (!subscription) return;
    transport.untrackSubscription(target.relayMapKey, subscription);
    subscription.close();
  };

  const finish = (reason: QueryCompletion["reason"]) => {
    if (finished) return;
    finished = true;
    if (deadline) {
      clearTimeout(deadline);
      deadline = undefined;
    }
    query.signal?.removeEventListener("abort", cancel);
    const unfinishedState: RelayCompletionState = reason === "cancelled"
      ? "cancelled"
      : "timed-out";
    for (const target of targets) {
      target.state ??= unfinishedState;
      cleanupTarget(target);
    }
    const completion: QueryCompletion = {
      reason,
      targets: targets.map(({ relayUrl, state }) => ({
        relayUrl,
        state: state as RelayCompletionState,
      })),
      receivedEvents,
    };
    try {
      transport.recordCompletion?.({
        completion,
        completionMs: performance.now() - startedAt,
        duplicates,
        firstResultMs,
        requestBytes,
        requestsSent,
        uniqueResults: uniqueEventIds.size,
      });
    } catch {
      // Status evidence cannot affect query completion.
    }
    resolveDone(completion);
  };

  const maybeFinish = () => {
    if (!finished && targets.every((target) => target.state !== undefined)) {
      finish("settled");
    }
  };

  const settleTarget = (target: QueryTarget, state: RelayCompletionState) => {
    if (finished || target.state) return;
    target.state = state;
    cleanupTarget(target);
    maybeFinish();
  };

  const subscribeTarget = (
    target: QueryTarget,
    relayMapKey: string,
    relay: Relay,
  ) => {
    if (finished || target.state) return;
    if (!relay.connected) {
      settleTarget(target, "closed");
      return;
    }
    target.relayMapKey = relayMapKey;
    target.removeCloseListener = transport.addCloseListener(
      target.relayUrl,
      () => settleTarget(target, "closed"),
    );
    try {
      const subscription = relay.subscribe(query.filters, {
        onevent: (event) => {
          if (finished || target.state) return;
          receivedEvents += 1;
          if (firstResultMs === null) firstResultMs = performance.now() - startedAt;
          if (uniqueEventIds.has(event.id)) duplicates += 1;
          else uniqueEventIds.add(event.id);
          query.onEvent(event, target.relayUrl);
        },
        oneose: () => settleTarget(target, "eose"),
        onclose: () => settleTarget(target, "closed"),
      });
      if (finished || target.state) {
        subscription.close();
        return;
      }
      target.subscription = subscription;
      transport.trackSubscription(relayMapKey, subscription);
      requestsSent += 1;
      if (typeof subscription.id === "string") {
        try {
          requestBytes += new TextEncoder().encode(
            JSON.stringify(["REQ", subscription.id, ...query.filters]),
          ).byteLength;
        } catch {
          // Optional byte evidence cannot affect relay work.
        }
      }
    } catch {
      settleTarget(target, "closed");
    }
  };

  const startTarget = (target: QueryTarget) => {
    const existing = transport.findRelay(target.relayUrl);
    if (existing?.relay.connected) {
      subscribeTarget(target, existing.mapKey, existing.relay);
      return;
    }

    const connection = transport.acquireConnection(
      target.relayUrl,
      query.workflowOwner,
    );
    target.releaseConnection = connection.release;
    void connection.promise.then((registered) => {
      target.releaseConnection?.();
      target.releaseConnection = undefined;
      if (finished || target.state || !registered) return;
      subscribeTarget(target, registered.mapKey, registered.relay);
    }).catch(() => {
      settleTarget(target, "connect-failed");
    });
  };

  function cancel() {
    finish("cancelled");
  }

  if (targets.length === 0) {
    finish("settled");
  } else if (query.signal?.aborted) {
    finish("cancelled");
  } else {
    query.signal?.addEventListener("abort", cancel, { once: true });
    deadline = setTimeout(
      () => finish("deadline"),
      Math.max(0, query.completionDeadlineMs),
    );
    targets.forEach(startTarget);
  }

  return { done, close: cancel };
}
