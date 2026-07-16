import {
  RELAY_ACCEPTED_COUNT_BUCKETS,
  RELAY_EVIDENCE_LIMITS,
  isRelayWorkflowEvidence,
  type RelayWorkflowEvidence,
} from "../../contracts/relay-workflow-evidence";
import type { RelayWorkflowAggregate } from "../../contracts/relay-workflow-status";
import { RELAY_WORKFLOW_TOTAL_KEYS } from "../../contracts/relay-workflow-status";

export type { RelayWorkflowAggregate } from "../../contracts/relay-workflow-status";

const DURATION_BUCKETS_MS = [
  10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 60_000, 3_600_000,
] as const;

type CounterGroup = Record<string, number>;

type MutableAggregate = RelayWorkflowAggregate;

export type RelayWorkflowEvidenceRecorder = {
  record(evidence: unknown): void;
  recordLateConnectionClosed?(delta: {
    workflowOwner: RelayWorkflowEvidence["workflowOwner"];
    operation: RelayWorkflowEvidence["operation"];
    outcome: RelayWorkflowEvidence["outcome"];
  }): void;
};

export class RelayWorkflowCollector implements RelayWorkflowEvidenceRecorder {
  private readonly aggregates = new Map<string, MutableAggregate>();
  private readonly counterLimit: number;
  private readonly onChange: () => void;
  private invalid = 0;

  constructor(options: { counterLimit?: number; onChange?: () => void } = {}) {
    const requestedLimit = options.counterLimit;
    this.counterLimit = typeof requestedLimit === "number" &&
      Number.isFinite(requestedLimit) && Number.isInteger(requestedLimit) &&
      requestedLimit > 0
      ? Math.min(requestedLimit, RELAY_EVIDENCE_LIMITS.count)
      : RELAY_EVIDENCE_LIMITS.count;
    this.onChange = options.onChange ?? (() => {});
  }

  get invalidCount(): number {
    return this.invalid;
  }

  record(evidence: unknown): void {
    if (!isRelayWorkflowEvidence(evidence)) {
      this.invalid = this.add(this.invalid, 1);
      return;
    }

    const key = [
      evidence.workflowOwner,
      evidence.operation,
      evidence.outcome,
    ].join("|");
    const aggregate = this.aggregates.get(key) ?? this.createAggregate(evidence);
    if (aggregate.samples >= this.counterLimit) {
      aggregate.overflowed = this.add(aggregate.overflowed, 1);
      this.aggregates.set(key, aggregate);
      this.notifyChange();
      return;
    }

    aggregate.samples = this.add(aggregate.samples, 1);
    const totals = {
      attempts: evidence.work.attempts,
      targets: evidence.work.targets,
      connectionsOpened: evidence.connections.opened,
      connectionsClosed: evidence.connections.closed,
      connectionsReused: evidence.connections.reused,
      lateConnectionsClosed: evidence.connections.lateClosed,
      requestsSent: evidence.relay.requestsSent,
      eventsPublished: evidence.relay.eventsPublished,
      eventsReceived: evidence.relay.eventsReceived,
      requestBytes: evidence.relay.requestBytes,
      eventBytesSent: evidence.relay.eventBytesSent,
      eventBytesReceived: evidence.relay.eventBytesReceived,
      uniqueResults: evidence.results.unique,
      duplicates: evidence.results.duplicates,
      coalescedOperations: evidence.results.coalescedOperations,
      eose: evidence.terminal.eose,
      terminalClosed: evidence.terminal.closed,
      connectFailed: evidence.terminal.connectFailed,
      timedOut: evidence.terminal.timedOut,
      cancelled: evidence.terminal.cancelled,
      rejected: evidence.publishing.rejected,
      ownerRetries: evidence.publishing.ownerRetries,
    };
    Object.entries(totals).forEach(([name, value]) => {
      aggregate.totals[name] = this.add(aggregate.totals[name] ?? 0, value);
    });
    aggregate.acceptedCountBuckets[evidence.publishing.acceptedCountBucket] =
      this.add(
        aggregate.acceptedCountBuckets[evidence.publishing.acceptedCountBucket] ?? 0,
        1,
      );
    if (evidence.timingMs.firstResult === null) {
      aggregate.firstResultMs.none = this.add(aggregate.firstResultMs.none ?? 0, 1);
    } else {
      this.addDuration(aggregate.firstResultMs, evidence.timingMs.firstResult);
    }
    this.addDuration(aggregate.completionMs, evidence.timingMs.completion);
    this.aggregates.set(key, aggregate);
    this.notifyChange();
  }

  recordLateConnectionClosed(delta: {
    workflowOwner: RelayWorkflowEvidence["workflowOwner"];
    operation: RelayWorkflowEvidence["operation"];
    outcome: RelayWorkflowEvidence["outcome"];
  }): void {
    const key = [delta.workflowOwner, delta.operation, delta.outcome].join("|");
    const aggregate = this.aggregates.get(key) ?? this.createAggregate(delta);
    aggregate.totals.connectionsOpened = this.add(
      aggregate.totals.connectionsOpened ?? 0,
      1,
    );
    aggregate.totals.connectionsClosed = this.add(
      aggregate.totals.connectionsClosed ?? 0,
      1,
    );
    aggregate.totals.lateConnectionsClosed = this.add(
      aggregate.totals.lateConnectionsClosed ?? 0,
      1,
    );
    this.aggregates.set(key, aggregate);
    this.notifyChange();
  }

  snapshot(): RelayWorkflowAggregate[] {
    return [...this.aggregates.values()]
      .sort((left, right) =>
        [left.workflowOwner, left.operation, left.outcome].join("|")
          .localeCompare([right.workflowOwner, right.operation, right.outcome].join("|"))
      )
      .map((aggregate) => structuredClone(aggregate));
  }

  drain(): RelayWorkflowAggregate[] {
    const aggregates = this.snapshot();
    this.aggregates.clear();
    return aggregates;
  }

  private createAggregate(evidence: Pick<
    RelayWorkflowEvidence,
    "workflowOwner" | "operation" | "outcome"
  >): MutableAggregate {
    return {
      schemaVersion: 1,
      workflowOwner: evidence.workflowOwner,
      operation: evidence.operation,
      outcome: evidence.outcome,
      samples: 0,
      overflowed: 0,
      totals: Object.fromEntries(RELAY_WORKFLOW_TOTAL_KEYS.map((key) => [key, 0])),
      acceptedCountBuckets: Object.fromEntries(
        RELAY_ACCEPTED_COUNT_BUCKETS.map((bucket) => [bucket, 0]),
      ),
      firstResultMs: {},
      completionMs: {},
    };
  }

  private addDuration(group: CounterGroup, durationMs: number): void {
    const bucket = DURATION_BUCKETS_MS.find((upperBound) =>
      durationMs <= upperBound
    ) ?? DURATION_BUCKETS_MS.at(-1)!;
    group[String(bucket)] = this.add(group[String(bucket)] ?? 0, 1);
  }

  private add(current: number, increment: number): number {
    return Math.min(this.counterLimit, current + increment);
  }

  private notifyChange(): void {
    try {
      this.onChange();
    } catch {
      // Evidence scheduling never affects relay work.
    }
  }
}
