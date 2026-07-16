import { describe, expect, it, vi } from "vitest";
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

  it("seals and clears aggregate windows without exposing mutable state", () => {
    const onChange = vi.fn();
    const collector = new RelayWorkflowCollector({ onChange });
    collector.record(validRelayWorkflowEvidence.query);

    const sealed = collector.drain();
    sealed[0]!.samples = 999;

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(collector.snapshot()).toEqual([]);
  });

  it("adds late cleanup without creating another operation sample", () => {
    const collector = new RelayWorkflowCollector();
    const timedOut = {
      ...validRelayWorkflowEvidence.query,
      outcome: "timed-out" as const,
      work: { attempts: 1, targets: 1 },
      terminal: {
        eose: 0,
        closed: 0,
        connectFailed: 0,
        timedOut: 1,
        cancelled: 0,
      },
      timingMs: { firstResult: null, completion: 25 },
    };
    collector.record(timedOut);
    collector.recordLateConnectionClosed({
      workflowOwner: timedOut.workflowOwner,
      operation: "query",
      outcome: "timed-out",
    });

    const [aggregate] = collector.snapshot();
    expect(aggregate).toMatchObject({
      samples: 1,
      totals: expect.objectContaining({
        attempts: 1,
        targets: 1,
        timedOut: 1,
        connectionsOpened: 3,
        connectionsClosed: 3,
        lateConnectionsClosed: 1,
      }),
      completionMs: { "25": 1 },
    });
  });

  it("isolates change callback failures", () => {
    const collector = new RelayWorkflowCollector({
      onChange() { throw new Error("scheduler unavailable"); },
    });
    expect(() => collector.record(validRelayWorkflowEvidence.query)).not.toThrow();
    expect(collector.snapshot()).toHaveLength(1);
  });
});
