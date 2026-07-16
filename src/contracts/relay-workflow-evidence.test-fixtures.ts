import type { RelayWorkflowEvidence } from "./relay-workflow-evidence";

export const validRelayWorkflowEvidence = {
  query: {
    schemaVersion: 1,
    workflowOwner: "wired.browser.thread",
    operation: "query",
    outcome: "completed",
    work: { attempts: 1, targets: 2 },
    connections: { opened: 2, closed: 2, reused: 0, lateClosed: 0 },
    relay: {
      requestsSent: 4,
      eventsPublished: 0,
      eventsReceived: 6,
      requestBytes: 512,
      eventBytesSent: 0,
      eventBytesReceived: 2_048,
    },
    results: { unique: 3, duplicates: 3, coalescedOperations: 0 },
    terminal: {
      eose: 4,
      closed: 0,
      connectFailed: 0,
      timedOut: 0,
      cancelled: 0,
    },
    publishing: {
      acceptedCountBucket: "none",
      rejected: 0,
      ownerRetries: 0,
    },
    timingMs: { firstResult: 8, completion: 31 },
  },
} satisfies Record<string, RelayWorkflowEvidence>;
