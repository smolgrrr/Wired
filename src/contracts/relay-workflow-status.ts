import {
  RELAY_ACCEPTED_COUNT_BUCKETS,
  RELAY_EVIDENCE_LIMITS,
  RELAY_WORKFLOW_OPERATIONS,
  RELAY_WORKFLOW_OUTCOMES,
  RELAY_WORKFLOW_OWNERS,
  type RelayWorkflowEvidence,
} from "./relay-workflow-evidence.js";

export const RELAY_WORKFLOW_STATUS_SCHEMA_VERSION = 1 as const;
export const RELAY_WORKFLOW_STATUS_SOURCES = [
  "wired-browser",
  "wired-server",
  "wired-admin",
] as const;
export const RELAY_PREVIEW_ENDPOINTS = ["thread-html", "thread-card"] as const;
export const RELAY_PREVIEW_OUTCOMES = [
  "snapshot-hit",
  "relay-fallback",
  "missing",
] as const;

export const RELAY_WORKFLOW_STATUS_LIMITS = {
  aggregatesPerEnvelope: 100,
  correlationsPerEnvelope: 1,
  envelopeBytes: 32_768,
  queuedEnvelopes: 100,
  rowsPerSourcePerDay: 1_000,
  requestsPerSourcePerMinute: 60,
  previewKeysPerDay: 1_000,
  retentionMs: 14 * 24 * 60 * 60 * 1_000,
} as const;

export const RELAY_WORKFLOW_TOTAL_KEYS = [
  "attempts",
  "targets",
  "connectionsOpened",
  "connectionsClosed",
  "connectionsReused",
  "lateConnectionsClosed",
  "requestsSent",
  "eventsPublished",
  "eventsReceived",
  "requestBytes",
  "eventBytesSent",
  "eventBytesReceived",
  "uniqueResults",
  "duplicates",
  "coalescedOperations",
  "eose",
  "terminalClosed",
  "connectFailed",
  "timedOut",
  "cancelled",
  "rejected",
  "ownerRetries",
] as const;

export const RELAY_WORKFLOW_DURATION_BUCKETS = [
  "10", "25", "50", "100", "250", "500", "1000", "2500", "5000",
  "10000", "60000", "3600000",
] as const;

type CounterGroup = Record<string, number>;

export type RelayWorkflowAggregate = {
  schemaVersion: 1;
  workflowOwner: RelayWorkflowEvidence["workflowOwner"];
  operation: RelayWorkflowEvidence["operation"];
  outcome: RelayWorkflowEvidence["outcome"];
  samples: number;
  overflowed: number;
  totals: CounterGroup;
  acceptedCountBuckets: CounterGroup;
  firstResultMs: CounterGroup;
  completionMs: CounterGroup;
};

export type RelayPreviewCorrelation = {
  workflowOwner: "wired.server.preview";
  endpoint: (typeof RELAY_PREVIEW_ENDPOINTS)[number];
  outcome: (typeof RELAY_PREVIEW_OUTCOMES)[number];
  dailyToken: string;
};

export type RelayWorkflowStatusEnvelope = {
  schemaVersion: typeof RELAY_WORKFLOW_STATUS_SCHEMA_VERSION;
  source: (typeof RELAY_WORKFLOW_STATUS_SOURCES)[number];
  collectedAt: number;
  aggregates: RelayWorkflowAggregate[];
  correlations: RelayPreviewCorrelation[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function isBoundedCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 &&
    (value as number) <= RELAY_EVIDENCE_LIMITS.count;
}

function isEnumValue<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function isCounterGroup(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[] = [],
): value is CounterGroup {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return requiredKeys.every((key) => keys.includes(key)) &&
    keys.every((key) => allowedKeys.includes(key) && isBoundedCount(value[key]));
}

function ownerMatchesSource(
  source: RelayWorkflowStatusEnvelope["source"],
  owner: RelayWorkflowEvidence["workflowOwner"],
): boolean {
  if (source === "wired-browser") return owner.startsWith("wired.browser.");
  if (source === "wired-server") return owner.startsWith("wired.server.");
  return owner.startsWith("wired-admin.");
}

export function isRelayWorkflowAggregate(value: unknown): value is RelayWorkflowAggregate {
  if (!isRecord(value) || !hasExactKeys(value, [
    "schemaVersion",
    "workflowOwner",
    "operation",
    "outcome",
    "samples",
    "overflowed",
    "totals",
    "acceptedCountBuckets",
    "firstResultMs",
    "completionMs",
  ])) return false;

  return value.schemaVersion === 1 &&
    isEnumValue(RELAY_WORKFLOW_OWNERS, value.workflowOwner) &&
    isEnumValue(RELAY_WORKFLOW_OPERATIONS, value.operation) &&
    isEnumValue(RELAY_WORKFLOW_OUTCOMES, value.outcome) &&
    isBoundedCount(value.samples) &&
    isBoundedCount(value.overflowed) &&
    isCounterGroup(value.totals, RELAY_WORKFLOW_TOTAL_KEYS, RELAY_WORKFLOW_TOTAL_KEYS) &&
    isCounterGroup(
      value.acceptedCountBuckets,
      RELAY_ACCEPTED_COUNT_BUCKETS,
      RELAY_ACCEPTED_COUNT_BUCKETS,
    ) &&
    isCounterGroup(value.firstResultMs, ["none", ...RELAY_WORKFLOW_DURATION_BUCKETS]) &&
    isCounterGroup(value.completionMs, RELAY_WORKFLOW_DURATION_BUCKETS);
}

function isPreviewCorrelation(value: unknown): value is RelayPreviewCorrelation {
  if (!isRecord(value) || !hasExactKeys(value, [
    "workflowOwner",
    "endpoint",
    "outcome",
    "dailyToken",
  ])) return false;
  return value.workflowOwner === "wired.server.preview" &&
    isEnumValue(RELAY_PREVIEW_ENDPOINTS, value.endpoint) &&
    isEnumValue(RELAY_PREVIEW_OUTCOMES, value.outcome) &&
    typeof value.dailyToken === "string" && /^[A-Za-z0-9_-]{16}$/.test(value.dailyToken);
}

export function isRelayWorkflowStatusEnvelope(
  value: unknown,
): value is RelayWorkflowStatusEnvelope {
  if (!isRecord(value) || !hasExactKeys(value, [
    "schemaVersion",
    "source",
    "collectedAt",
    "aggregates",
    "correlations",
  ])) return false;
  const source = value.source;
  if (value.schemaVersion !== RELAY_WORKFLOW_STATUS_SCHEMA_VERSION ||
    !isEnumValue(RELAY_WORKFLOW_STATUS_SOURCES, source) ||
    !Number.isSafeInteger(value.collectedAt) || (value.collectedAt as number) < 0 ||
    !Array.isArray(value.aggregates) ||
    value.aggregates.length > RELAY_WORKFLOW_STATUS_LIMITS.aggregatesPerEnvelope ||
    !Array.isArray(value.correlations) ||
    value.correlations.length > RELAY_WORKFLOW_STATUS_LIMITS.correlationsPerEnvelope ||
    value.aggregates.length + value.correlations.length === 0 ||
    (value.aggregates.length > 0 && value.correlations.length > 0)) return false;

  return value.aggregates.every((aggregate) =>
    isRelayWorkflowAggregate(aggregate) &&
    ownerMatchesSource(source, aggregate.workflowOwner)
  ) && value.correlations.every((correlation) =>
    source === "wired-server" && isPreviewCorrelation(correlation)
  );
}
