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
    expect(JSON.parse(blob.put.mock.calls[0][1])).toMatchObject({
      previewSample: [{ correlation: envelope.correlations[0] }],
      previewOverflow: 0,
    });
    expect(blob.put).toHaveBeenCalledTimes(1);
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
