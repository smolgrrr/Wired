import { beforeEach, describe, expect, it, vi } from "vitest";
import { validRelayWorkflowEvidence } from "../src/contracts/relay-workflow-evidence.test-fixtures";
import type { RelayWorkflowStatusEnvelope } from "../src/contracts/relay-workflow-status";
import { RelayWorkflowCollector } from "../src/nostr/evidence/relay-workflow-collector";

const blob = vi.hoisted(() => ({
  del: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  ...blob,
  BlobPreconditionFailedError: class BlobPreconditionFailedError extends Error {},
}));

import { VercelBlobRelayWorkflowStatusStore } from "./relayWorkflowStatusStore";

const envelope: RelayWorkflowStatusEnvelope = {
  schemaVersion: 1,
  source: "wired-server",
  collectedAt: Date.parse("2026-07-16T10:00:00.000Z"),
  aggregates: [],
  correlations: [{
    workflowOwner: "wired.server.preview",
    endpoint: "thread-html",
    outcome: "snapshot-hit",
    dailyToken: "abcdefghijklmnop",
  }],
};

function previewEntry(dailyToken: string) {
  return {
    dailyToken,
    collectedAt: envelope.collectedAt,
    observations: {
      "thread-html": { "snapshot-hit": 0, "relay-fallback": 0, missing: 0 },
      "thread-card": { "snapshot-hit": 0, "relay-fallback": 0, missing: 0 },
    },
  };
}

function blobControl(state: unknown, etag = "etag") {
  return {
    statusCode: 200,
    stream: new Response(JSON.stringify(state)).body,
    blob: { etag },
  };
}

describe("VercelBlobRelayWorkflowStatusStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    blob.get.mockResolvedValue(null);
    blob.put.mockResolvedValue({ etag: "etag" });
  });

  it("stores the bounded preview sample in the conditional private control", async () => {
    const store = new VercelBlobRelayWorkflowStatusStore();
    await expect(store.reserve({
      source: "wired-server",
      day: "2026-07-16",
      minute: "2026-07-16T10:00",
      previewCandidates: [{
        correlation: envelope.correlations[0],
        collectedAt: envelope.collectedAt,
        sample: 0.5,
      }],
    }, {
      requestsPerSourcePerMinute: 60,
      rowsPerSourcePerDay: 1_000,
      previewKeysPerDay: 1_000,
    })).resolves.toBe("accepted");
    await store.append(envelope, "2026-07-16");

    expect(blob.put).toHaveBeenNthCalledWith(
      1,
      "relay-workflow-status/v1/control/2026-07-16/wired-server.json",
      expect.any(String),
      expect.objectContaining({ access: "private", allowOverwrite: false }),
    );
    const firstControl = JSON.parse(blob.put.mock.calls[0][1]);
    expect(firstControl).toMatchObject({
      previewSample: [{
        dailyToken: "abcdefghijklmnop",
        observations: { "thread-html": { "snapshot-hit": 1 } },
      }],
      previewOverflow: 0,
    });
    expect(blob.put).toHaveBeenCalledTimes(1);

    blob.get.mockResolvedValue(blobControl(firstControl, "first"));
    await expect(new VercelBlobRelayWorkflowStatusStore().reserve({
      source: "wired-server",
      day: "2026-07-16",
      minute: "2026-07-16T10:00",
      previewCandidates: [{
        correlation: {
          ...envelope.correlations[0],
          endpoint: "thread-card",
          outcome: "relay-fallback",
        },
        collectedAt: envelope.collectedAt + 1,
        sample: 0.5,
      }],
    }, {
      requestsPerSourcePerMinute: 60,
      rowsPerSourcePerDay: 1_000,
      previewKeysPerDay: 1_000,
    })).resolves.toBe("accepted");
    expect(JSON.parse(blob.put.mock.calls[1][1])).toMatchObject({
      previewSample: [{
        dailyToken: "abcdefghijklmnop",
        observations: {
          "thread-html": { "snapshot-hit": 1 },
          "thread-card": { "relay-fallback": 1 },
        },
      }],
    });
  });

  it("samples before the production aggregate-row cap and durably counts overflow", async () => {
    const previewSample = Array.from({ length: 1_000 }, (_, index) => ({
      ...previewEntry(index.toString(36).padStart(16, "0")),
      observations: {
        ...previewEntry("unused0000000000").observations,
        "thread-html": { "snapshot-hit": 1, "relay-fallback": 0, missing: 0 },
      },
    }));
    blob.get.mockResolvedValue(blobControl({
      rows: 1_000,
      minute: "2026-07-16T10:00",
      minuteRequests: 0,
      previewSample,
      previewKeysSeen: 1_000,
      previewOverflow: 0,
    }));

    await expect(new VercelBlobRelayWorkflowStatusStore().reserve({
      source: "wired-server",
      day: "2026-07-16",
      minute: "2026-07-16T10:00",
      previewCandidates: [{
        correlation: { ...envelope.correlations[0], dailyToken: "zzzzzzzzzzzzzzzz" },
        collectedAt: envelope.collectedAt,
        sample: 0.999999,
      }],
    }, {
      requestsPerSourcePerMinute: 60,
      rowsPerSourcePerDay: 1_000,
      previewKeysPerDay: 1_000,
    })).resolves.toBe("preview-sampled-out");

    const next = JSON.parse(blob.put.mock.calls[0][1]);
    expect(next.previewSample).toHaveLength(1_000);
    expect(next.previewOverflow).toBe(1);
  });

  it("appends aggregate envelopes as immutable private rows", async () => {
    const collector = new RelayWorkflowCollector();
    collector.record(validRelayWorkflowEvidence.query);
    const aggregateEnvelope: RelayWorkflowStatusEnvelope = {
      schemaVersion: 1,
      source: "wired-browser",
      collectedAt: envelope.collectedAt,
      aggregates: collector.snapshot(),
      correlations: [],
    };
    await new VercelBlobRelayWorkflowStatusStore().append(aggregateEnvelope, "2026-07-16");

    expect(blob.put).toHaveBeenCalledWith(
      "relay-workflow-status/v1/data/2026-07-16/wired-browser/envelope.json",
      JSON.stringify(aggregateEnvelope),
      expect.objectContaining({
        access: "private",
        addRandomSuffix: true,
        allowOverwrite: false,
        maximumSizeInBytes: 32_768,
      }),
    );
  });

  it("paginates and deletes only objects older than the cutoff", async () => {
    const cutoff = Date.parse("2026-07-02T10:00:00.000Z");
    blob.list
      .mockResolvedValueOnce({
        blobs: [
          { url: "private://expired", uploadedAt: new Date(cutoff - 1) },
          { url: "private://current", uploadedAt: new Date(cutoff) },
        ],
        hasMore: false,
      })
      .mockResolvedValueOnce({
        blobs: [{ url: "private://current", uploadedAt: new Date(cutoff) }],
        hasMore: false,
      });

    await expect(new VercelBlobRelayWorkflowStatusStore().purgeBefore(cutoff))
      .resolves.toBe(1);
    expect(blob.del).toHaveBeenCalledWith(["private://expired"]);
  });
});
