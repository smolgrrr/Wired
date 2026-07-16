export const RELAY_WORKFLOW_EVIDENCE_SCHEMA_VERSION = 1 as const;

export const RELAY_WORKFLOW_OWNERS = [
  "wired.browser.thread",
  "wired.browser.feed",
  "wired.browser.notifications",
  "wired.browser.quotes",
  "wired.browser.profiles",
  "wired.browser.publish",
  "wired.server.preview",
  "wired.server.feed-snapshot",
  "wired-admin.server.feed-snapshot",
  "wired-admin.server.wired-account-publish",
  "wired-admin.server.confession-publish",
  "wired-admin.server.revenue-receipt-publish",
  "wired-admin.server.revenue-profile-publish",
  "wired-admin.relay-gateway",
] as const;

export const RELAY_WORKFLOW_OPERATIONS = ["query", "publish"] as const;
export const RELAY_WORKFLOW_OUTCOMES = [
  "completed",
  "partial",
  "timed-out",
  "cancelled",
  "failed",
] as const;
export const RELAY_ACCEPTED_COUNT_BUCKETS = [
  "none",
  "one",
  "multiple",
  "all",
] as const;

export const RELAY_EVIDENCE_LIMITS = {
  count: 1_000_000,
  bytes: 1_000_000_000,
  durationMs: 3_600_000,
} as const;

type WorkflowOwner = (typeof RELAY_WORKFLOW_OWNERS)[number];
type WorkflowOperation = (typeof RELAY_WORKFLOW_OPERATIONS)[number];
type WorkflowOutcome = (typeof RELAY_WORKFLOW_OUTCOMES)[number];
type AcceptedCountBucket = (typeof RELAY_ACCEPTED_COUNT_BUCKETS)[number];

export type RelayWorkflowOutcomeInput = {
  targets: number;
  successfulTargets: number;
  timedOut: number;
  cancelled: number;
};

export function relayAcceptedCountBucket(
  accepted: number,
  targets: number,
): AcceptedCountBucket {
  if (!isBoundedInteger(accepted, RELAY_EVIDENCE_LIMITS.count) ||
    !isBoundedInteger(targets, RELAY_EVIDENCE_LIMITS.count) ||
    accepted > targets) {
    throw new RangeError("Accepted and target counts must be bounded and consistent");
  }
  if (accepted === 0) return "none";
  if (accepted === targets) return "all";
  if (accepted === 1) return "one";
  return "multiple";
}

export function relayWorkflowOutcome(
  input: RelayWorkflowOutcomeInput,
): WorkflowOutcome {
  const values = [
    input.targets,
    input.successfulTargets,
    input.timedOut,
    input.cancelled,
  ];
  if (values.some((value) =>
    !isBoundedInteger(value, RELAY_EVIDENCE_LIMITS.count)) ||
    input.successfulTargets + input.timedOut + input.cancelled > input.targets) {
    throw new RangeError("Outcome counts must be bounded and consistent");
  }
  if (input.cancelled > 0) return "cancelled";
  if (input.targets === 0) return "completed";
  if (input.successfulTargets === 0 && input.timedOut > 0) return "timed-out";
  if (input.successfulTargets === 0) return "failed";
  if (input.successfulTargets < input.targets) return "partial";
  return "completed";
}

export type RelayWorkflowEvidence = {
  schemaVersion: typeof RELAY_WORKFLOW_EVIDENCE_SCHEMA_VERSION;
  workflowOwner: WorkflowOwner;
  operation: WorkflowOperation;
  outcome: WorkflowOutcome;
  work: {
    attempts: number;
    targets: number;
  };
  connections: {
    opened: number;
    closed: number;
    reused: number;
    lateClosed: number;
  };
  relay: {
    requestsSent: number;
    eventsPublished: number;
    eventsReceived: number;
    requestBytes: number;
    eventBytesSent: number;
    eventBytesReceived: number;
  };
  results: {
    unique: number;
    duplicates: number;
    coalescedOperations: number;
  };
  terminal: {
    eose: number;
    closed: number;
    connectFailed: number;
    timedOut: number;
    cancelled: number;
  };
  publishing: {
    acceptedCountBucket: AcceptedCountBucket;
    rejected: number;
    ownerRetries: number;
  };
  timingMs: {
    firstResult: number | null;
    completion: number;
  };
};

const countSchema = {
  type: "integer",
  minimum: 0,
  maximum: RELAY_EVIDENCE_LIMITS.count,
} as const;
const byteCountSchema = {
  type: "integer",
  minimum: 0,
  maximum: RELAY_EVIDENCE_LIMITS.bytes,
} as const;
const durationSchema = {
  type: "integer",
  minimum: 0,
  maximum: RELAY_EVIDENCE_LIMITS.durationMs,
} as const;

export const RELAY_WORKFLOW_EVIDENCE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:wired:relay-workflow-evidence:v1",
  title: "Relay workflow evidence v1",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "workflowOwner",
    "operation",
    "outcome",
    "work",
    "connections",
    "relay",
    "results",
    "terminal",
    "publishing",
    "timingMs",
  ],
  properties: {
    schemaVersion: { const: RELAY_WORKFLOW_EVIDENCE_SCHEMA_VERSION },
    workflowOwner: { enum: RELAY_WORKFLOW_OWNERS },
    operation: { enum: RELAY_WORKFLOW_OPERATIONS },
    outcome: {
      enum: RELAY_WORKFLOW_OUTCOMES,
      description: "Derived by the v1 outcome precedence conformance cases.",
    },
    work: { $ref: "#/$defs/work" },
    connections: { $ref: "#/$defs/connections" },
    relay: { $ref: "#/$defs/relay" },
    results: { $ref: "#/$defs/results" },
    terminal: { $ref: "#/$defs/terminal" },
    publishing: { $ref: "#/$defs/publishing" },
    timingMs: { $ref: "#/$defs/timingMs" },
  },
  $defs: {
    work: {
      type: "object",
      additionalProperties: false,
      required: ["attempts", "targets"],
      properties: {
        attempts: countSchema,
        targets: countSchema,
      },
    },
    connections: {
      type: "object",
      additionalProperties: false,
      required: ["opened", "closed", "reused", "lateClosed"],
      properties: {
        opened: countSchema,
        closed: countSchema,
        reused: countSchema,
        lateClosed: countSchema,
      },
    },
    relay: {
      type: "object",
      additionalProperties: false,
      required: [
        "requestsSent",
        "eventsPublished",
        "eventsReceived",
        "requestBytes",
        "eventBytesSent",
        "eventBytesReceived",
      ],
      properties: {
        requestsSent: countSchema,
        eventsPublished: countSchema,
        eventsReceived: countSchema,
        requestBytes: byteCountSchema,
        eventBytesSent: byteCountSchema,
        eventBytesReceived: byteCountSchema,
      },
    },
    results: {
      type: "object",
      additionalProperties: false,
      required: ["unique", "duplicates", "coalescedOperations"],
      properties: {
        unique: countSchema,
        duplicates: countSchema,
        coalescedOperations: countSchema,
      },
    },
    terminal: {
      type: "object",
      additionalProperties: false,
      required: ["eose", "closed", "connectFailed", "timedOut", "cancelled"],
      properties: {
        eose: countSchema,
        closed: countSchema,
        connectFailed: countSchema,
        timedOut: countSchema,
        cancelled: countSchema,
      },
    },
    publishing: {
      type: "object",
      additionalProperties: false,
      required: ["acceptedCountBucket", "rejected", "ownerRetries"],
      properties: {
        acceptedCountBucket: {
          enum: RELAY_ACCEPTED_COUNT_BUCKETS,
          description: "none for zero; otherwise all wins before one or multiple.",
        },
        rejected: countSchema,
        ownerRetries: countSchema,
      },
    },
    timingMs: {
      type: "object",
      additionalProperties: false,
      required: ["firstResult", "completion"],
      properties: {
        firstResult: {
          anyOf: [durationSchema, { type: "null" }],
        },
        completion: durationSchema,
      },
    },
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length &&
    actualKeys.every((key) => keys.includes(key));
}

function isBoundedInteger(value: unknown, maximum: number): value is number {
  return Number.isInteger(value) && (value as number) >= 0 &&
    (value as number) <= maximum;
}

function isEnumValue<T extends string>(
  values: readonly T[],
  value: unknown,
): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function hasBoundedCounts(
  value: unknown,
  keys: readonly string[],
  maximum = RELAY_EVIDENCE_LIMITS.count,
): value is Record<string, number> {
  if (!isRecord(value) || !hasExactKeys(value, keys)) return false;
  return keys.every((key) => isBoundedInteger(value[key], maximum));
}

export function isRelayWorkflowEvidence(
  value: unknown,
): value is RelayWorkflowEvidence {
  if (!isRecord(value) || !hasExactKeys(value, [
    "schemaVersion",
    "workflowOwner",
    "operation",
    "outcome",
    "work",
    "connections",
    "relay",
    "results",
    "terminal",
    "publishing",
    "timingMs",
  ])) return false;

  if (
    value.schemaVersion !== RELAY_WORKFLOW_EVIDENCE_SCHEMA_VERSION ||
    !isEnumValue(RELAY_WORKFLOW_OWNERS, value.workflowOwner) ||
    !isEnumValue(RELAY_WORKFLOW_OPERATIONS, value.operation) ||
    !isEnumValue(RELAY_WORKFLOW_OUTCOMES, value.outcome)
  ) return false;

  if (!hasBoundedCounts(value.work, ["attempts", "targets"])) return false;
  if (!hasBoundedCounts(value.connections,
    ["opened", "closed", "reused", "lateClosed"])) return false;
  if (!hasBoundedCounts(value.results,
    ["unique", "duplicates", "coalescedOperations"])) return false;
  if (!hasBoundedCounts(value.terminal,
    ["eose", "closed", "connectFailed", "timedOut", "cancelled"])) return false;

  const relay = value.relay;
  if (!isRecord(relay) || !hasExactKeys(relay, [
    "requestsSent",
    "eventsPublished",
    "eventsReceived",
    "requestBytes",
    "eventBytesSent",
    "eventBytesReceived",
  ])) return false;
  if (!["requestsSent", "eventsPublished", "eventsReceived"].every(
    (key) => isBoundedInteger(relay[key], RELAY_EVIDENCE_LIMITS.count),
  )) return false;
  if (!["requestBytes", "eventBytesSent", "eventBytesReceived"].every(
    (key) => isBoundedInteger(relay[key], RELAY_EVIDENCE_LIMITS.bytes),
  )) return false;

  if (!isRecord(value.publishing) || !hasExactKeys(value.publishing,
    ["acceptedCountBucket", "rejected", "ownerRetries"])) return false;
  if (
    !isEnumValue(RELAY_ACCEPTED_COUNT_BUCKETS,
      value.publishing.acceptedCountBucket) ||
    !isBoundedInteger(value.publishing.rejected,
      RELAY_EVIDENCE_LIMITS.count) ||
    !isBoundedInteger(value.publishing.ownerRetries,
      RELAY_EVIDENCE_LIMITS.count)
  ) return false;

  if (!isRecord(value.timingMs) || !hasExactKeys(value.timingMs,
    ["firstResult", "completion"])) return false;
  const firstResult = value.timingMs.firstResult;
  return (
    (firstResult === null || isBoundedInteger(firstResult,
      RELAY_EVIDENCE_LIMITS.durationMs)) &&
    isBoundedInteger(value.timingMs.completion,
      RELAY_EVIDENCE_LIMITS.durationMs)
  );
}
