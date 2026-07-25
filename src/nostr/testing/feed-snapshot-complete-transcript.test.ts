import { afterEach, describe, expect, it, vi } from "vitest";
import { finalizeEvent, type Event } from "nostr-tools";
import {
  fetchFeedSnapshot,
  IncompleteFeedSnapshotTraversalError,
  type FeedSnapshotOptions,
} from "../../../lib/feedSnapshot";
import {
  FeedBootstrapCacheService,
  MemoryFeedBootstrapStore,
} from "../../../lib/feedBootstrapCache";
import type { FeedBootstrapSnapshot } from "../../shared/lib/feedBootstrapTypes";
import {
  auditSampleCount,
  emitAuditMeasurement,
  summarizeSamples,
} from "./audit-metrics";
import {
  RelayTranscriptHarness,
  type RelayRequestController,
  type RelayTranscriptEntry,
} from "./relay-transcript";

const secretKey = new Uint8Array(32).fill(6);
const root = finalizeEvent({
  created_at: 2_000_000_000,
  kind: 1,
  tags: [],
  content: "server root",
}, secretKey);
const reply = finalizeEvent({
  created_at: root.created_at + 1,
  kind: 1,
  tags: [["e", root.id, "", "reply"]],
  content: "server reply",
}, secretKey);
const nestedReply = finalizeEvent({
  created_at: reply.created_at + 1,
  kind: 1,
  tags: [["e", reply.id, "", "reply"]],
  content: "server nested reply",
}, secretKey);

function driveSimpleSnapshot(request: RelayRequestController): void {
  const [filter] = request.filters;
  if (filter?.["#e"]?.includes(reply.id)) {
    request.sendEvent(nestedReply);
  } else if (filter?.["#e"]?.includes(root.id)) {
    request.sendEvent(reply);
  } else if (filter?.kinds?.includes(1)) {
    request.sendEvent(root);
  }
  request.sendEose();
}

function snapshotOptions(
  relayUrl: string,
  overrides: Partial<FeedSnapshotOptions> = {},
): FeedSnapshotOptions {
  return {
    ageHours: 24,
    completeTraversal: true,
    filterDifficulty: 0,
    relayCoverage: {
      snapshot: [relayUrl],
      pow: [relayUrl],
      replies: [relayUrl],
      profiles: [],
    },
    timeoutMs: 3_000,
    ...overrides,
  };
}

function priorSnapshot(fetchedAt: number): FeedBootstrapSnapshot {
  return {
    fetchedAt,
    processedEvents: [],
    eventsById: {},
    relayHintsByEventId: {},
    profiles: {},
    scoring: {
      ageHours: 24,
      minPow: 0,
      replyDepth: 2,
      sort: "totalWork",
    },
  };
}

function immediateParent(event: Event): string | undefined {
  return event.tags.find(
    (tag) => tag[0] === "e" && tag[3] === "reply",
  )?.[1];
}

function completeReplies(): {
  wide: Event[];
  limit: Event[];
} {
  const wideDirect = Array.from({ length: 60 }, (_, index) =>
    finalizeEvent({
      created_at: root.created_at + 1,
      kind: 1,
      tags: [["e", root.id, "", "reply"]],
      content: `complete wide direct ${index}`,
    }, secretKey)
  );
  const wideNested = wideDirect.map((parent, index) =>
    finalizeEvent({
      created_at: root.created_at + 2,
      kind: 1,
      tags: [
        ["e", root.id, "", "root"],
        ["e", parent.id, "", "reply"],
      ],
      content: `complete wide nested ${index}`,
    }, secretKey)
  );
  const limit = Array.from({ length: 101 }, (_, index) =>
    finalizeEvent({
      created_at: root.created_at + 1,
      kind: 1,
      tags: [["e", root.id, "", "reply"]],
      content: `complete same-second ${index}`,
    }, secretKey)
  );
  return { wide: [...wideDirect, ...wideNested], limit };
}

async function listenForReplies(
  replies: readonly Event[],
): Promise<RelayTranscriptHarness> {
  return RelayTranscriptHarness.listen({
    onRequest(request) {
      const [filter] = request.filters;
      if (filter?.["#e"]) {
        const parentIds = new Set(filter["#e"]);
        replies.forEach((candidate) => {
          const parentId = immediateParent(candidate);
          if (parentId && parentIds.has(parentId)) {
            request.sendEvent(candidate);
          }
        });
      } else if (filter?.kinds?.includes(1)) {
        request.sendEvent(root);
      }
      request.sendEose();
    },
  });
}

describe("complete Wired snapshot relay transcript", () => {
  const harnesses: RelayTranscriptHarness[] = [];

  afterEach(async () => {
    await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
  });

  it("keeps rollback and complete traversal snapshot output identical", async () => {
    const harness = await RelayTranscriptHarness.listen({
      onRequest: driveSimpleSnapshot,
    });
    harnesses.push(harness);
    const completion = vi.fn();

    const rollbackSnapshot = await fetchFeedSnapshot(snapshotOptions(harness.url, {
      completeTraversal: false,
      relayCoverage: {
        snapshot: [harness.url],
        pow: [harness.url],
        replies: [harness.url],
        profiles: [harness.url],
      },
    }));
    const completeSnapshot = await fetchFeedSnapshot(snapshotOptions(harness.url, {
      onTraversalComplete: completion,
      relayCoverage: {
        snapshot: [harness.url],
        pow: [harness.url],
        replies: [harness.url],
        profiles: [harness.url],
      },
    }));
    const { fetchedAt: rollbackFetchedAt, ...rollbackOutput } = rollbackSnapshot;
    const { fetchedAt: completeFetchedAt, ...completeOutput } = completeSnapshot;

    expect(completeOutput).toEqual(rollbackOutput);
    expect(completeFetchedAt).toBeGreaterThanOrEqual(rollbackFetchedAt);
    expect(completion).toHaveBeenCalledOnce();
    expect(completion).toHaveBeenCalledWith(expect.objectContaining({
      state: "complete",
      feedReplies: {
        state: "complete",
        passes: 3,
        queries: 3,
        parentCount: 3,
      },
      referenceReplies: {
        state: "complete",
        passes: 0,
        queries: 0,
        parentCount: 0,
      },
    }));
    expect(completion.mock.calls[0]?.[0].finitePhases.map(
      (phase: { phase: string }) => phase.phase,
    )).toEqual([
      "activity",
      "root-resolution",
      "references",
      "profiles",
    ]);
  });

  it("resolves the exact wide and deep reply closure sequentially", async () => {
    const { wide } = completeReplies();
    const harness = await listenForReplies(wide);
    harnesses.push(harness);
    const workflow = harness.beginWorkflow("wired-server-feed-complete-wide");
    const completion = vi.fn();

    const snapshot = await fetchFeedSnapshot(snapshotOptions(harness.url, {
      onTraversalComplete: completion,
    }));
    await harness.waitFor((entries) =>
      entries
        .slice(workflow.startIndex)
        .filter((entry) => entry.type === "close").length >= 7
    );
    workflow.complete();

    expect(Object.keys(snapshot.eventsById).sort()).toEqual(
      [root, ...wide].map((event) => event.id).sort(),
    );
    expect(snapshot.processedEvents[0]?.replyIds.sort()).toEqual(
      wide.map((event) => event.id).sort(),
    );
    expect(completion).toHaveBeenCalledWith(expect.objectContaining({
      state: "complete",
      feedReplies: {
        state: "complete",
        passes: 3,
        queries: 6,
        parentCount: 121,
      },
    }));

    const entries = harness.entries.slice(
      workflow.startIndex,
      workflow.completedIndex,
    );
    const replyRequests = entries.filter(
      (
        entry,
      ): entry is Extract<RelayTranscriptEntry, { type: "request" }> =>
        entry.type === "request" && Boolean(entry.filters[0]?.["#e"]),
    );
    expect(replyRequests).toHaveLength(6);
    expect(replyRequests.every((request) => {
      const filter = request.filters[0]!;
      return (
        request.filters.length === 1 &&
        (filter["#e"]?.length ?? 0) <= 50 &&
        filter.limit === undefined &&
        typeof filter.since === "number"
      );
    })).toBe(true);
    const replySubscriptionIds = new Set(
      replyRequests.map((request) => request.subscriptionId),
    );
    let active = 0;
    let peak = 0;
    entries.forEach((entry) => {
      if (
        entry.type === "request" &&
        replySubscriptionIds.has(entry.subscriptionId)
      ) {
        active += 1;
        peak = Math.max(peak, active);
      } else if (
        entry.type === "close" &&
        replySubscriptionIds.has(entry.subscriptionId)
      ) {
        active -= 1;
      }
    });
    expect(peak).toBe(1);
    expect(active).toBe(0);
  });

  it("retains the prior snapshot for reply and activity incomplete outcomes", async () => {
    const prior = priorSnapshot(1_999_999_999);
    const replyHarness = await RelayTranscriptHarness.listen({
      onRequest(request) {
        const [filter] = request.filters;
        if (filter?.["#e"]) request.closeConnection();
        else {
          request.sendEvent(root);
          request.sendEose();
        }
      },
    });
    const activityHarness = await RelayTranscriptHarness.listen({
      onRequest(request) {
        request.closeConnection();
      },
    });
    harnesses.push(replyHarness, activityHarness);

    for (const [phase, harness] of [
      ["feed-replies", replyHarness],
      ["activity", activityHarness],
    ] as const) {
      const store = new MemoryFeedBootstrapStore(prior);
      const completion = vi.fn();
      const service = new FeedBootstrapCacheService({
        store,
        fetchSnapshot: () => fetchFeedSnapshot(snapshotOptions(harness.url, {
          onTraversalComplete: completion,
        })),
      });

      await expect(service.refresh()).rejects.toMatchObject({
        name: "IncompleteFeedSnapshotTraversalError",
        completion: {
          state: "incomplete",
          phase,
          reason: "relay-closed",
        },
      });
      await expect(service.read()).resolves.toBe(prior);
      expect(completion).toHaveBeenCalledWith(expect.objectContaining({
        state: "incomplete",
        phase,
        reason: "relay-closed",
      }));
    }
  });

  it("retains the prior snapshot when metadata retrieval is cancelled", async () => {
    const prior = priorSnapshot(1_999_999_997);
    const controller = new AbortController();
    const completion = vi.fn();
    const harness = await RelayTranscriptHarness.listen({
      onRequest(request) {
        const [filter] = request.filters;
        if (filter?.authors && filter.kinds?.includes(0)) {
          controller.abort();
          return;
        }
        if (filter?.["#e"]) {
          request.sendEose();
          return;
        }
        request.sendEvent(root);
        request.sendEose();
      },
    });
    harnesses.push(harness);
    const store = new MemoryFeedBootstrapStore(prior);
    const service = new FeedBootstrapCacheService({
      store,
      fetchSnapshot: () => fetchFeedSnapshot(snapshotOptions(harness.url, {
        onTraversalComplete: completion,
        relayCoverage: {
          snapshot: [harness.url],
          pow: [harness.url],
          replies: [harness.url],
          profiles: [harness.url],
        },
        signal: controller.signal,
      })),
    });

    await expect(service.refresh()).rejects.toMatchObject({
      name: "IncompleteFeedSnapshotTraversalError",
      completion: {
        state: "incomplete",
        phase: "profiles",
        reason: "cancelled",
      },
    });
    await expect(service.read()).resolves.toBe(prior);
    expect(completion).toHaveBeenCalledWith(expect.objectContaining({
      state: "incomplete",
      phase: "profiles",
      reason: "cancelled",
    }));
  });

  it("keeps approved complete snapshot fixtures within their controlled ceilings", async () => {
    const { wide, limit } = completeReplies();
    const wideHarness = await listenForReplies(wide);
    const limitHarness = await listenForReplies(limit);
    const handoffHarness = await RelayTranscriptHarness.listen({
      onRequest(request) {
        const [filter] = request.filters;
        if (filter?.["#e"]) request.closeConnection();
        else {
          request.sendEvent(root);
          request.sendEose();
        }
      },
    });
    harnesses.push(wideHarness, limitHarness, handoffHarness);

    const measureComplete = async (
      harness: RelayTranscriptHarness,
      expectedReplies: readonly Event[],
      name: string,
    ) => {
      const latencies: number[] = [];
      let evidence: readonly RelayTranscriptEntry[] = [];
      for (let run = 0; run < auditSampleCount(); run += 1) {
        const workflow = harness.beginWorkflow(`${name}-${run + 1}`);
        const snapshot = await fetchFeedSnapshot(snapshotOptions(harness.url));
        await harness.waitFor((entries) =>
          entries
            .slice(workflow.startIndex)
            .some((entry) => entry.type === "connection-closed")
        );
        workflow.complete();
        expect(Object.keys(snapshot.eventsById).sort()).toEqual(
          [root, ...expectedReplies].map((event) => event.id).sort(),
        );
        latencies.push(harness.summary(workflow).completionLatencyMs);
        evidence = harness.entries.slice(
          workflow.startIndex,
          workflow.completedIndex,
        );
      }
      return {
        completionLatencyMs: summarizeSamples(latencies),
        evidence: {
          requests: evidence.filter((entry) => entry.type === "request").length,
          requestBytes: evidence
            .filter((entry) => entry.type === "request")
            .reduce((total, entry) => total + entry.bytes, 0),
          returnedEvents: evidence.filter(
            (entry) => entry.type === "event-returned",
          ).length,
        },
      };
    };

    const wideMeasurement = await measureComplete(
      wideHarness,
      wide,
      "wired-server-complete-wide",
    );
    const limitMeasurement = await measureComplete(
      limitHarness,
      limit,
      "wired-server-complete-limit",
    );
    const prior = priorSnapshot(1_999_999_999);
    const store = new MemoryFeedBootstrapStore(prior);
    const service = new FeedBootstrapCacheService({
      store,
      fetchSnapshot: () =>
        fetchFeedSnapshot(snapshotOptions(handoffHarness.url)),
    });
    const handoffLatencies: number[] = [];
    let handoffEvidence: readonly RelayTranscriptEntry[] = [];
    for (let run = 0; run < auditSampleCount(); run += 1) {
      const workflow = handoffHarness.beginWorkflow(
        `wired-server-incomplete-cache-handoff-${run + 1}`,
      );
      await expect(service.refresh()).rejects.toBeInstanceOf(
        IncompleteFeedSnapshotTraversalError,
      );
      await expect(service.read()).resolves.toBe(prior);
      await handoffHarness.waitFor((entries) =>
        entries
          .slice(workflow.startIndex)
          .some((entry) => entry.type === "connection-closed")
      );
      workflow.complete();
      handoffLatencies.push(
        handoffHarness.summary(workflow).completionLatencyMs,
      );
      handoffEvidence = handoffHarness.entries.slice(
        workflow.startIndex,
        workflow.completedIndex,
      );
    }
    const handoffMeasurement = {
      completionLatencyMs: summarizeSamples(handoffLatencies),
      evidence: {
        requests: handoffEvidence.filter((entry) => entry.type === "request")
          .length,
        requestBytes: handoffEvidence
          .filter((entry) => entry.type === "request")
          .reduce((total, entry) => total + entry.bytes, 0),
        returnedEvents: handoffEvidence.filter(
          (entry) => entry.type === "event-returned",
        ).length,
      },
    };

    expect(wideMeasurement.completionLatencyMs.p95).toBeLessThanOrEqual(2_100);
    expect(limitMeasurement.completionLatencyMs.p95).toBeLessThanOrEqual(1_550);
    expect(handoffMeasurement.completionLatencyMs.p95).toBeLessThanOrEqual(60);
    emitAuditMeasurement({
      scenario: "wired-server-complete-snapshot-approved-local-fixtures",
      samples: auditSampleCount(),
      wide: wideMeasurement,
      limit: limitMeasurement,
      handoff: handoffMeasurement,
    });
  }, 180_000);
});
