import { describe, expect, it, vi } from "vitest";
import { validRelayWorkflowEvidence } from "../../contracts/relay-workflow-evidence.test-fixtures";
import type { RelayWorkflowStatusEnvelope } from "../../contracts/relay-workflow-status";
import { RelayWorkflowCollector } from "./relay-workflow-collector";
import {
  BrowserRelayWorkflowStatusAdapter,
  RelayWorkflowStatusExporter,
  createSameOriginWorkflowStatusSink,
  registerBrowserWorkflowStatusLifecycle,
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

  it("recovers after a hung sink without blocking later envelopes", async () => {
    let attempts = 0;
    const delivered: number[] = [];
    const exporter = new RelayWorkflowStatusExporter(async (envelope) => {
      attempts += 1;
      if (attempts === 1) await new Promise(() => {});
      delivered.push(envelope.collectedAt);
    }, { sinkTimeoutMs: 5 });

    exporter.enqueue({ ...aggregateEnvelope(), collectedAt: 1 });
    exporter.enqueue({ ...aggregateEnvelope(), collectedAt: 2 });

    await vi.waitFor(() => expect(exporter.status.pending).toBe(0));
    expect(exporter.status.dropped).toBe(1);
    expect(delivered).toEqual([2]);
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

  it("chunks the maximal browser keyspace by exact UTF-8 envelope size", async () => {
    const browserOwners = [
      "wired.browser.thread",
      "wired.browser.feed",
      "wired.browser.notifications",
      "wired.browser.quotes",
      "wired.browser.profiles",
      "wired.browser.publish",
    ] as const;
    const operations = ["query", "publish"] as const;
    const outcomes = ["completed", "partial", "timed-out", "cancelled", "failed"] as const;
    const collector = new RelayWorkflowCollector();
    for (const workflowOwner of browserOwners) {
      for (const operation of operations) {
        for (const outcome of outcomes) {
          collector.record({
            ...validRelayWorkflowEvidence.query,
            workflowOwner,
            operation,
            outcome,
          });
        }
      }
    }
    const delivered: RelayWorkflowStatusEnvelope[] = [];
    const scheduled: Array<() => void> = [];
    const exporter = new RelayWorkflowStatusExporter(async (envelope) => {
      delivered.push(envelope);
    }, { schedule: (task) => { scheduled.push(task); } });

    new BrowserRelayWorkflowStatusAdapter(collector, exporter, { now: () => 123 }).flushNow();
    scheduled.shift()?.();
    await vi.waitFor(() => expect(exporter.status.pending).toBe(0));

    expect(delivered.length).toBeGreaterThan(1);
    expect(delivered.flatMap((envelope) => envelope.aggregates)).toHaveLength(60);
    for (const envelope of delivered) {
      expect(new TextEncoder().encode(JSON.stringify(envelope)).byteLength)
        .toBeLessThanOrEqual(32_768);
    }
  });

  it("flushes actual collector windows on pagehide and hidden visibility", () => {
    const windowTarget = new EventTarget();
    const documentTarget = Object.assign(new EventTarget(), { visibilityState: "visible" });
    const collector = new RelayWorkflowCollector();
    const exporter = new RelayWorkflowStatusExporter(async () => {}, { schedule: () => {} });
    const adapter = new BrowserRelayWorkflowStatusAdapter(collector, exporter);
    const unregister = registerBrowserWorkflowStatusLifecycle(adapter, {
      windowTarget,
      documentTarget,
    });

    collector.record(validRelayWorkflowEvidence.query);
    windowTarget.dispatchEvent(new Event("pagehide"));
    expect(collector.snapshot()).toEqual([]);
    expect(exporter.status.pending).toBe(1);

    collector.record(validRelayWorkflowEvidence.query);
    documentTarget.visibilityState = "hidden";
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(collector.snapshot()).toEqual([]);
    expect(exporter.status.pending).toBe(2);

    unregister();
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
      signal: expect.any(AbortSignal),
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
