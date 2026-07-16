import { describe, expect, it, vi } from "vitest";
import { validRelayWorkflowEvidence } from "../../contracts/relay-workflow-evidence.test-fixtures";
import { RelayWorkflowCollector } from "./relay-workflow-collector";
import {
  BrowserRelayWorkflowStatusAdapter,
  RelayWorkflowStatusExporter,
  createSameOriginWorkflowStatusSink,
  workflowStatusRolloutEnabled,
} from "./relay-workflow-exporter";

function aggregateEnvelope() {
  const collector = new RelayWorkflowCollector();
  collector.record(validRelayWorkflowEvidence.query);
  return {
    schemaVersion: 1 as const,
    source: "wired-browser" as const,
    collectedAt: 1_700_000_000_000,
    aggregates: collector.snapshot(),
    correlations: [],
  };
}

describe("RelayWorkflowStatusExporter", () => {
  it("caps queued envelopes, drops oldest, and never throws into callers", async () => {
    let flush: (() => void) | undefined;
    const delivered: number[] = [];
    const exporter = new RelayWorkflowStatusExporter(
      async (envelope) => { delivered.push(envelope.collectedAt); },
      { schedule: (task) => { flush = task; } },
    );
    for (let index = 0; index < 101; index += 1) {
      exporter.enqueue({ ...aggregateEnvelope(), collectedAt: index });
    }

    expect(exporter.status).toEqual({ enabled: true, pending: 100, dropped: 1 });
    flush?.();
    await vi.waitFor(() => expect(exporter.status.pending).toBe(0));
    expect(delivered).toHaveLength(100);
    expect(delivered[0]).toBe(1);
  });

  it("drops sink and scheduler failures without retrying relay work", async () => {
    const sinkFailure = new RelayWorkflowStatusExporter(async () => {
      throw new Error("sink unavailable");
    });
    sinkFailure.enqueue(aggregateEnvelope());
    await vi.waitFor(() => expect(sinkFailure.status.dropped).toBe(1));

    const schedulerFailure = new RelayWorkflowStatusExporter(async () => {}, {
      schedule() { throw new Error("scheduler unavailable"); },
    });
    expect(() => schedulerFailure.enqueue(aggregateEnvelope())).not.toThrow();
    expect(schedulerFailure.status).toEqual({ enabled: true, pending: 0, dropped: 1 });
  });

  it("does no work while disabled", () => {
    const sink = vi.fn(async () => {});
    const exporter = new RelayWorkflowStatusExporter(sink, { enabled: false });
    exporter.enqueue(aggregateEnvelope());
    expect(exporter.status).toEqual({ enabled: false, pending: 0, dropped: 0 });
    expect(sink).not.toHaveBeenCalled();
  });
});

describe("BrowserRelayWorkflowStatusAdapter", () => {
  it("seals one aggregate window on timer or navigation flush", () => {
    let scheduled: (() => void) | undefined;
    const sinkSchedule: Array<() => void> = [];
    const collector = new RelayWorkflowCollector();
    const exporter = new RelayWorkflowStatusExporter(async () => {}, {
      schedule: (task) => { sinkSchedule.push(task); },
    });
    const adapter = new BrowserRelayWorkflowStatusAdapter(collector, exporter, {
      now: () => 123,
      setTimer: (task) => {
        scheduled = task;
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer: () => {},
    });
    collector.record(validRelayWorkflowEvidence.query);
    adapter.schedule();
    scheduled?.();

    expect(collector.snapshot()).toEqual([]);
    expect(exporter.status.pending).toBe(1);
    expect(sinkSchedule).toHaveLength(1);
  });
});

describe("same-origin workflow status sink", () => {
  it("uses a navigation-safe same-origin POST", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    await createSameOriginWorkflowStatusSink({
      fetchImpl,
      isOnline: () => true,
    })(aggregateEnvelope());
    expect(fetchImpl).toHaveBeenCalledWith("/api/workflow-status", expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
    }));
  });

  it("drops before transport while offline", async () => {
    const fetchImpl = vi.fn();
    await expect(createSameOriginWorkflowStatusSink({
      fetchImpl,
      isOnline: () => false,
    })(aggregateEnvelope())).rejects.toThrow("offline");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("supports explicit 10-to-100 percent rollout and rollback", () => {
    expect(workflowStatusRolloutEnabled("true", 10, 0.09)).toBe(true);
    expect(workflowStatusRolloutEnabled("true", 10, 0.1)).toBe(false);
    expect(workflowStatusRolloutEnabled("false", 100, 0)).toBe(false);
  });
});
