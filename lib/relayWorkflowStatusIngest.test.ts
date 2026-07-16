import { describe, expect, it } from "vitest";
import { validRelayWorkflowEvidence } from "../src/contracts/relay-workflow-evidence.test-fixtures";
import type { RelayWorkflowStatusEnvelope } from "../src/contracts/relay-workflow-status";
import { RelayWorkflowCollector } from "../src/nostr/evidence/relay-workflow-collector";
import { RelayWorkflowStatusIngestService } from "./relayWorkflowStatusIngest";
import { MemoryRelayWorkflowStatusStore } from "./relayWorkflowStatusStore";

const NOW = Date.parse("2026-07-16T10:00:00.000Z");

function envelope(collectedAt = NOW): RelayWorkflowStatusEnvelope {
  const collector = new RelayWorkflowCollector();
  collector.record(validRelayWorkflowEvidence.query);
  return {
    schemaVersion: 1,
    source: "wired-browser",
    collectedAt,
    aggregates: collector.snapshot(),
    correlations: [],
  };
}

describe("RelayWorkflowStatusIngestService", () => {
  it("stores only validated, bounded envelopes", async () => {
    const store = new MemoryRelayWorkflowStatusStore(() => NOW);
    const service = new RelayWorkflowStatusIngestService(store, { now: () => NOW });

    await expect(service.ingest(envelope())).resolves.toBe("stored");
    await expect(service.ingest({ ...envelope(), eventId: "forbidden" })).resolves.toBe("invalid");
    await expect(service.ingest(envelope(), 32_769)).resolves.toBe("oversized");
    await expect(service.ingest(envelope(NOW - 15 * 24 * 60 * 60 * 1_000))).resolves.toBe("stale");

    expect(store.rows).toHaveLength(1);
    expect(service.status).toEqual({ stored: 1, rejected: 3, previewOverflow: 0 });
  });

  it("enforces atomic per-source minute, day, and preview-key caps", async () => {
    const rateStore = new MemoryRelayWorkflowStatusStore(() => NOW);
    const rate = new RelayWorkflowStatusIngestService(rateStore, {
      now: () => NOW,
      limits: { requestsPerSourcePerMinute: 1 },
    });
    await expect(rate.ingest(envelope())).resolves.toBe("stored");
    await expect(rate.ingest(envelope())).resolves.toBe("rate-limited");

    const dayStore = new MemoryRelayWorkflowStatusStore(() => NOW);
    const day = new RelayWorkflowStatusIngestService(dayStore, {
      now: () => NOW,
      limits: { rowsPerSourcePerDay: 1 },
    });
    await expect(day.ingest(envelope())).resolves.toBe("stored");
    await expect(day.ingest(envelope())).resolves.toBe("daily-limit");

    const correlation = (dailyToken: string): RelayWorkflowStatusEnvelope => ({
      schemaVersion: 1,
      source: "wired-server",
      collectedAt: NOW,
      aggregates: [],
      correlations: [{
        workflowOwner: "wired.server.preview",
        endpoint: "thread-html",
        outcome: "relay-fallback",
        dailyToken,
      }],
    });
    const keyStore = new MemoryRelayWorkflowStatusStore(() => NOW);
    const keys = new RelayWorkflowStatusIngestService(keyStore, {
      now: () => NOW,
      random: () => 0.99,
      limits: { previewKeysPerDay: 1 },
    });
    await expect(keys.ingest(correlation("aaaaaaaaaaaaaaaa"))).resolves.toBe("stored");
    await expect(keys.ingest(correlation("aaaaaaaaaaaaaaaa"))).resolves.toBe("stored");
    await expect(keys.ingest(correlation("bbbbbbbbbbbbbbbb"))).resolves.toBe("preview-sampled-out");
    expect(keys.status.previewOverflow).toBe(1);
    expect(keyStore.previewOverflow("2026-07-16", "wired-server")).toBe(1);
    expect(keyStore.previewSnapshot("2026-07-16", "wired-server")
      .map((entry) => entry.dailyToken)).toEqual(["aaaaaaaaaaaaaaaa"]);

    const replacementStore = new MemoryRelayWorkflowStatusStore(() => NOW);
    const replacement = new RelayWorkflowStatusIngestService(
      replacementStore,
      { now: () => NOW, random: () => 0, limits: { previewKeysPerDay: 1 } },
    );
    await expect(replacement.ingest(correlation("aaaaaaaaaaaaaaaa"))).resolves.toBe("stored");
    await expect(replacement.ingest(correlation("bbbbbbbbbbbbbbbb"))).resolves.toBe("stored");
    expect(replacementStore.previewSnapshot("2026-07-16", "wired-server")
      .map((entry) => entry.dailyToken)).toEqual(["bbbbbbbbbbbbbbbb"]);
  });

  it("deletes rows at the 14-day retention boundary", async () => {
    let now = NOW - 15 * 24 * 60 * 60 * 1_000;
    const store = new MemoryRelayWorkflowStatusStore(() => now);
    const service = new RelayWorkflowStatusIngestService(store, { now: () => now });
    await service.ingest(envelope(now));
    now = NOW;

    await expect(service.purgeExpired()).resolves.toBe(1);
    expect(store.rows).toEqual([]);
  });

  it("can be disabled without touching storage", async () => {
    const store = new MemoryRelayWorkflowStatusStore(() => NOW);
    const service = new RelayWorkflowStatusIngestService(store, {
      enabled: () => false,
      now: () => NOW,
    });
    await expect(service.ingest(envelope())).resolves.toBe("disabled");
    expect(store.rows).toEqual([]);
  });
});
