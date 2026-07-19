import { afterEach, describe, expect, it, vi } from "vitest";
import {
  finalizeEvent,
  nip19,
  useWebSocketImplementation as configureWebSocketImplementation,
} from "nostr-tools";
import { WebSocket } from "ws";
import { fetchFeedSnapshot } from "../../../lib/feedSnapshot";
import { handleFeedRefreshApi } from "../../../api/_shared/handlers";
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
const rootSeekingReply = finalizeEvent({
  created_at: root.created_at + 2,
  kind: 1,
  tags: [
    ["e", root.id, "", "root"],
    ["e", root.id, "", "reply"],
  ],
  content: "activity before root resolution",
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
        relayCoverage: {
          snapshot: relayUrls,
          pow: relayUrls,
          replies: relayUrls,
          profiles: relayUrls,
        },
        timeoutMs: 1_000,
      }),
    });
    const completionLatencies: number[] = [];
    let evidenceEntries: readonly RelayTranscriptEntry[] = [];
    let lastSnapshot: FeedBootstrapSnapshot | undefined;

    for (let run = 0; run < auditSampleCount(); run += 1) {
      const workflow = session.beginWorkflow(`wired-server-feed-snapshot-${run + 1}`);
      const waitUntil = vi.fn<(promise: Promise<unknown>) => void>();
      const response = await handleFeedRefreshApi(
        { method: "GET" },
        { service, waitUntil },
      );
      const backgroundRefresh = waitUntil.mock.calls[0]?.[0];
      expect(backgroundRefresh).toBeDefined();
      const [snapshot, coalescedSnapshot] = await Promise.all([
        service.refresh(),
        backgroundRefresh as Promise<FeedBootstrapSnapshot>,
      ]);
      await session.waitFor(
        (entries) =>
          entries.filter((entry) => entry.type === "connection-closed").length ===
          (run + 1) * 4,
      );
      workflow.complete();
      expect(coalescedSnapshot).toBe(snapshot);
      expect(response).toMatchObject({
        status: 202,
        body: { ok: true, refresh: "started" },
      });
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
      const since = requests.find((request) =>
        request.filters.some((filter) => filter.kinds?.includes(1))
      )?.filters[0]?.since;
      expect(typeof since).toBe("number");
      expect(requests.every((request) => request.filters.every((filter) =>
        filter.kinds?.includes(1) ? filter.since === since : filter.since === undefined
      ))).toBe(true);
      const filterCounts = new Map<string, number>();
      requests.forEach((request) => {
        const filters = request.filters.map((filter) => {
          const withoutSince = { ...filter };
          delete withoutSince.since;
          return withoutSince;
        });
        const key = JSON.stringify(filters);
        filterCounts.set(key, (filterCounts.get(key) ?? 0) + 1);
      });
      expect(filterCounts).toEqual(new Map([
        [JSON.stringify([{ kinds: [1], limit: 500 }]), 2],
        [JSON.stringify([{ "#e": [root.id], kinds: [1], limit: 100 }]), 2],
        [JSON.stringify([{ "#e": [reply.id], kinds: [1], limit: 100 }]), 2],
        [JSON.stringify([{ authors: [root.pubkey], kinds: [0], limit: 1 }]), 2],
      ]));

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

  it("reuses one session across activity, missing-root, and reply phases", async () => {
    const session = new RelayTranscriptSession();
    harnesses.push(
      await RelayTranscriptHarness.listen({
        session,
        onRequest(request) {
          const [filter] = request.filters;
          if (filter?.ids?.includes(root.id)) {
            request.sendEvent(root);
          } else if (filter?.["#e"]?.includes(root.id)) {
            request.sendEvent(rootSeekingReply);
          } else if (filter?.kinds?.includes(1)) {
            request.sendEvent(rootSeekingReply);
          }
          request.sendEose();
        },
      }),
      await RelayTranscriptHarness.listen({
        session,
        onRequest(request) {
          request.sendEose();
        },
      }),
    );
    const relayUrls = harnesses.map((harness) => harness.url);
    const workflow = session.beginWorkflow("wired-server-feed-session-reuse");

    const snapshot = await fetchFeedSnapshot({
      ageHours: 24,
      filterDifficulty: 0,
      relayCoverage: {
        snapshot: relayUrls,
        pow: relayUrls,
        replies: relayUrls,
        profiles: relayUrls,
      },
      timeoutMs: 1_000,
    });
    await session.waitFor((entries) =>
      entries.filter((entry) => entry.type === "close").length === 10 &&
      entries.filter((entry) => entry.type === "connection-closed").length >= 4
    );
    workflow.complete();

    expect(Object.keys(snapshot.eventsById).sort()).toEqual(
      [root.id, rootSeekingReply.id].sort(),
    );
    expect(snapshot.processedEvents[0]?.replyIds).toEqual([rootSeekingReply.id]);
    expect(session.summary(workflow)).toMatchObject({
      openedConnections: 4,
      requests: 10,
      closes: 10,
      eose: 10,
      relayFanout: 2,
    });
  });

  it("preserves distinct activity and reply relay coverage", async () => {
    const session = new RelayTranscriptSession();
    const activityHarness = await RelayTranscriptHarness.listen({
      session,
      onRequest(request) {
        request.sendEvent(root);
        request.sendEose();
      },
    });
    const replyHarness = await RelayTranscriptHarness.listen({
      session,
      onRequest(request) {
        const [filter] = request.filters;
        if (filter?.["#e"]?.includes(root.id)) request.sendEvent(reply);
        if (filter?.["#e"]?.includes(reply.id)) request.sendEvent(nestedReply);
        request.sendEose();
      },
    });
    harnesses.push(activityHarness, replyHarness);
    const workflow = session.beginWorkflow("wired-server-feed-distinct-coverage");

    const snapshot = await fetchFeedSnapshot({
      ageHours: 24,
      filterDifficulty: 0,
      relayCoverage: {
        snapshot: [activityHarness.url],
        pow: [activityHarness.url],
        replies: [replyHarness.url],
        profiles: [],
      },
      timeoutMs: 1_000,
    });
    workflow.complete();

    expect(Object.keys(snapshot.eventsById).sort()).toEqual(
      [root.id, reply.id, nestedReply.id].sort(),
    );
    expect(snapshot.processedEvents[0]?.replyIds.sort()).toEqual(
      [reply.id, nestedReply.id].sort(),
    );
    const requests = session.entries
      .slice(workflow.startIndex, workflow.completedIndex)
      .filter((entry) => entry.type === "request");
    expect(requests).toHaveLength(3);
    expect(requests[0]?.relayUrl).toBe(activityHarness.url);
    expect(requests.slice(1).every((request) =>
      request.relayUrl === replyHarness.url
    )).toBe(true);
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
      relayCoverage: {
        snapshot: harnesses.map((harness) => harness.url),
        pow: harnesses.map((harness) => harness.url),
        replies: harnesses.map((harness) => harness.url),
        profiles: harnesses.map((harness) => harness.url),
      },
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

  it("resolves referenced context and deterministically selects newest metadata", async () => {
    const session = new RelayTranscriptSession();
    const rootKey = new Uint8Array(32).fill(70);
    const referenceKey = new Uint8Array(32).fill(71);
    const referenced = finalizeEvent({
      created_at: 2_000_000_010,
      kind: 1,
      tags: [],
      content: "referenced context",
    }, referenceKey);
    let relayUrls: string[] = [];
    const makeRoot = () => finalizeEvent({
      created_at: 2_000_000_020,
      kind: 1,
      tags: [],
      content: `nostr:${nip19.neventEncode({ id: referenced.id, relays: [relayUrls[1]!] })}`,
    }, rootKey);
    const listen = async (profileName: string, profileCreatedAt: number) =>
      RelayTranscriptHarness.listen({
        session,
        onRequest(request) {
          const [filter] = request.filters;
          if (filter?.authors && filter.kinds?.includes(0)) {
            [rootKey, referenceKey].forEach((key, index) => request.sendEvent(finalizeEvent({
              created_at: profileCreatedAt,
              kind: 0,
              tags: [],
              content: JSON.stringify({ name: `${profileName}-${index}` }),
            }, key)));
          } else if (filter?.ids?.includes(referenced.id)) {
            request.sendEvent(referenced);
          } else if (filter?.kinds?.includes(1) && !filter["#e"]) {
            request.sendEvent(enrichedRoot);
          }
          request.sendEose();
        },
      });

    const olderRelay = await listen("older", 2_000_000_030);
    const newerRelay = await listen("newer", 2_000_000_040);
    harnesses.push(olderRelay, newerRelay);
    relayUrls = [olderRelay.url, newerRelay.url];
    const enrichedRoot = makeRoot();

    const workflow = session.beginWorkflow("wired-server-feed-reference-metadata");
    const snapshot = await fetchFeedSnapshot({
      ageHours: 24,
      filterDifficulty: 0,
      relayCoverage: {
        snapshot: relayUrls,
        pow: relayUrls,
        replies: relayUrls,
        profiles: relayUrls,
      },
      timeoutMs: 1_000,
    });
    await session.waitFor((entries) =>
      entries.filter((entry) => entry.type === "connection-closed").length === 6 &&
      entries.filter((entry) => entry.type === "close").length === 10
    );
    workflow.complete();

    expect(Object.keys(snapshot.eventsById).sort()).toEqual(
      [enrichedRoot.id, referenced.id].sort(),
    );
    expect(snapshot.profiles[enrichedRoot.pubkey]).toEqual({ name: "newer-0" });
    expect(snapshot.profiles[referenced.pubkey]).toEqual({ name: "newer-1" });
    const requests = session.entries
      .slice(workflow.startIndex, workflow.completedIndex)
      .filter((entry) => entry.type === "request");
    const referenceRequests = requests.filter((request) =>
      request.filters[0]?.ids?.includes(referenced.id)
    );
    expect(referenceRequests).toHaveLength(2);
    expect(referenceRequests.every((request) =>
      request.filters[0]?.kinds?.join(",") === "1,1068" &&
      request.filters[0]?.limit === 1
    )).toBe(true);
    expect(session.summary(workflow)).toMatchObject({
      openedConnections: 6,
      closedConnections: 6,
      requests: 10,
      closes: 10,
      eose: 10,
      returnedEvents: 8,
      relayFanout: 2,
    });
  });
});
