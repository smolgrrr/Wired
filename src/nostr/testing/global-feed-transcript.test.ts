import { afterEach, describe, expect, it } from "vitest";
import {
  finalizeEvent,
  type Event,
  useWebSocketImplementation as configureWebSocketImplementation,
} from "nostr-tools";
import { WebSocket } from "ws";
import { ensureRelaysConnected } from "../client";
import {
  type FeedTraversalCompletion,
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

interface FeedCompleteMeasurement {
  initialLatencyMs: number;
  completionLatencyMs: number;
  entries: readonly RelayTranscriptEntry[];
}

async function measureCompleteBootstrapFixture(
  session: RelayTranscriptSession,
  relayUrl: string,
  expectedEvents: readonly Event[],
): Promise<FeedCompleteMeasurement> {
  await ensureRelaysConnected([relayUrl]);
  const startIndex = session.entries.length;
  const startedAt = Date.now();
  let initialLatencyMs: number | undefined;
  const callbackCounts = new Map<string, number>();
  let resolveCompletion!: (completion: FeedTraversalCompletion) => void;
  const completion = new Promise<FeedTraversalCompletion>((resolve) => {
    resolveCompletion = resolve;
  });
  const handle = subRepliesForRootIds([rootEvent.id], (event) => {
    initialLatencyMs ??= Date.now() - startedAt;
    callbackCounts.set(event.id, (callbackCounts.get(event.id) ?? 0) + 1);
  }, {
    relayUrls: [relayUrl],
    completeTraversal: true,
    onTraversalComplete: resolveCompletion,
  });

  await expect(completion).resolves.toEqual({
    state: "complete",
    reason: "fixpoint-eose",
  });
  const completionLatencyMs = Date.now() - startedAt;
  handle.close();
  expect(callbackCounts).toEqual(new Map(
    expectedEvents.map((event) => [event.id, 1]),
  ));
  return {
    initialLatencyMs: initialLatencyMs ?? completionLatencyMs,
    completionLatencyMs,
    entries: session.entries.slice(startIndex),
  };
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
      await Promise.all(runHarnesses.map((harness) => harness.close()));
      runHarnesses.forEach((harness) => {
        const harnessIndex = harnesses.indexOf(harness);
        if (harnessIndex >= 0) harnesses.splice(harnessIndex, 1);
      });
    }

    const initialContent = summarizeSamples(initialContentLatencies);
    const completion = summarizeSamples(completionLatencies);
    emitAuditMeasurement({
      scenario: "wired-browser-global-feed-cold-local-fixture",
      samples: completionLatencies.length,
      initialContentLatencyMs: initialContent,
      completionLatencyMs: completion,
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
    if (process.env.RELAY_AUDIT_OUTPUT === "1") {
      expect(initialContent.p95).toBeLessThanOrEqual(26);
      expect(completion.p95).toBeLessThanOrEqual(50);
    }
  });

  it("measures complete live feed traversal against the ordinary guardrail", async () => {
    const initialLatencies: number[] = [];
    const completionLatencies: number[] = [];
    let evidenceEntries: readonly RelayTranscriptEntry[] = [];

    for (let run = 0; run < auditSampleCount(); run += 1) {
      const session = new RelayTranscriptSession();
      const runHarnesses = [
        await RelayTranscriptHarness.listen({ session, onRequest: driveFeed }),
        await RelayTranscriptHarness.listen({ session, onRequest: driveFeed }),
      ];
      const relayUrls = runHarnesses.map((harness) => harness.url);
      await ensureRelaysConnected(relayUrls);
      const startedAt = Date.now();
      let initialLatencyMs: number | undefined;
      const callbackCounts = new Map<string, number>();
      let resolveCompletion!: (completion: FeedTraversalCompletion) => void;
      const completion = new Promise<FeedTraversalCompletion>((resolve) => {
        resolveCompletion = resolve;
      });
      const startIndex = session.entries.length;

      const handle = subGlobalFeed((event) => {
        initialLatencyMs ??= Date.now() - startedAt;
        callbackCounts.set(event.id, (callbackCounts.get(event.id) ?? 0) + 1);
      }, 24, {
        rootRelayUrls: relayUrls,
        replyRelayUrls: relayUrls,
        rootFilterDifficulty: 0,
        completeTraversal: true,
        onTraversalComplete: resolveCompletion,
      });

      await expect(completion).resolves.toEqual({
        state: "complete",
        reason: "fixpoint-eose",
      });
      const completionLatencyMs = Date.now() - startedAt;
      handle.close();
      expect(callbackCounts).toEqual(new Map([
        [rootEvent.id, 1],
        [replyEvent.id, 1],
        [nestedReplyEvent.id, 1],
      ]));
      initialLatencies.push(initialLatencyMs ?? completionLatencyMs);
      completionLatencies.push(completionLatencyMs);
      evidenceEntries = session.entries.slice(startIndex);
      await Promise.all(runHarnesses.map((harness) => harness.close()));
    }

    const initialContentLatencyMs = summarizeSamples(initialLatencies);
    const completionLatencyMs = summarizeSamples(completionLatencies);
    emitAuditMeasurement({
      scenario: "wired-browser-global-feed-complete-local-fixture",
      samples: completionLatencies.length,
      exactCallbacks: 3,
      initialContentLatencyMs,
      completionLatencyMs,
      evidence: {
        requests: evidenceEntries.filter((entry) => entry.type === "request").length,
        requestBytes: evidenceEntries
          .filter((entry) => entry.type === "request")
          .reduce((total, entry) => total + entry.bytes, 0),
        returnedEvents: evidenceEntries
          .filter((entry) => entry.type === "event-returned").length,
      },
    });
    if (process.env.RELAY_AUDIT_OUTPUT === "1") {
      expect(initialContentLatencyMs.p95).toBeLessThanOrEqual(26);
      expect(completionLatencyMs.p95).toBeLessThanOrEqual(50);
    }
  });

  it("resolves complete bootstrap reply closure across deep and wide sets", async () => {
    const directReplies = Array.from({ length: 60 }, (_, index) =>
      finalizeEvent({
        created_at: rootEvent.created_at + 1,
        kind: 1,
        tags: [["e", rootEvent.id, "", "reply"]],
        content: `feed-wide-direct-${index}`,
      }, new Uint8Array(32).fill((index % 200) + 20))
    );
    const wideChildren = directReplies.map((parent, index) =>
      finalizeEvent({
        created_at: rootEvent.created_at + 2,
        kind: 1,
        tags: [["e", parent.id, "", "reply"]],
        content: `feed-wide-child-${index}`,
      }, new Uint8Array(32).fill((index % 180) + 50))
    );
    const deepReplies: Event[] = [];
    let parentId = rootEvent.id;
    for (let depth = 1; depth <= 5; depth += 1) {
      const event = finalizeEvent({
        created_at: rootEvent.created_at + depth,
        kind: 1,
        tags: [["e", parentId]],
        content: `feed-depth-${depth}`,
      }, new Uint8Array(32).fill(depth + 210));
      deepReplies.push(event);
      parentId = event.id;
    }
    const replies = [...directReplies, ...wideChildren, ...deepReplies];
    const session = new RelayTranscriptSession();
    const harness = await RelayTranscriptHarness.listen({
      session,
      onRequest(request) {
        const parentIds = new Set(
          request.filters.flatMap((filter) => filter["#e"] ?? []),
        );
        replies
          .filter((event) =>
            event.tags.some((tag) =>
              tag[0] === "e" && parentIds.has(tag[1] ?? "")
            )
          )
          .forEach((event) => request.sendEvent(event));
        request.sendEose();
      },
    });
    harnesses.push(harness);
    await ensureRelaysConnected([harness.url]);
    const receivedIds = new Set<string>();
    let resolveCompletion!: (completion: FeedTraversalCompletion) => void;
    const completion = new Promise<FeedTraversalCompletion>((resolve) => {
      resolveCompletion = resolve;
    });

    const handle = subRepliesForRootIds(
      [rootEvent.id],
      (event) => receivedIds.add(event.id),
      {
        relayUrls: [harness.url],
        completeTraversal: true,
        onTraversalComplete: resolveCompletion,
      },
    );

    await expect(completion).resolves.toEqual({
      state: "complete",
      reason: "fixpoint-eose",
    });
    handle.close();
    expect([...receivedIds].sort()).toEqual(
      replies.map((event) => event.id).sort(),
    );
    const filters = session.entries
      .filter((entry) => entry.type === "request")
      .flatMap((entry) => entry.filters);
    expect(filters.every((filter) =>
      filter.limit === undefined &&
      (filter["#e"]?.length ?? 0) <= 50 &&
      typeof filter.since === "number"
    )).toBe(true);
  });

  it("keeps approved complete feed fixtures within their large ceilings", async () => {
    if (process.env.RELAY_AUDIT_OUTPUT !== "1") return;

    const wideDirect = Array.from({ length: 60 }, (_, index) =>
      finalizeEvent({
        created_at: rootEvent.created_at + 1,
        kind: 1,
        tags: [["e", rootEvent.id, "", "reply"]],
        content: `feed-audit-wide-${index}`,
      }, new Uint8Array(32).fill((index % 200) + 20))
    );
    const wide = [
      ...wideDirect,
      ...wideDirect.map((parent, index) =>
        finalizeEvent({
          created_at: rootEvent.created_at + 2,
          kind: 1,
          tags: [["e", parent.id, "", "reply"]],
          content: `feed-audit-wide-child-${index}`,
        }, new Uint8Array(32).fill((index % 180) + 50))
      ),
    ];
    const limit = Array.from({ length: 101 }, (_, index) =>
      finalizeEvent({
        created_at: rootEvent.created_at + 1,
        kind: 1,
        tags: [["e", rootEvent.id]],
        content: `feed-audit-limit-${index}`,
      }, new Uint8Array(32).fill((index % 220) + 10))
    );
    const handoffFirst = finalizeEvent({
      created_at: rootEvent.created_at + 1,
      kind: 1,
      tags: [["e", rootEvent.id, "", "reply"]],
      content: "feed-audit-handoff-first",
    }, new Uint8Array(32).fill(93));
    const handoffLate = finalizeEvent({
      created_at: handoffFirst.created_at,
      kind: 1,
      tags: [["e", rootEvent.id, "", "reply"]],
      content: "feed-audit-handoff-late",
    }, new Uint8Array(32).fill(94));
    const staticHarness = async (
      session: RelayTranscriptSession,
      replies: readonly Event[],
    ) => RelayTranscriptHarness.listen({
      session,
      onRequest(request) {
        const parentIds = new Set(
          request.filters.flatMap((filter) => filter["#e"] ?? []),
        );
        replies
          .filter((event) =>
            event.tags.some((tag) =>
              tag[0] === "e" && parentIds.has(tag[1] ?? "")
            )
          )
          .forEach((event) => request.sendEvent(event));
        request.sendEose();
      },
    });
    const wideSession = new RelayTranscriptSession();
    const limitSession = new RelayTranscriptSession();
    const handoffSession = new RelayTranscriptSession();
    const wideHarness = await staticHarness(wideSession, wide);
    const limitHarness = await staticHarness(limitSession, limit);
    let handoffPass = 0;
    let predecessor: RelayRequestController | undefined;
    const handoffHarness = await RelayTranscriptHarness.listen({
      session: handoffSession,
      onRequest(request) {
        const pass = handoffPass % 3;
        handoffPass += 1;
        if (pass === 0) {
          predecessor = request;
          request.sendEvent(handoffFirst);
          request.sendEose();
          return;
        }
        if (pass === 1) {
          predecessor?.sendEvent(handoffLate);
          request.sendEvent(handoffFirst);
          request.sendEose();
          return;
        }
        request.sendEvent(handoffFirst);
        request.sendEvent(handoffLate);
        request.sendEose();
      },
    });
    harnesses.push(wideHarness, limitHarness, handoffHarness);
    const measurements = {
      wide: [] as FeedCompleteMeasurement[],
      limit: [] as FeedCompleteMeasurement[],
      handoff: [] as FeedCompleteMeasurement[],
    };

    for (let run = 0; run < auditSampleCount(); run += 1) {
      measurements.wide.push(
        await measureCompleteBootstrapFixture(wideSession, wideHarness.url, wide),
      );
      measurements.limit.push(
        await measureCompleteBootstrapFixture(limitSession, limitHarness.url, limit),
      );
      measurements.handoff.push(
        await measureCompleteBootstrapFixture(
          handoffSession,
          handoffHarness.url,
          [handoffFirst, handoffLate],
        ),
      );
    }

    const summarizeFixture = (samples: readonly FeedCompleteMeasurement[]) => ({
      samples: samples.length,
      initialContentLatencyMs: summarizeSamples(
        samples.map((sample) => sample.initialLatencyMs),
      ),
      completionLatencyMs: summarizeSamples(
        samples.map((sample) => sample.completionLatencyMs),
      ),
      evidence: {
        requests: samples.at(-1)?.entries.filter(
          (entry) => entry.type === "request",
        ).length ?? 0,
        requestBytes: samples.at(-1)?.entries
          .filter((entry) => entry.type === "request")
          .reduce((total, entry) => total + entry.bytes, 0) ?? 0,
        returnedEvents: samples.at(-1)?.entries.filter(
          (entry) => entry.type === "event-returned",
        ).length ?? 0,
      },
    });
    const wideSummary = summarizeFixture(measurements.wide);
    const limitSummary = summarizeFixture(measurements.limit);
    const handoffSummary = summarizeFixture(measurements.handoff);
    emitAuditMeasurement({
      scenario: "wired-browser-feed-approved-large-local-fixtures",
      wide: wideSummary,
      limit: limitSummary,
      handoff: handoffSummary,
    });
    expect(wideSummary.completionLatencyMs.p95).toBeLessThanOrEqual(1_900);
    expect(limitSummary.completionLatencyMs.p95).toBeLessThanOrEqual(1_500);
    expect(handoffSummary.completionLatencyMs.p95).toBeLessThanOrEqual(60);
  }, 180_000);

  it("retains a live global-feed arrival across overlapping replacements", async () => {
    const firstReply = finalizeEvent({
      created_at: rootEvent.created_at + 1,
      kind: 1,
      tags: [["e", rootEvent.id, "", "reply"]],
      content: "feed-live-first",
    }, new Uint8Array(32).fill(91));
    const lateReply = finalizeEvent({
      created_at: firstReply.created_at,
      kind: 1,
      tags: [["e", rootEvent.id, "", "reply"]],
      content: "feed-live-late",
    }, new Uint8Array(32).fill(92));
    const session = new RelayTranscriptSession();
    const replyRequests: RelayRequestController[] = [];
    const harness = await RelayTranscriptHarness.listen({
      session,
      onRequest(request) {
        if (!request.filters.some((filter) => filter["#e"] !== undefined)) {
          request.sendEvent(rootEvent);
          request.sendEose();
          return;
        }
        replyRequests.push(request);
        if (replyRequests.length === 1) {
          request.sendEvent(firstReply);
          request.sendEose();
          return;
        }
        if (replyRequests.length === 2) {
          replyRequests[0]?.sendEvent(lateReply);
          request.sendEvent(firstReply);
          request.sendEose();
          return;
        }
        request.sendEvent(firstReply);
        request.sendEvent(lateReply);
        request.sendEose();
      },
    });
    harnesses.push(harness);
    await ensureRelaysConnected([harness.url]);
    const callbackCounts = new Map<string, number>();
    let resolveCompletion!: (completion: FeedTraversalCompletion) => void;
    const completion = new Promise<FeedTraversalCompletion>((resolve) => {
      resolveCompletion = resolve;
    });

    const handle = subGlobalFeed((event) => {
      callbackCounts.set(event.id, (callbackCounts.get(event.id) ?? 0) + 1);
    }, 24, {
      rootRelayUrls: [harness.url],
      replyRelayUrls: [harness.url],
      rootFilterDifficulty: 0,
      completeTraversal: true,
      onTraversalComplete: resolveCompletion,
    });

    await expect(completion).resolves.toEqual({
      state: "complete",
      reason: "fixpoint-eose",
    });
    handle.close();
    expect(callbackCounts).toEqual(new Map([
      [rootEvent.id, 1],
      [firstReply.id, 1],
      [lateReply.id, 1],
    ]));
    expect(replyRequests).toHaveLength(3);
    const active = new Set<string>();
    let peakReplySubscriptions = 0;
    session.entries.forEach((entry) => {
      if (
        entry.type === "request" &&
        entry.filters.some((filter) => filter["#e"] !== undefined)
      ) {
        active.add(entry.subscriptionId);
      }
      if (entry.type === "close") active.delete(entry.subscriptionId);
      peakReplySubscriptions = Math.max(peakReplySubscriptions, active.size);
    });
    expect(peakReplySubscriptions).toBe(2);
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
      tags: [[
        "e",
        root.id,
        index % 2 === 0 ? `${hintedRelay.url}/` : hintedRelay.url,
        "root",
      ]],
      content: `activity reply ${index}`,
    }, new Uint8Array(32).fill(index + 40)));

    const activityRelayUrls = activityRelays.map((relay) => relay.url);
    await ensureRelaysConnected(activityRelayUrls);
    const workflow = session.beginWorkflow("global-feed-missing-roots-hint-chunk");
    const receivedIds = new Set<string>();
    const handle = subGlobalFeed((event) => receivedIds.add(event.id), 24, {
      rootRelayUrls: activityRelayUrls,
      replyRelayUrls: activityRelayUrls,
      replyDepth: 1,
      dynamicRootHints: true,
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
    expect(rootRequests.filter((request) => request.relayUrl === hintedRelay.url)
      .every((request) => request.filters[0]?.limit ===
        request.filters[0]?.ids?.length)).toBe(true);
    const summary = session.summary(workflow);
    expect(summary).toMatchObject({
      openedConnections: 1,
      requests: 50,
      closes: 50,
      eose: 50,
      returnedEvents: 63,
      relayFanout: 3,
    });
    emitAuditMeasurement({
      scenario: "wired-browser-dynamic-feed-root-hints-local-fixture",
      samples: 1,
      completionLatencyMs: summary.completionLatencyMs,
      evidence: {
        discoveredHints: 1,
        connectedHints: summary.openedConnections,
        queriedHintRequests: rootRequests.filter(
          (request) => request.relayUrl === hintedRelay.url,
        ).length,
        resolvedHintRoots: rootEvents.filter((event) =>
          receivedIds.has(event.id)
        ).length,
      },
    });
  });

  it("resolves an exact missing root from an already-connected hint", async () => {
    const session = new RelayTranscriptSession();
    const hintedRoot = finalizeEvent({
      created_at: rootEvent.created_at + 150,
      kind: 1,
      tags: [],
      content: "already-connected hinted root",
    }, new Uint8Array(32).fill(69));
    const hintedRelay = await RelayTranscriptHarness.listen({
      session,
      onRequest(request) {
        if (request.filters[0]?.ids?.includes(hintedRoot.id)) {
          request.sendEvent(hintedRoot);
        }
        request.sendEose();
      },
    });
    const activityEvent = finalizeEvent({
      created_at: hintedRoot.created_at + 1,
      kind: 1,
      tags: [["e", hintedRoot.id, hintedRelay.url, "root"]],
      content: "already-connected hint activity",
    }, new Uint8Array(32).fill(70));
    const configuredRelay = await RelayTranscriptHarness.listen({
      session,
      onRequest(request) {
        const [filter] = request.filters;
        if (!filter?.ids && !filter?.["#e"]) request.sendEvent(activityEvent);
        request.sendEose();
      },
    });
    harnesses.push(configuredRelay, hintedRelay);

    await ensureRelaysConnected([configuredRelay.url, hintedRelay.url]);
    const workflow = session.beginWorkflow("global-feed-connected-hint");
    const receivedIds = new Set<string>();
    const handle = subGlobalFeed((event) => receivedIds.add(event.id), 24, {
      rootRelayUrls: [configuredRelay.url],
      replyRelayUrls: [configuredRelay.url],
      replyDepth: 0,
      dynamicRootHints: true,
    });

    await session.waitFor(() => receivedIds.has(hintedRoot.id));
    await session.waitFor(
      (entries) => entries.filter((entry) => entry.type === "close").length === 3,
    );
    handle.close();
    workflow.complete();

    expect([...receivedIds].sort()).toEqual(
      [activityEvent.id, hintedRoot.id].sort(),
    );
    expect(session.summary(workflow)).toMatchObject({
      openedConnections: 0,
      requests: 3,
      closes: 3,
      returnedEvents: 2,
      relayFanout: 2,
    });
  });

  it("does not query a newly connected hint after configured coverage resolves the root", async () => {
    const session = new RelayTranscriptSession();
    const configuredRoot = finalizeEvent({
      created_at: rootEvent.created_at + 200,
      kind: 1,
      tags: [],
      content: "configured root",
    }, new Uint8Array(32).fill(71));
    const hintedRelay = await RelayTranscriptHarness.listen({
      session,
      onRequest(request) {
        request.sendEose();
      },
    });
    const activityEvent = finalizeEvent({
      created_at: configuredRoot.created_at + 1,
      kind: 1,
      tags: [["e", configuredRoot.id, hintedRelay.url, "root"]],
      content: "configured-root activity",
    }, new Uint8Array(32).fill(72));
    const configuredRelay = await RelayTranscriptHarness.listen({
      session,
      onRequest(request) {
        const [filter] = request.filters;
        if (filter?.ids?.includes(configuredRoot.id)) {
          request.sendEvent(configuredRoot);
        } else if (!filter?.["#e"]) {
          request.sendEvent(activityEvent);
        }
        request.sendEose();
      },
    });
    harnesses.push(configuredRelay, hintedRelay);

    await ensureRelaysConnected([configuredRelay.url]);
    const workflow = session.beginWorkflow("global-feed-configured-before-hint");
    const receivedIds = new Set<string>();
    const handle = subGlobalFeed((event) => receivedIds.add(event.id), 24, {
      rootRelayUrls: [configuredRelay.url],
      replyRelayUrls: [configuredRelay.url],
      replyDepth: 0,
      dynamicRootHints: true,
    });

    await session.waitFor(() => receivedIds.has(configuredRoot.id));
    await session.waitFor((entries) =>
      entries.some((entry) =>
        entry.type === "connection-opened" && entry.relayUrl === hintedRelay.url
      )
    );
    await session.waitFor(
      (entries) => entries.filter((entry) => entry.type === "close").length === 2,
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    handle.close();
    workflow.complete();

    expect([...receivedIds].sort()).toEqual(
      [activityEvent.id, configuredRoot.id].sort(),
    );
    const requests = session.entries
      .slice(workflow.startIndex, workflow.completedIndex)
      .filter((entry) => entry.type === "request");
    expect(requests.filter((request) => request.relayUrl === configuredRelay.url))
      .toHaveLength(2);
    expect(requests.filter((request) => request.relayUrl === hintedRelay.url))
      .toHaveLength(0);
  });

  it("preserves activity identity when a hint closes without returning a root", async () => {
    const session = new RelayTranscriptSession();
    const missingRootId = "f".repeat(64);
    const failingHint = await RelayTranscriptHarness.listen({
      session,
      onRequest(request) {
        request.closeConnection();
      },
    });
    const activityEvent = finalizeEvent({
      created_at: rootEvent.created_at + 300,
      kind: 1,
      tags: [["e", missingRootId, failingHint.url, "root"]],
      content: "missing-root activity",
    }, new Uint8Array(32).fill(73));
    const configuredRelay = await RelayTranscriptHarness.listen({
      session,
      onRequest(request) {
        const [filter] = request.filters;
        if (!filter?.ids && !filter?.["#e"]) request.sendEvent(activityEvent);
        request.sendEose();
      },
    });
    harnesses.push(configuredRelay, failingHint);

    await ensureRelaysConnected([configuredRelay.url]);
    const workflow = session.beginWorkflow("global-feed-failed-hint");
    const receivedIds = new Set<string>();
    const handle = subGlobalFeed((event) => receivedIds.add(event.id), 24, {
      rootRelayUrls: [configuredRelay.url],
      replyRelayUrls: [configuredRelay.url],
      replyDepth: 0,
      dynamicRootHints: true,
    });

    await session.waitFor((entries) =>
      entries.some((entry) =>
        entry.type === "connection-closed" && entry.relayUrl === failingHint.url
      )
    );
    handle.close();
    workflow.complete();

    expect([...receivedIds]).toEqual([activityEvent.id]);
    const hintRequests = session.entries
      .slice(workflow.startIndex, workflow.completedIndex)
      .filter((entry) =>
        entry.type === "request" && entry.relayUrl === failingHint.url
      );
    expect(hintRequests).toHaveLength(1);
    const hintRequest = hintRequests[0];
    expect(hintRequest?.type).toBe("request");
    if (hintRequest?.type !== "request") {
      throw new Error("Expected one failed-hint root request");
    }
    expect(hintRequest.filters).toEqual([{
      ids: [missingRootId],
      kinds: [1],
      limit: 1,
    }]);
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
      { relayUrls, depth: 2, since: 1_999_000_000 },
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    const bootstrap = subRepliesForRootIds(
      [rootEvent.id],
      (event) => bootstrapIds.add(event.id),
      { relayUrls, depth: 2, since: 1_999_000_000 },
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
      repeatedOperations: 6,
      relayFanout: 2,
    });
    emitAuditMeasurement({
      scenario: "wired-browser-bootstrap-live-reply-overlap-local-fixture",
      samples: 1,
      completionLatencyMs: summary.completionLatencyMs,
    });
  });
});
