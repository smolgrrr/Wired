import { afterEach, describe, expect, it } from "vitest";
import {
  finalizeEvent,
  useWebSocketImplementation as configureWebSocketImplementation,
} from "nostr-tools";
import { WebSocket } from "ws";
import { fetchFeedSnapshot } from "../../../lib/feedSnapshot";
import type { FeedBootstrapSnapshot } from "../../shared/lib/feedBootstrapTypes";
import {
  FeedBootstrapCacheService,
  MemoryFeedBootstrapStore,
} from "../../../lib/feedBootstrapCache";
import {
  auditSampleCount,
  emitAuditMeasurement,
  summarizeSamples,
} from "./audit-metrics";
import {
  RelayTranscriptHarness,
  RelayTranscriptSession,
  type RelayRequestController,
  type RelayTranscriptEntry,
} from "./relay-transcript";

configureWebSocketImplementation(WebSocket);

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

function driveSnapshot(request: RelayRequestController): void {
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

function completionIds(entries: readonly RelayTranscriptEntry[], type: "eose" | "close") {
  return entries
    .flatMap((entry) => entry.type === type ? [entry.subscriptionId] : [])
    .sort();
}

describe("server feed snapshot relay transcript", () => {
  const harnesses: RelayTranscriptHarness[] = [];

  afterEach(async () => {
    await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
  });

  it("captures recursive output, relay duplicates, finite cleanup, and profile enrichment", async () => {
    const session = new RelayTranscriptSession();
    harnesses.push(
      await RelayTranscriptHarness.listen({ session, onRequest: driveSnapshot }),
      await RelayTranscriptHarness.listen({ session, onRequest: driveSnapshot }),
    );
    const relayUrls = harnesses.map((harness) => harness.url);
    const service = new FeedBootstrapCacheService({
      store: new MemoryFeedBootstrapStore(),
      fetchSnapshot: () => fetchFeedSnapshot({
        ageHours: 24,
        filterDifficulty: 0,
        relayUrls,
        timeoutMs: 1_000,
      }),
    });
    const completionLatencies: number[] = [];
    let evidenceEntries: readonly RelayTranscriptEntry[] = [];
    let lastSnapshot: FeedBootstrapSnapshot | undefined;

    for (let run = 0; run < auditSampleCount(); run += 1) {
      const workflow = session.beginWorkflow(`wired-server-feed-snapshot-${run + 1}`);
      const [snapshot, coalescedSnapshot] = await Promise.all([
        service.refresh(),
        service.refresh(),
      ]);
      await session.waitFor(
        (entries) =>
          entries.filter((entry) => entry.type === "connection-closed").length ===
          (run + 1) * 4,
      );
      workflow.complete();
      expect(coalescedSnapshot).toBe(snapshot);
      lastSnapshot = snapshot;

      expect(Object.keys(snapshot.eventsById).sort()).toEqual(
        [root.id, reply.id, nestedReply.id].sort(),
      );
      expect(snapshot.processedEvents[0]?.replyIds.sort()).toEqual(
        [reply.id, nestedReply.id].sort(),
      );
      const summary = session.summary(workflow);
      expect(summary).toMatchObject({
        openedConnections: 4,
        closedConnections: 4,
        connectionReuseCount: 4,
        requests: 8,
        closes: 8,
        returnedEvents: 6,
        eose: 8,
        repeatedOperations: 4,
        relayFanout: 2,
      });
      const entries = session.entries.slice(
        workflow.startIndex,
        workflow.completedIndex,
      );
      const requests = entries.filter((entry) => entry.type === "request");
      const requestIds = requests.map((entry) => entry.subscriptionId).sort();
      expect(completionIds(entries, "eose")).toEqual(requestIds);
      expect(completionIds(entries, "close")).toEqual(requestIds);
      const filterCounts = new Map<string, number>();
      requests.forEach((request) => {
        const filters = request.filters.map(({ since: _since, ...filter }) => filter);
        const key = JSON.stringify(filters);
        filterCounts.set(key, (filterCounts.get(key) ?? 0) + 1);
      });
      expect([...filterCounts.values()]).toEqual([2, 2, 2, 2]);

      completionLatencies.push(summary.completionLatencyMs);
      evidenceEntries = entries;
    }

    expect(lastSnapshot).toBeDefined();
    const cacheWorkflow = session.beginWorkflow("wired-server-feed-cache-hit");
    expect(await service.get()).toBe(lastSnapshot);
    cacheWorkflow.complete();
    expect(session.summary(cacheWorkflow)).toMatchObject({
      openedConnections: 0,
      requests: 0,
      returnedEvents: 0,
      relayFanout: 0,
    });

    emitAuditMeasurement({
      scenario: "wired-server-feed-snapshot-local-fixture",
      samples: completionLatencies.length,
      completionLatencyMs: summarizeSamples(completionLatencies),
      evidence: {
        filters: evidenceEntries
          .filter((entry) => entry.type === "request")
          .map((entry) => entry.filters),
        requestBytes: evidenceEntries
          .filter((entry) => entry.type === "request")
          .map((entry) => entry.bytes),
        returnedEventBytes: evidenceEntries
          .filter((entry) => entry.type === "event-returned")
          .map((entry) => entry.bytes),
        subscriptionLifetimesMs: evidenceEntries
          .filter((entry) => entry.type === "close")
          .map((entry) => entry.lifetimeMs),
      },
    });
  });

  it("retains complete results when one relay never sends EOSE", async () => {
    const session = new RelayTranscriptSession();
    harnesses.push(
      await RelayTranscriptHarness.listen({
        session,
        onRequest(request) {
          const [filter] = request.filters;
          if (filter?.["#e"]?.includes(reply.id)) {
            request.sendEvent(nestedReply, 5);
          } else if (filter?.["#e"]?.includes(root.id)) {
            request.sendEvent(reply, 5);
          } else if (filter?.kinds?.includes(1)) {
            request.sendEvent(root, 5);
          }
          request.sendEose(5);
        },
      }),
      await RelayTranscriptHarness.listen({
        session,
        onRequest() {},
      }),
    );
    const workflow = session.beginWorkflow("wired-server-feed-no-eose-relay");
    const snapshot = await fetchFeedSnapshot({
      ageHours: 24,
      filterDifficulty: 0,
      relayUrls: harnesses.map((harness) => harness.url),
      timeoutMs: 50,
    });
    workflow.complete();

    expect(Object.keys(snapshot.eventsById).sort()).toEqual(
      [root.id, reply.id, nestedReply.id].sort(),
    );
    const summary = session.summary(workflow);
    expect(summary).toMatchObject({
      requests: 8,
      returnedEvents: 3,
      eose: 4,
      relayFanout: 2,
    });
    emitAuditMeasurement({
      scenario: "wired-server-feed-no-eose-relay-local-fixture",
      samples: 1,
      completionLatencyMs: summary.completionLatencyMs,
    });
  });
});
