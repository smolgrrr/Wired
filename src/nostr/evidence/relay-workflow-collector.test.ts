import { describe, expect, it } from "vitest";
import { validRelayWorkflowEvidence } from "../../contracts/relay-workflow-evidence.test-fixtures";
import { RelayWorkflowCollector } from "./relay-workflow-collector";

describe("RelayWorkflowCollector", () => {
  it("aggregates approved fields into fixed buckets", () => {
    const collector = new RelayWorkflowCollector();

    collector.record(validRelayWorkflowEvidence.query);
    collector.record(validRelayWorkflowEvidence.query);

    expect(collector.snapshot()).toEqual([expect.objectContaining({
      schemaVersion: 1,
      workflowOwner: "wired.browser.thread",
      operation: "query",
      outcome: "completed",
      samples: 2,
      totals: expect.objectContaining({
        targets: 4,
        requestsSent: 8,
        uniqueResults: 6,
      }),
      completionMs: { "50": 2 },
    })]);
  });

  it("saturates counters and ignores invalid evidence", () => {
    const collector = new RelayWorkflowCollector({ counterLimit: 2 });

    collector.record(validRelayWorkflowEvidence.query);
    collector.record(validRelayWorkflowEvidence.query);
    collector.record(validRelayWorkflowEvidence.query);
    collector.record({ ...validRelayWorkflowEvidence.query, eventId: "forbidden" });

    expect(collector.snapshot()[0]).toMatchObject({ samples: 2, overflowed: 1 });
    expect(collector.invalidCount).toBe(1);
  });

  it("normalizes invalid counter limits", () => {
    const collector = new RelayWorkflowCollector({ counterLimit: Number.NaN });
    collector.record(validRelayWorkflowEvidence.query);

    expect(collector.snapshot()[0]?.samples).toBe(1);
  });
});
