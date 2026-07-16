import { describe, expect, it, vi } from "vitest";
import { RelayWorkflowStatusIngestService } from "./relayWorkflowStatusIngest";
import { MemoryRelayWorkflowStatusStore } from "./relayWorkflowStatusStore";
import {
  createPreviewResolutionObserver,
  deriveDailyPreviewCorrelationToken,
} from "./relayWorkflowPreviewCorrelation";

const EVENT_ID = "ab".repeat(32);
const SECRET = "deployment-shared-secret-material-32-bytes";
const DAY_ONE = Date.parse("2026-07-16T10:00:00.000Z");
const DAY_TWO = Date.parse("2026-07-17T10:00:00.000Z");

describe("preview correlation", () => {
  it("derives the same 96-bit token across instances for one UTC day", () => {
    const firstInstance = deriveDailyPreviewCorrelationToken(EVENT_ID, SECRET, DAY_ONE);
    const secondInstance = deriveDailyPreviewCorrelationToken(EVENT_ID, SECRET, DAY_ONE + 10_000);
    expect(firstInstance).toBe(secondInstance);
    expect(firstInstance).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(firstInstance).not.toContain(EVENT_ID);
    expect(firstInstance).not.toContain(SECRET);
  });

  it("rotates tokens with the UTC day or deployment secret", () => {
    expect(deriveDailyPreviewCorrelationToken(EVENT_ID, SECRET, DAY_ONE))
      .not.toBe(deriveDailyPreviewCorrelationToken(EVENT_ID, SECRET, DAY_TWO));
    expect(deriveDailyPreviewCorrelationToken(EVENT_ID, SECRET, DAY_ONE))
      .not.toBe(deriveDailyPreviewCorrelationToken(
        EVENT_ID,
        `${SECRET}-rotated`,
        DAY_ONE,
      ));
  });

  it("defers a content-free observation and isolates ingest failure", async () => {
    const store = new MemoryRelayWorkflowStatusStore(() => DAY_ONE);
    const service = new RelayWorkflowStatusIngestService(store, { now: () => DAY_ONE });
    const deferred: Promise<unknown>[] = [];
    const observer = createPreviewResolutionObserver({
      endpoint: "thread-card",
      enabled: true,
      service,
      secret: SECRET,
      now: () => DAY_ONE,
      defer: (promise) => { deferred.push(promise); },
    });
    observer({ eventId: EVENT_ID, outcome: "relay-fallback" });
    await Promise.all(deferred);

    expect(store.rows).toHaveLength(1);
    expect(JSON.stringify(store.rows[0])).not.toContain(EVENT_ID);
    expect(JSON.stringify(store.rows[0])).not.toContain(SECRET);

    const failedDefer = createPreviewResolutionObserver({
      endpoint: "thread-card",
      enabled: true,
      service,
      secret: SECRET,
      now: () => DAY_ONE,
      defer: vi.fn(() => { throw new Error("runtime unavailable"); }),
    });
    expect(() => failedDefer({ eventId: EVENT_ID, outcome: "missing" })).not.toThrow();

    const disabledDefer = vi.fn();
    createPreviewResolutionObserver({
      endpoint: "thread-card",
      enabled: false,
      service,
      secret: SECRET,
      now: () => DAY_ONE,
      defer: disabledDefer,
    })({ eventId: EVENT_ID, outcome: "missing" });
    expect(disabledDefer).not.toHaveBeenCalled();
  });
});
