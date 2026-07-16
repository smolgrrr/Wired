import { Event, Filter, Relay, Subscription } from "nostr-tools";
import { normalizeURL } from "nostr-tools/utils";
import type { SubCallback } from "./types";
import type {
  BrowserRelayAccess,
  FiniteQuery,
  QueryHandle,
} from "./browser-relay-access";
import {
  startBrowserFiniteQuery,
  type BrowserQueryEvidencePrimitives,
  type RelayLocation,
} from "./browser-finite-query";
import {
  RELAY_EVIDENCE_LIMITS,
  relayAcceptedCountBucket,
  relayWorkflowOutcome,
  type RelayWorkflowEvidence,
} from "../contracts/relay-workflow-evidence";
import type { RelayWorkflowEvidenceRecorder } from "./evidence/relay-workflow-collector";

const RELAY_CONNECT_TIMEOUT_MS = 4_000;
const MAX_PENDING_EVIDENCE_TASKS = 100;

export type SubscribeOptions = {
  closeOnEose?: boolean;
  relayUrls?: readonly string[];
  onEose?: () => void;
};

type RelayPoolOptions = {
  workflowEvidence?: RelayWorkflowEvidenceRecorder;
  scheduleEvidence?: (task: () => void) => void;
};

type InFlightPublish = {
  promise: Promise<Set<string>>;
  coalescedOperations: number;
};

type PublishSettlement = "accepted" | "rejected" | "closed";

type InFlightConnection = {
  mapKey: string;
  normalizedUrl: string;
  promise: Promise<RelayLocation | undefined>;
  waiters: Set<symbol>;
  lateEvidence?: {
    owner: NonNullable<FiniteQuery["workflowOwner"]>;
    state: "timed-out" | "cancelled";
  };
};

export class RelayPool implements BrowserRelayAccess {
  private readonly relays = new Map<string, Relay>();
  private readonly relaysByNormalizedUrl = new Map<string, RelayLocation>();
  private readonly subscriptionsByRelay = new Map<string, Set<Subscription>>();
  private readonly closeListenersByRelay = new Map<string, Set<() => void>>();
  private readonly inFlightConnections = new Map<string, InFlightConnection>();
  private defaultRelayUrls = new Set<string>();
  private readonly inFlightPublishes = new Map<string, InFlightPublish>();
  private readonly workflowEvidence?: RelayWorkflowEvidenceRecorder;
  private readonly scheduleEvidence: (task: () => void) => void;
  private readonly evidenceTasks: Array<() => void> = [];
  private evidenceFlushScheduled = false;
  private droppedEvidenceTasks = 0;

  constructor(options: RelayPoolOptions = {}) {
    this.workflowEvidence = options.workflowEvidence;
    this.scheduleEvidence = options.scheduleEvidence ?? ((task) => {
      setTimeout(task, 0);
    });
  }

  get connectedUrls(): string[] {
    return [...this.relays.keys()];
  }

  get isConnected(): boolean {
    return this.defaultRelayUrls.size > 0;
  }

  get workflowEvidenceStatus(): { pending: number; dropped: number } {
    return {
      pending: this.evidenceTasks.length,
      dropped: this.droppedEvidenceTasks,
    };
  }

  async connect(urls: readonly string[]): Promise<void> {
    this.defaultRelayUrls = new Set(urls);
    await this.ensureConnected(urls);
  }

  async connectConfigured(urls: readonly string[]): Promise<void> {
    await this.connect(urls);
  }

  async ensureConnected(urls: readonly string[]): Promise<void> {
    const toConnect = urls.filter((url) => !this.relays.has(url));
    await Promise.allSettled(toConnect.map((url) => this.connectRelay(url)));
  }

  private async connectRelay(url: string): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const connection = this.acquireConnection(url);

    try {
      await Promise.race([
        connection.promise,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => {
              timedOut = true;
              reject(new Error("Relay connection timed out"));
            },
            RELAY_CONNECT_TIMEOUT_MS,
          );
        }),
      ]);
    } catch {
      // Relay unavailable; other relays may still connect.
    } finally {
      connection.release(timedOut ? "timed-out" : undefined);
      if (timeout) clearTimeout(timeout);
    }
  }

  startFiniteQuery(query: FiniteQuery): QueryHandle {
    return startBrowserFiniteQuery(query, {
      normalizeCoverage: (urls) => this.normalizeCoverage(urls),
      findRelay: (relayUrl) => this.findRelay(relayUrl),
      acquireConnection: (relayUrl, workflowOwner) =>
        this.acquireConnection(relayUrl, workflowOwner),
      addCloseListener: (relayUrl, listener) =>
        this.addRelayCloseListener(relayUrl, listener),
      trackSubscription: (mapKey, subscription) =>
        this.trackSubscription(mapKey, subscription),
      untrackSubscription: (mapKey, subscription) =>
        this.untrackSubscription(mapKey, subscription),
      recordCompletion: query.workflowOwner && this.workflowEvidence
        ? (primitives) => this.deferEvidence(() =>
          this.recordQueryEvidence(query.workflowOwner!, primitives)
        )
        : undefined,
    });
  }

  private normalizeCoverage(urls: readonly string[]): string[] {
    const normalized = new Set<string>();
    for (const url of urls) {
      try {
        normalized.add(normalizeURL(url));
      } catch {
        const preserved = url.trim();
        if (preserved) normalized.add(preserved);
      }
    }
    return [...normalized];
  }

  private findRelay(relayUrl: string): { mapKey: string; relay: Relay } | undefined {
    const exact = this.relays.get(relayUrl);
    if (exact) return { mapKey: relayUrl, relay: exact };
    const normalizedRelayUrl = this.normalizeCoverage([relayUrl])[0] ?? relayUrl;
    return this.relaysByNormalizedUrl.get(normalizedRelayUrl);
  }

  private acquireConnection(
    relayUrl: string,
    workflowOwner?: FiniteQuery["workflowOwner"],
  ): {
    promise: Promise<RelayLocation | undefined>;
    release: (state?: "eose" | "closed" | "connect-failed" | "timed-out" | "cancelled") => void;
  } {
    const normalizedRelayUrl = this.normalizeCoverage([relayUrl])[0] ?? relayUrl;
    const connected = this.relaysByNormalizedUrl.get(normalizedRelayUrl);
    if (connected?.relay.connected) {
      return { promise: Promise.resolve(connected), release: () => {} };
    }

    let connection = this.inFlightConnections.get(normalizedRelayUrl);
    if (!connection) {
      const waiters = new Set<symbol>();
      connection = {
        mapKey: relayUrl,
        normalizedUrl: normalizedRelayUrl,
        promise: Promise.resolve(undefined),
        waiters,
      };
      const ownedConnection = connection;
      connection.promise = Relay.connect(relayUrl).then((relay) => {
        this.inFlightConnections.delete(normalizedRelayUrl);
        if (waiters.size === 0) {
          relay.close();
          if (ownedConnection.lateEvidence && this.workflowEvidence) {
            this.deferEvidence(() => this.recordLateConnectionEvidence(
              ownedConnection.lateEvidence!,
            ));
          }
          return undefined;
        }
        return this.registerRelay(
          ownedConnection.mapKey,
          ownedConnection.normalizedUrl,
          relay,
        );
      }).catch((error: unknown) => {
        this.inFlightConnections.delete(normalizedRelayUrl);
        throw error;
      });
      this.inFlightConnections.set(normalizedRelayUrl, connection);
    }

    const waiter = Symbol(normalizedRelayUrl);
    connection.waiters.add(waiter);
    let released = false;
    return {
      promise: connection.promise,
      release: (state) => {
        if (released) return;
        released = true;
        connection.waiters.delete(waiter);
        if (workflowOwner && (state === "timed-out" || state === "cancelled")) {
          connection.lateEvidence ??= { owner: workflowOwner, state };
        }
      },
    };
  }

  private registerRelay(
    mapKey: string,
    normalizedUrl: string,
    relay: Relay,
  ): RelayLocation {
    const existing = this.relaysByNormalizedUrl.get(normalizedUrl);
    if (existing && existing.relay !== relay) {
      relay.close();
      return existing;
    }

    this.relays.set(mapKey, relay);
    const location = { mapKey, relay };
    this.relaysByNormalizedUrl.set(normalizedUrl, location);
    this.installRelayCloseHandler(mapKey, normalizedUrl, relay);
    return location;
  }

  private installRelayCloseHandler(
    mapKey: string,
    normalizedUrl: string,
    relay: Relay,
  ): void {
    relay.onclose = () => {
      if (this.relays.get(mapKey) !== relay) return;
      this.relays.delete(mapKey);
      if (this.relaysByNormalizedUrl.get(normalizedUrl)?.relay === relay) {
        this.relaysByNormalizedUrl.delete(normalizedUrl);
      }
      const listeners = this.closeListenersByRelay.get(normalizedUrl) ?? [];
      this.closeListenersByRelay.delete(normalizedUrl);
      [...listeners].forEach((listener) => listener());
      // A terminal relay cannot deliver more events. Count legacy open
      // subscriptions as EOSE so aggregate traversals can continue immediately.
      const subscriptions = this.subscriptionsByRelay.get(mapKey) ?? [];
      this.subscriptionsByRelay.delete(mapKey);
      [...subscriptions].forEach((subscription) => {
        subscription.receivedEose();
      });
    };
  }

  private addRelayCloseListener(relayUrl: string, listener: () => void): () => void {
    const listeners = this.closeListenersByRelay.get(relayUrl) ?? new Set<() => void>();
    listeners.add(listener);
    this.closeListenersByRelay.set(relayUrl, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.closeListenersByRelay.delete(relayUrl);
    };
  }

  private trackSubscription(mapKey: string, subscription: Subscription): void {
    const tracked = this.subscriptionsByRelay.get(mapKey) ?? new Set<Subscription>();
    tracked.add(subscription);
    this.subscriptionsByRelay.set(mapKey, tracked);
  }

  private untrackSubscription(mapKey: string | undefined, subscription: Subscription): void {
    if (!mapKey) return;
    const tracked = this.subscriptionsByRelay.get(mapKey);
    tracked?.delete(subscription);
    if (tracked?.size === 0) this.subscriptionsByRelay.delete(mapKey);
  }

  subscribe(filter: Filter, cb: SubCallback, options: SubscribeOptions = {}): Subscription[] {
    const { closeOnEose = false, relayUrls, onEose } = options;
    const targetUrls = relayUrls ?? [...this.defaultRelayUrls];
    const subscriptions: Subscription[] = [];
    let connectedUrls = targetUrls.filter((url) => this.relays.get(url)?.connected);
    if (connectedUrls.length !== targetUrls.length) {
      connectedUrls = [...new Set(targetUrls.flatMap((url) => {
        const connected = this.findRelay(url);
        return connected?.relay.connected ? [connected.mapKey] : [];
      }))];
    }
    let eoseCount = 0;

    const handleEose = (sub: Subscription) => {
      eoseCount += 1;
      if (eoseCount >= connectedUrls.length) {
        onEose?.();
      }
      if (closeOnEose) {
        sub.close();
      }
    };

    for (const url of connectedUrls) {
      const relay = this.relays.get(url);
      if (!relay) continue;

      const sub = relay.subscribe([filter], {
        onevent(event) {
          cb(event, relay.url);
        },
        onclose: () => {
          const tracked = this.subscriptionsByRelay.get(url);
          tracked?.delete(sub);
          if (tracked?.size === 0) {
            this.subscriptionsByRelay.delete(url);
          }
        },
      });

      const tracked = this.subscriptionsByRelay.get(url) ?? new Set<Subscription>();
      tracked.add(sub);
      this.subscriptionsByRelay.set(url, tracked);

      if (closeOnEose || onEose) {
        sub.oneose = () => handleEose(sub);
      }

      subscriptions.push(sub);
    }

    if ((closeOnEose || onEose) && connectedUrls.length === 0) {
      onEose?.();
    }

    return subscriptions;
  }

  publish(event: Event): Promise<Set<string>> {
    const existing = this.inFlightPublishes.get(event.id);
    if (existing) {
      existing.coalescedOperations += 1;
      return existing.promise;
    }

    const operation: InFlightPublish = {
      promise: Promise.resolve(new Set()),
      coalescedOperations: 0,
    };
    const publish = this.publishToRelays(event, operation).finally(() => {
      if (this.inFlightPublishes.get(event.id) === operation) {
        this.inFlightPublishes.delete(event.id);
      }
    });
    operation.promise = publish;
    this.inFlightPublishes.set(event.id, operation);
    return publish;
  }

  private recordQueryEvidence(
    workflowOwner: NonNullable<FiniteQuery["workflowOwner"]>,
    primitives: BrowserQueryEvidencePrimitives,
  ): void {
    const terminal = {
      eose: 0,
      closed: 0,
      connectFailed: 0,
      timedOut: 0,
      cancelled: 0,
    };
    primitives.completion.targets.forEach(({ state }) => {
      if (state === "eose") terminal.eose += 1;
      else if (state === "closed") terminal.closed += 1;
      else if (state === "connect-failed") terminal.connectFailed += 1;
      else if (state === "timed-out") terminal.timedOut += 1;
      else terminal.cancelled += 1;
    });
    const targetCount = primitives.completion.targets.length;
    const evidence: RelayWorkflowEvidence = {
      schemaVersion: 1,
      workflowOwner,
      operation: "query",
      outcome: relayWorkflowOutcome({
        targets: targetCount,
        successfulTargets: terminal.eose,
        timedOut: terminal.timedOut,
        cancelled: terminal.cancelled,
      }),
      work: { attempts: 1, targets: targetCount },
      connections: { opened: 0, closed: terminal.closed, reused: 0, lateClosed: 0 },
      relay: {
        requestsSent: Math.min(RELAY_EVIDENCE_LIMITS.count, primitives.requestsSent),
        eventsPublished: 0,
        eventsReceived: Math.min(
          RELAY_EVIDENCE_LIMITS.count,
          primitives.completion.receivedEvents,
        ),
        requestBytes: Math.min(RELAY_EVIDENCE_LIMITS.bytes, primitives.requestBytes),
        eventBytesSent: 0,
        eventBytesReceived: 0,
      },
      results: {
        unique: Math.min(RELAY_EVIDENCE_LIMITS.count, primitives.uniqueResults),
        duplicates: Math.min(RELAY_EVIDENCE_LIMITS.count, primitives.duplicates),
        coalescedOperations: 0,
      },
      terminal,
      publishing: { acceptedCountBucket: "none", rejected: 0, ownerRetries: 0 },
      timingMs: {
        firstResult: primitives.firstResultMs === null
          ? null
          : this.boundedDuration(primitives.firstResultMs),
        completion: this.boundedDuration(primitives.completionMs),
      },
    };
    this.workflowEvidence?.record(evidence);
  }

  private recordLateConnectionEvidence(
    late: {
      owner: NonNullable<FiniteQuery["workflowOwner"]>;
      state: "timed-out" | "cancelled";
    },
  ): void {
    this.workflowEvidence?.recordLateConnectionClosed?.({
      workflowOwner: late.owner,
      operation: "query",
      outcome: late.state === "cancelled" ? "cancelled" : "timed-out",
    });
  }

  private boundedDuration(durationMs: number): number {
    return Math.min(
      RELAY_EVIDENCE_LIMITS.durationMs,
      Math.max(0, Math.round(durationMs)),
    );
  }

  private async publishToRelays(
    event: Event,
    operation: InFlightPublish,
  ): Promise<Set<string>> {
    const startedAt = this.workflowEvidence ? performance.now() : 0;
    const accepted = new Set<string>();
    const targetUrls = [...this.defaultRelayUrls];
    const connectedTargets = targetUrls.flatMap((url) => {
      const relay = this.relays.get(url) ?? this.findRelay(url)?.relay;
      return relay ? [{ url, relay }] : [];
    });

    const settlements: PublishSettlement[] = await Promise.all(
      connectedTargets.map(async ({ url, relay }) => {
        try {
          await relay.publish(event);
          accepted.add(url);
          return "accepted" as const;
        } catch {
          return relay.connected ? "rejected" as const : "closed" as const;
        }
      }),
    );

    if (!this.workflowEvidence) return accepted;

    const completion = performance.now();
    const terminalClosed = settlements.filter((result) => result === "closed").length;
    const explicitRejections = settlements.filter((result) =>
      result === "rejected"
    ).length;
    let eventFrameBytes = 0;
    try {
      eventFrameBytes = new TextEncoder().encode(
        JSON.stringify(["EVENT", event]),
      ).byteLength;
    } catch {
      // Byte evidence is optional and cannot affect publication completion.
    }
    const primitives = {
      acceptedCount: accepted.size,
      coalescedOperations: operation.coalescedOperations,
      completionMs: completion - startedAt,
      connectedTargetCount: connectedTargets.length,
      eventFrameBytes,
      explicitRejections,
      terminalClosed,
      targetCount: targetUrls.length,
    };
    this.deferEvidence(() => this.recordPublishEvidence(primitives));

    return accepted;
  }

  private recordPublishEvidence(
    primitives: {
      acceptedCount: number;
      coalescedOperations: number;
      completionMs: number;
      connectedTargetCount: number;
      eventFrameBytes: number;
      explicitRejections: number;
      terminalClosed: number;
      targetCount: number;
    },
  ): void {
    // Only ACKed or explicitly rejected publishes confirm that the relay parsed
    // the EVENT. A terminal close is retained separately and never treated as
    // evidence of relay traffic.
    const confirmedEventFrames =
      primitives.acceptedCount + primitives.explicitRejections;
    const evidence: RelayWorkflowEvidence = {
      schemaVersion: 1,
      workflowOwner: "wired.browser.publish",
      operation: "publish",
      outcome: relayWorkflowOutcome({
        targets: primitives.targetCount,
        successfulTargets: primitives.acceptedCount,
        timedOut: 0,
        cancelled: 0,
      }),
      work: { attempts: 1, targets: primitives.targetCount },
      connections: {
        opened: 0,
        closed: primitives.terminalClosed,
        reused: primitives.connectedTargetCount,
        lateClosed: 0,
      },
      relay: {
        requestsSent: 0,
        eventsPublished: confirmedEventFrames,
        eventsReceived: 0,
        requestBytes: 0,
        eventBytesSent: Math.min(
          RELAY_EVIDENCE_LIMITS.bytes,
          primitives.eventFrameBytes * confirmedEventFrames,
        ),
        eventBytesReceived: 0,
      },
      results: {
        unique: 0,
        duplicates: 0,
        coalescedOperations: primitives.coalescedOperations,
      },
      terminal: {
        eose: 0,
        closed: primitives.terminalClosed,
        connectFailed: primitives.targetCount - primitives.connectedTargetCount,
        timedOut: 0,
        cancelled: 0,
      },
      publishing: {
        acceptedCountBucket: relayAcceptedCountBucket(
          primitives.acceptedCount,
          primitives.targetCount,
        ),
        rejected: primitives.explicitRejections,
        ownerRetries: 0,
      },
      timingMs: {
        firstResult: null,
        completion: Math.min(
          RELAY_EVIDENCE_LIMITS.durationMs,
          Math.max(0, Math.round(primitives.completionMs)),
        ),
      },
    };
    this.workflowEvidence?.record(evidence);
  }

  private deferEvidence(task: () => void): void {
    if (this.evidenceTasks.length >= MAX_PENDING_EVIDENCE_TASKS) {
      this.evidenceTasks.shift();
      this.incrementDroppedEvidence();
    }
    this.evidenceTasks.push(task);
    if (this.evidenceFlushScheduled) return;

    this.evidenceFlushScheduled = true;
    try {
      this.scheduleEvidence(() => {
        this.evidenceFlushScheduled = false;
        const pending = this.evidenceTasks.splice(0);
        pending.forEach((pendingTask) => {
          try {
            pendingTask();
          } catch {
            // Evidence collection cannot affect publication completion.
            this.incrementDroppedEvidence();
          }
        });
      });
    } catch {
      this.evidenceFlushScheduled = false;
      const dropped = this.evidenceTasks.splice(0).length;
      this.incrementDroppedEvidence(dropped);
    }
  }

  private incrementDroppedEvidence(count = 1): void {
    this.droppedEvidenceTasks = Math.min(
      RELAY_EVIDENCE_LIMITS.count,
      this.droppedEvidenceTasks + count,
    );
  }
}
