import {
  Relay,
  type Event,
  type Filter,
  type Subscription,
  useWebSocketImplementation,
} from "nostr-tools";
import { normalizeURL } from "nostr-tools/utils";
import { WebSocket } from "ws";

useWebSocketImplementation(WebSocket);

export type RelayConnectionOutcome = {
  relayUrl: string;
  state: "connected" | "connect-failed" | "timed-out" | "cancelled";
};

export type RelaySessionOptions = {
  relayUrls: readonly string[];
  connectDeadlineMs: number;
  signal?: AbortSignal;
};

export type FiniteRelayQuery = {
  filters: Filter[];
  relayUrls?: readonly string[];
  deadlineMs: number;
  signal?: AbortSignal;
  onEvent(event: Event, relayUrl: string): void;
};

export type RelayCompletionState =
  | "eose"
  | "closed"
  | "connect-failed"
  | "timed-out"
  | "cancelled";

export type QueryCompletion = {
  reason: "settled" | "deadline" | "cancelled";
  targets: readonly {
    relayUrl: string;
    state: RelayCompletionState;
  }[];
  receivedEvents: number;
};

export interface FiniteRelaySession {
  ensureRelays(
    relayUrls: readonly string[],
    connectDeadlineMs: number,
  ): Promise<readonly RelayConnectionOutcome[]>;
  query(input: FiniteRelayQuery): Promise<QueryCompletion>;
}

function normalizeRelayUrls(relayUrls: readonly string[]): string[] {
  const normalized = new Set<string>();
  relayUrls.forEach((relayUrl) => {
    try {
      normalized.add(normalizeURL(relayUrl));
    } catch {
      const preserved = relayUrl.trim();
      if (preserved) normalized.add(preserved);
    }
  });
  return [...normalized];
}

type ConnectionAttempt = {
  outcome: Promise<RelayConnectionOutcome>;
  settle(state: RelayConnectionOutcome["state"], relay?: Relay): void;
  settled: boolean;
  state?: RelayConnectionOutcome["state"];
};

type QueryTarget = {
  relayUrl: string;
  state?: RelayCompletionState;
  subscription?: Subscription;
};

class WiredServerFiniteRelaySession implements FiniteRelaySession {
  private readonly relays = new Map<string, Relay>();
  private readonly connectionAttempts = new Map<string, ConnectionAttempt>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly activeQueryCancels = new Set<() => void>();
  private closed = false;

  async ensureRelays(
    relayUrls: readonly string[],
    connectDeadlineMs: number,
  ): Promise<readonly RelayConnectionOutcome[]> {
    return Promise.all(
      normalizeRelayUrls(relayUrls).map((relayUrl) => {
        if (this.closed) {
          return Promise.resolve({
            relayUrl,
            state: "cancelled" as const,
          });
        }
        if (this.relays.has(relayUrl)) {
          return Promise.resolve({ relayUrl, state: "connected" as const });
        }

        const existing = this.connectionAttempts.get(relayUrl);
        const attempt = existing ?? this.startConnection(relayUrl);
        if (attempt.settled) return attempt.outcome;

        const timer = setTimeout(
          () => attempt.settle("timed-out"),
          Math.max(0, connectDeadlineMs),
        );
        this.timers.add(timer);
        return attempt.outcome.finally(() => {
          clearTimeout(timer);
          this.timers.delete(timer);
        });
      }),
    );
  }

  private startConnection(relayUrl: string): ConnectionAttempt {
    let resolveOutcome!: (outcome: RelayConnectionOutcome) => void;
    const attempt: ConnectionAttempt = {
      outcome: new Promise((resolve) => {
        resolveOutcome = resolve;
      }),
      settled: false,
      settle: (state, relay) => {
        if (attempt.settled) {
          if (relay) relay.close();
          return;
        }
        attempt.settled = true;
        attempt.state = state;
        if (state === "connected" && relay && !this.closed) {
          this.relays.set(relayUrl, relay);
        } else if (relay) {
          relay.close();
        }
        resolveOutcome({ relayUrl, state });
      },
    };
    this.connectionAttempts.set(relayUrl, attempt);
    void Promise.resolve()
      .then(() => Relay.connect(relayUrl))
      .then((relay) => {
        attempt.settle(this.closed ? "cancelled" : "connected", relay);
      })
      .catch(() => attempt.settle(this.closed ? "cancelled" : "connect-failed"));
    return attempt;
  }

  query(input: FiniteRelayQuery): Promise<QueryCompletion> {
    const relayUrls = input.relayUrls
      ? normalizeRelayUrls(input.relayUrls)
      : [...this.connectionAttempts.keys()];
    const targets: QueryTarget[] = relayUrls.map((relayUrl) => ({ relayUrl }));
    let receivedEvents = 0;
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let resolveCompletion!: (completion: QueryCompletion) => void;
    const completion = new Promise<QueryCompletion>((resolve) => {
      resolveCompletion = resolve;
    });

    const cleanupTarget = (target: QueryTarget) => {
      const subscription = target.subscription;
      target.subscription = undefined;
      if (!subscription) return;
      try {
        subscription.close();
      } catch {
        // A terminal relay may already have closed its subscription.
      }
    };

    const finish = (reason: QueryCompletion["reason"]) => {
      if (finished) return;
      finished = true;
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(timer);
        timer = undefined;
      }
      input.signal?.removeEventListener("abort", cancel);
      this.activeQueryCancels.delete(cancel);
      const unfinishedState: RelayCompletionState = reason === "cancelled"
        ? "cancelled"
        : "timed-out";
      targets.forEach((target) => {
        target.state ??= unfinishedState;
        cleanupTarget(target);
      });
      resolveCompletion({
        reason,
        targets: targets.map(({ relayUrl, state }) => ({
          relayUrl,
          state: state as RelayCompletionState,
        })),
        receivedEvents,
      });
    };

    const maybeFinish = () => {
      if (targets.every((target) => target.state !== undefined)) {
        finish("settled");
      }
    };

    const settleTarget = (target: QueryTarget, state: RelayCompletionState) => {
      if (finished || target.state) return;
      target.state = state;
      cleanupTarget(target);
      maybeFinish();
    };

    const subscribeTarget = (target: QueryTarget, relay: Relay) => {
      if (finished || target.state) return;
      if (!relay.connected) {
        settleTarget(target, "closed");
        return;
      }
      try {
        const subscription = relay.subscribe(input.filters, {
          onevent: (event) => {
            if (finished || target.state) return;
            receivedEvents += 1;
            input.onEvent(event, target.relayUrl);
          },
          oneose: () => settleTarget(target, "eose"),
          onclose: () => settleTarget(target, "closed"),
        });
        if (finished || target.state) {
          subscription.close();
          return;
        }
        target.subscription = subscription;
      } catch {
        settleTarget(target, "closed");
      }
    };

    const startTarget = (target: QueryTarget) => {
      const relay = this.relays.get(target.relayUrl);
      if (relay) {
        subscribeTarget(target, relay);
        return;
      }
      const attempt = this.connectionAttempts.get(target.relayUrl);
      if (!attempt) {
        settleTarget(target, "connect-failed");
        return;
      }
      if (attempt.settled) {
        settleTarget(
          target,
          attempt.state === "connect-failed"
            ? "connect-failed"
            : attempt.state === "cancelled"
              ? "cancelled"
              : "timed-out",
        );
        return;
      }
      void attempt.outcome.then((outcome) => {
        if (finished || target.state) return;
        const connectedRelay = this.relays.get(target.relayUrl);
        if (outcome.state === "connected" && connectedRelay) {
          subscribeTarget(target, connectedRelay);
        } else {
          settleTarget(
            target,
            outcome.state === "connected" ? "closed" : outcome.state,
          );
        }
      });
    };

    function cancel() {
      finish("cancelled");
    }

    if (targets.length === 0) {
      finish("settled");
    } else if (this.closed || input.signal?.aborted) {
      finish("cancelled");
    } else {
      this.activeQueryCancels.add(cancel);
      input.signal?.addEventListener("abort", cancel, { once: true });
      timer = setTimeout(() => finish("deadline"), Math.max(0, input.deadlineMs));
      this.timers.add(timer);
      targets.forEach(startTarget);
    }

    return completion;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    [...this.activeQueryCancels].forEach((cancel) => cancel());
    this.connectionAttempts.forEach((attempt) => attempt.settle("cancelled"));
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
    this.relays.forEach((relay) => {
      try {
        relay.close();
      } catch {
        // A terminal relay may already have closed its socket.
      }
    });
    this.relays.clear();
  }
}

export async function withFiniteRelaySession<T>(
  options: RelaySessionOptions,
  run: (session: FiniteRelaySession) => Promise<T> | T,
): Promise<T> {
  const session = new WiredServerFiniteRelaySession();
  const cancel = () => session.close();
  if (options.signal?.aborted) cancel();
  else options.signal?.addEventListener("abort", cancel, { once: true });
  try {
    await session.ensureRelays(options.relayUrls, options.connectDeadlineMs);
    return await run(session);
  } finally {
    options.signal?.removeEventListener("abort", cancel);
    session.close();
  }
}
