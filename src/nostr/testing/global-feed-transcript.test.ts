import { afterEach, describe, expect, it } from "vitest";
import {
  finalizeEvent,
  useWebSocketImplementation as configureWebSocketImplementation,
} from "nostr-tools";
import { WebSocket } from "ws";
import { ensureRelaysConnected } from "../client";
import {
  subGlobalFeed,
  subRepliesForRootIds,
} from "../subscriptions/global-feed";
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

const secretKey = new Uint8Array(32).fill(1);
const rootEvent = finalizeEvent({
  created_at: 2_000_000_000,
  kind: 1,
  tags: [],
  content: "root",
}, secretKey);
const replyEvent = finalizeEvent({
  created_at: rootEvent.created_at + 1,
  kind: 1,
  tags: [["e", rootEvent.id, "", "reply"]],
  content: "reply",
}, secretKey);
const nestedReplyEvent = finalizeEvent({
  created_at: replyEvent.created_at + 1,
  kind: 1,
  tags: [["e", replyEvent.id, "", "reply"]],
  content: "nested reply",
}, secretKey);

function driveFeed(request: RelayRequestController): void {
  const [filter] = request.filters;
  if (filter?.["#e"]?.includes(replyEvent.id)) {
    request.sendEvent(nestedReplyEvent);
  } else if (filter?.["#e"]?.includes(rootEvent.id)) {
    request.sendEvent(replyEvent);
  } else {
    request.sendEvent(rootEvent);
  }
  request.sendEose();
}

function matchingIds(entries: readonly RelayTranscriptEntry[], type: "eose" | "close") {
  return entries
    .flatMap((entry) => entry.type === type ? [entry.subscriptionId] : [])
    .sort();
}

describe("global feed relay transcript", () => {
  const harnesses: RelayTranscriptHarness[] = [];

  afterEach(async () => {
    await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
  });

  it("captures cold recursive feed output, duplicate relays, and cleanup", async () => {
    const initialContentLatencies: number[] = [];
    const completionLatencies: number[] = [];
    let evidenceEntries: readonly RelayTranscriptEntry[] = [];

    for (let run = 0; run < auditSampleCount(); run += 1) {
      const session = new RelayTranscriptSession();
      const runHarnesses = [
        await RelayTranscriptHarness.listen({ session, onRequest: driveFeed }),
        await RelayTranscriptHarness.listen({ session, onRequest: driveFeed }),
      ];
      harnesses.push(...runHarnesses);
      const relayUrls = runHarnesses.map((harness) => harness.url);
      const workflow = session.beginWorkflow(`global-feed-${run + 1}`);
      const receivedIds = new Set<string>();
      let initialContentLatencyMs: number | undefined;

      await ensureRelaysConnected(relayUrls);
      const handle = subGlobalFeed((event) => {
        if (event.id === rootEvent.id && initialContentLatencyMs === undefined) {
          initialContentLatencyMs = Date.now() - workflow.startedAt;
        }
        receivedIds.add(event.id);
      }, 24, {
        rootRelayUrls: relayUrls,
        replyRelayUrls: relayUrls,
        replyDepth: 2,
      });

      await session.waitFor(() => receivedIds.has(nestedReplyEvent.id));
      await session.waitFor(
        (entries) => entries.filter((entry) => entry.type === "close").length === 6,
      );
      handle.close();
      workflow.complete();

      expect([...receivedIds].sort()).toEqual(
        [rootEvent.id, replyEvent.id, nestedReplyEvent.id].sort(),
      );
      const summary = session.summary(workflow);
      expect(summary).toMatchObject({
        openedConnections: 2,
        connectionReuseCount: 4,
        requests: 6,
        closes: 6,
        returnedEvents: 6,
        eose: 6,
        repeatedOperations: 3,
        relayFanout: 2,
      });
      const entries = session.entries.slice(
        workflow.startIndex,
        workflow.completedIndex,
      );
      const requests = entries.filter((entry) => entry.type === "request");
      const since = requests[0]?.filters[0]?.since;
      expect(typeof since).toBe("number");
      expect(requests.every((request) => request.filters.every((filter) =>
        filter.kinds?.includes(1) ? filter.since === since : true
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
        [JSON.stringify([{ "#e": [rootEvent.id], kinds: [1], limit: 100 }]), 2],
        [JSON.stringify([{ "#e": [replyEvent.id], kinds: [1], limit: 100 }]), 2],
      ]));
      const requestIds = requests.map((entry) => entry.subscriptionId).sort();
      expect(matchingIds(entries, "eose")).toEqual(requestIds);
      expect(matchingIds(entries, "close")).toEqual(requestIds);

      initialContentLatencies.push(initialContentLatencyMs ?? summary.completionLatencyMs);
      completionLatencies.push(summary.completionLatencyMs);
      evidenceEntries = entries;
    }

    emitAuditMeasurement({
      scenario: "wired-browser-global-feed-cold-local-fixture",
      samples: completionLatencies.length,
      initialContentLatencyMs: summarizeSamples(initialContentLatencies),
      completionLatencyMs: summarizeSamples(completionLatencies),
      evidence: {
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

  it("captures missing-root chunking and a distinct NIP-10 relay hint", async () => {
    const session = new RelayTranscriptSession();
    let activityEvents: ReturnType<typeof finalizeEvent>[] = [];
    let rootEvents: ReturnType<typeof finalizeEvent>[] = [];
    const activityDriver = (request: RelayRequestController) => {
      const [filter] = request.filters;
      if (filter?.kinds?.includes(1) && !filter.ids && !filter["#e"]) {
        activityEvents.forEach((event) => request.sendEvent(event));
      }
      request.sendEose();
    };
    const rootDriver = (request: RelayRequestController) => {
      const ids = request.filters[0]?.ids ?? [];
      rootEvents
        .filter((event) => ids.includes(event.id))
        .forEach((event) => request.sendEvent(event));
      request.sendEose();
    };
    const activityRelays = [
      await RelayTranscriptHarness.listen({ session, onRequest: activityDriver }),
      await RelayTranscriptHarness.listen({ session, onRequest: activityDriver }),
    ];
    const hintedRelay = await RelayTranscriptHarness.listen({
      session,
      onRequest: rootDriver,
    });
    harnesses.push(...activityRelays, hintedRelay);

    rootEvents = Array.from({ length: 21 }, (_, index) => finalizeEvent({
      created_at: rootEvent.created_at + index,
      kind: 1,
      tags: [],
      content: `hinted root ${index}`,
    }, new Uint8Array(32).fill(index + 10)));
    activityEvents = rootEvents.map((root, index) => finalizeEvent({
      created_at: root.created_at + 100,
      kind: 1,
      tags: [["e", root.id, hintedRelay.url, "root"]],
      content: `activity reply ${index}`,
    }, new Uint8Array(32).fill(index + 40)));

    const activityRelayUrls = activityRelays.map((relay) => relay.url);
    await ensureRelaysConnected([...activityRelayUrls, hintedRelay.url]);
    const workflow = session.beginWorkflow("global-feed-missing-roots-hint-chunk");
    const receivedIds = new Set<string>();
    const handle = subGlobalFeed((event) => receivedIds.add(event.id), 24, {
      rootRelayUrls: activityRelayUrls,
      replyRelayUrls: activityRelayUrls,
      replyDepth: 1,
    });

    const expectedIds = [...activityEvents, ...rootEvents].map((event) => event.id);
    await session.waitFor(() => expectedIds.every((id) => receivedIds.has(id)));
    await session.waitFor(
      (entries) => entries.filter((entry) => entry.type === "close").length === 50,
    );
    handle.close();
    workflow.complete();

    expect([...receivedIds].sort()).toEqual(expectedIds.sort());
    const entries = session.entries.slice(workflow.startIndex, workflow.completedIndex);
    const requests = entries.filter((entry) => entry.type === "request");
    const rootRequests = requests.filter((request) => request.filters[0]?.ids);
    expect(rootRequests).toHaveLength(6);
    expect(rootRequests.filter((request) => request.relayUrl === hintedRelay.url)
      .map((request) => request.filters[0]?.ids?.length)).toEqual([20, 1]);
    expect(new Set(rootRequests.flatMap((request) => request.filters[0]?.ids ?? [])))
      .toEqual(new Set(rootEvents.map((event) => event.id)));
    expect(session.summary(workflow)).toMatchObject({
      openedConnections: 0,
      requests: 50,
      closes: 50,
      eose: 50,
      returnedEvents: 63,
      relayFanout: 3,
    });
  });

  it("retains exact recursive output when a peer relay disconnects", async () => {
    const session = new RelayTranscriptSession();
    const healthyRelay = await RelayTranscriptHarness.listen({
      session,
      onRequest(request) {
        const [filter] = request.filters;
        if (filter?.["#e"]?.includes(replyEvent.id)) {
          request.sendEvent(nestedReplyEvent, 5);
        } else if (filter?.["#e"]?.includes(rootEvent.id)) {
          request.sendEvent(replyEvent, 5);
        } else {
          request.sendEvent(rootEvent, 5);
        }
        request.sendEose(5);
      },
    });
    const disconnectedRelay = await RelayTranscriptHarness.listen({
      session,
      onRequest(request) {
        request.closeConnection(1);
      },
    });
    harnesses.push(healthyRelay, disconnectedRelay);
    const relayUrls = [healthyRelay.url, disconnectedRelay.url];
    await ensureRelaysConnected(relayUrls);

    const workflow = session.beginWorkflow("global-feed-partial-relay-disconnect");
    const receivedIds = new Set<string>();
    const handle = subGlobalFeed((event) => receivedIds.add(event.id), 24, {
      rootRelayUrls: relayUrls,
      replyRelayUrls: relayUrls,
      replyDepth: 2,
    });
    await session.waitFor(() => receivedIds.has(nestedReplyEvent.id), 7_000);
    await session.waitFor((entries) =>
      entries.filter((entry) => entry.type === "close").length === 3
    , 7_000);
    handle.close();
    workflow.complete();

    expect([...receivedIds].sort()).toEqual(
      [rootEvent.id, replyEvent.id, nestedReplyEvent.id].sort(),
    );
    const summary = session.summary(workflow);
    expect(summary).toMatchObject({
      requests: 4,
      closes: 3,
      returnedEvents: 3,
      eose: 3,
      relayFanout: 2,
    });
    emitAuditMeasurement({
      scenario: "wired-browser-global-feed-partial-disconnect-after-fix",
      samples: 1,
      completionLatencyMs: summary.completionLatencyMs,
    });
  });

  it("captures slow bootstrap reply traversal overlapping live traversal", async () => {
    const session = new RelayTranscriptSession();
    const relayDriver = (request: RelayRequestController) => {
      const [filter] = request.filters;
      if (filter?.["#e"]?.includes(replyEvent.id)) {
        request.sendEvent(nestedReplyEvent, 15);
      } else if (filter?.["#e"]?.includes(rootEvent.id)) {
        request.sendEvent(replyEvent, 15);
      }
      request.sendEose(20);
    };
    const runHarnesses = [
      await RelayTranscriptHarness.listen({ session, onRequest: relayDriver }),
      await RelayTranscriptHarness.listen({ session, onRequest: relayDriver }),
    ];
    harnesses.push(...runHarnesses);
    const relayUrls = runHarnesses.map((harness) => harness.url);
    await ensureRelaysConnected(relayUrls);

    const workflow = session.beginWorkflow("bootstrap-live-reply-overlap");
    const liveIds = new Set<string>();
    const bootstrapIds = new Set<string>();
    const live = subRepliesForRootIds(
      [rootEvent.id],
      (event) => liveIds.add(event.id),
      { relayUrls, depth: 2 },
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    const bootstrap = subRepliesForRootIds(
      [rootEvent.id],
      (event) => bootstrapIds.add(event.id),
      { relayUrls, depth: 2 },
    );
    await session.waitFor(() =>
      liveIds.has(nestedReplyEvent.id) && bootstrapIds.has(nestedReplyEvent.id)
    );
    await session.waitFor((entries) =>
      entries.filter((entry) => entry.type === "close").length === 8
    );
    live.close();
    bootstrap.close();
    workflow.complete();

    const expectedIds = [replyEvent.id, nestedReplyEvent.id].sort();
    expect([...liveIds].sort()).toEqual(expectedIds);
    expect([...bootstrapIds].sort()).toEqual(expectedIds);
    const summary = session.summary(workflow);
    expect(summary).toMatchObject({
      requests: 8,
      closes: 8,
      eose: 8,
      returnedEvents: 8,
      relayFanout: 2,
    });
    expect([4, 6]).toContain(summary.repeatedOperations);
    emitAuditMeasurement({
      scenario: "wired-browser-bootstrap-live-reply-overlap-local-fixture",
      samples: 1,
      completionLatencyMs: summary.completionLatencyMs,
    });
  });
});
