import { Event, Filter, Relay, Subscription } from "nostr-tools";
import type { SubCallback } from "./types";
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

export class RelayPool {
  private readonly relays = new Map<string, Relay>();
  private readonly subscriptionsByRelay = new Map<string, Set<Subscription>>();
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

  async ensureConnected(urls: readonly string[]): Promise<void> {
    const toConnect = urls.filter((url) => !this.relays.has(url));
    await Promise.allSettled(toConnect.map((url) => this.connectRelay(url)));
  }

  private async connectRelay(url: string): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      const relay = await Promise.race([
        Relay.connect(url),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("Relay connection timed out")),
            RELAY_CONNECT_TIMEOUT_MS,
          );
        }),
      ]);
      this.relays.set(url, relay);
      relay.onclose = () => {
        if (this.relays.get(url) !== relay) return;
        this.relays.delete(url);
        // A terminal relay cannot deliver more events. Count its open subscriptions
        // as EOSE so aggregate traversals can continue immediately and their
        // library EOSE timers are cleared.
        const subscriptions = this.subscriptionsByRelay.get(url) ?? [];
        this.subscriptionsByRelay.delete(url);
        [...subscriptions].forEach((subscription) => {
          subscription.receivedEose();
        });
      };
    } catch {
      // Relay unavailable; other relays may still connect.
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  subscribe(filter: Filter, cb: SubCallback, options: SubscribeOptions = {}): Subscription[] {
    const { closeOnEose = false, relayUrls, onEose } = options;
    const targetUrls = relayUrls ?? [...this.defaultRelayUrls];
    const subscriptions: Subscription[] = [];
    const connectedUrls = targetUrls.filter((url) => this.relays.get(url)?.connected);
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

  private async publishToRelays(
    event: Event,
    operation: InFlightPublish,
  ): Promise<Set<string>> {
    const startedAt = this.workflowEvidence ? performance.now() : 0;
    const accepted = new Set<string>();
    const targetUrls = [...this.defaultRelayUrls];
    const connectedTargets = targetUrls.flatMap((url) => {
      const relay = this.relays.get(url);
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
