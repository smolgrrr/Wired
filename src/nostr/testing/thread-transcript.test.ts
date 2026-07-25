import { afterEach, describe, expect, it, vi } from "vitest";
import {
  finalizeEvent,
  type Event,
  useWebSocketImplementation as configureWebSocketImplementation,
} from "nostr-tools";
import { WebSocket } from "ws";
import { ensureRelaysConnected } from "../client";
import { subNotesOnce, subReferencedEventsOnce } from "../subscriptions";
import {
  subNote,
  type ThreadTraversalCompletion,
} from "../subscriptions/thread";
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

const secretKey = new Uint8Array(32).fill(4);
const root = finalizeEvent({
  created_at: 2_000_000_000,
  kind: 1,
  tags: [],
  content: "root",
}, secretKey);
const reply = finalizeEvent({
  created_at: root.created_at + 1,
  kind: 1,
  tags: [["e", root.id, "", "reply"]],
  content: "reply",
}, secretKey);
const nestedReply = finalizeEvent({
  created_at: reply.created_at + 1,
  kind: 1,
  tags: [["e", reply.id, "", "reply"]],
  content: "nested reply with only its immediate parent",
}, secretKey);
const missingContextId = "f".repeat(64);

function driveThreadRequest(request: RelayRequestController): void {
  const [filter] = request.filters;
  if (filter?.ids?.includes(root.id)) {
    request.sendEvent(root);
  } else if (filter?.["#e"]?.includes(reply.id)) {
    request.sendEvent(reply);
    request.sendEvent(nestedReply);
  } else if (filter?.["#e"]?.includes(root.id)) {
    request.sendEvent(reply);
  }
  request.sendEose();
}

function workflowEntries(
  session: RelayTranscriptSession,
  startIndex: number,
  completedIndex: number | undefined,
): readonly RelayTranscriptEntry[] {
  return session.entries.slice(startIndex, completedIndex);
}

function expectMatchingProtocolCompletion(entries: readonly RelayTranscriptEntry[]): void {
  const requestIds = entries
    .filter((entry) => entry.type === "request")
    .map((entry) => entry.subscriptionId)
    .sort();
  expect(
    entries
      .filter((entry) => entry.type === "eose")
      .map((entry) => entry.subscriptionId)
      .sort(),
  ).toEqual(requestIds);
  expect(
    entries
      .filter((entry) => entry.type === "close")
      .map((entry) => entry.subscriptionId)
      .sort(),
  ).toEqual(requestIds);
}

interface CompleteFixtureMeasurement {
  initialLatencyMs: number;
  completionLatencyMs: number;
  entries: readonly RelayTranscriptEntry[];
}

async function measureCompleteFixture(
  session: RelayTranscriptSession,
  relayUrl: string,
  expectedEvents: readonly Event[],
): Promise<CompleteFixtureMeasurement> {
  await ensureRelaysConnected([relayUrl]);
  const startIndex = session.entries.length;
  const startedAt = Date.now();
  let initialLatencyMs: number | undefined;
  const callbackCounts = new Map<string, number>();
  let resolveCompletion!: (completion: ThreadTraversalCompletion) => void;
  const completionPromise = new Promise<ThreadTraversalCompletion>((resolve) => {
    resolveCompletion = resolve;
  });
  const handle = subNote(root.id, (event) => {
    initialLatencyMs ??= Date.now() - startedAt;
    callbackCounts.set(event.id, (callbackCounts.get(event.id) ?? 0) + 1);
  }, [], {
    configuredRelayUrls: [relayUrl],
    completeTraversal: true,
    onTraversalComplete: resolveCompletion,
  });
  const completion = await completionPromise;
  const completionLatencyMs = Date.now() - startedAt;
  handle.close();

  expect(completion).toEqual({
    state: "complete",
    reason: "fixpoint-eose",
  });
  expect(callbackCounts).toEqual(new Map(
    [root, ...expectedEvents].map((event) => [event.id, 1]),
  ));

  return {
    initialLatencyMs: initialLatencyMs ?? completionLatencyMs,
    completionLatencyMs,
    entries: session.entries.slice(startIndex),
  };
}

describe("thread relay transcript", () => {
  const harnesses: RelayTranscriptHarness[] = [];

  afterEach(async () => {
    await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
  });

  it("captures cold connection, duplicates, recursive replacement, and navigation cleanup", async () => {
    const completionLatencies: number[] = [];
    const initialContentLatencies: number[] = [];
    let evidenceEntries: readonly RelayTranscriptEntry[] = [];

    for (let run = 0; run < auditSampleCount(); run += 1) {
      const session = new RelayTranscriptSession();
      const runHarnesses = [
        await RelayTranscriptHarness.listen({ session, onRequest: driveThreadRequest }),
        await RelayTranscriptHarness.listen({ session, onRequest: driveThreadRequest }),
      ];
      const relayUrls = runHarnesses.map((harness) => harness.url);
      const workflow = session.beginWorkflow(`thread-navigation-${run + 1}`);
      const receivedIds = new Set<string>();
      let initialContentLatencyMs: number | undefined;

      await ensureRelaysConnected(relayUrls);
      const handle = subNote(root.id, (event) => {
        if (event.id === root.id && initialContentLatencyMs === undefined) {
          initialContentLatencyMs = Date.now() - workflow.startedAt;
        }
        receivedIds.add(event.id);
      }, [], { configuredRelayUrls: relayUrls });

      await session.waitFor(() => receivedIds.has(nestedReply.id));
      handle.close();
      await session.waitFor(
        (entries) => entries.filter((entry) => entry.type === "close").length === 8,
      );
      workflow.complete();

      expect([...receivedIds].sort()).toEqual(
        [root.id, reply.id, nestedReply.id].sort(),
      );
      const summary = session.summary(workflow);
      expect(summary).toMatchObject({
        openedConnections: 2,
        requests: 8,
        closes: 8,
        returnedEvents: 12,
        retries: 0,
        repeatedOperations: 4,
        relayFanout: 2,
      });
      expect(summary.connectionReuseCount).toBe(6);
      expect(summary.subscriptionLifetimesMs).toHaveLength(8);

      const entries = workflowEntries(session, workflow.startIndex, workflow.completedIndex);
      const requestFilters = entries
        .filter((entry) => entry.type === "request")
        .map((entry) => entry.filters);
      const filterCounts = new Map<string, number>();
      requestFilters.forEach((filters) => {
        const key = JSON.stringify(filters);
        filterCounts.set(key, (filterCounts.get(key) ?? 0) + 1);
      });
      expect(filterCounts).toEqual(new Map([
        [JSON.stringify([{ ids: [root.id], kinds: [1, 1068], limit: 1 }]), 2],
        [JSON.stringify([{ "#e": [root.id], kinds: [1], limit: 100 }]), 2],
        [JSON.stringify([{
          "#e": [root.id, reply.id],
          kinds: [1],
          limit: 100,
        }]), 2],
        [JSON.stringify([{
          "#e": [root.id, reply.id, nestedReply.id],
          kinds: [1],
          limit: 100,
        }]), 2],
      ]));
      expectMatchingProtocolCompletion(entries);

      completionLatencies.push(summary.completionLatencyMs);
      initialContentLatencies.push(initialContentLatencyMs ?? summary.completionLatencyMs);
      evidenceEntries = entries;
      await Promise.all(runHarnesses.map((harness) => harness.close()));
    }

    emitAuditMeasurement({
      scenario: "thread-navigation-cold-local-fixture",
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

  it("measures complete traversal against the ordinary thread comparator", async () => {
    const completionLatencies: number[] = [];
    const initialContentLatencies: number[] = [];
    let evidenceEntries: readonly RelayTranscriptEntry[] = [];

    for (let run = 0; run < auditSampleCount(); run += 1) {
      const session = new RelayTranscriptSession();
      const runHarnesses = [
        await RelayTranscriptHarness.listen({ session, onRequest: driveThreadRequest }),
        await RelayTranscriptHarness.listen({ session, onRequest: driveThreadRequest }),
      ];
      const relayUrls = runHarnesses.map((harness) => harness.url);
      await ensureRelaysConnected(relayUrls);
      const workflow = session.beginWorkflow(`thread-complete-${run + 1}`);
      const callbackCounts = new Map<string, number>();
      let initialContentLatencyMs: number | undefined;
      let resolveCompletion!: (completion: ThreadTraversalCompletion) => void;
      const completionPromise = new Promise<ThreadTraversalCompletion>((resolve) => {
        resolveCompletion = resolve;
      });

      const handle = subNote(root.id, (event) => {
        initialContentLatencyMs ??= Date.now() - workflow.startedAt;
        callbackCounts.set(event.id, (callbackCounts.get(event.id) ?? 0) + 1);
      }, [], {
        configuredRelayUrls: relayUrls,
        completeTraversal: true,
        onTraversalComplete: resolveCompletion,
      });
      await expect(completionPromise).resolves.toEqual({
        state: "complete",
        reason: "fixpoint-eose",
      });
      handle.close();
      await session.waitFor(
        (entries) => entries.filter((entry) => entry.type === "close").length === 8,
      );
      workflow.complete();

      expect(callbackCounts).toEqual(new Map([
        [root.id, 1],
        [reply.id, 1],
        [nestedReply.id, 1],
      ]));
      const summary = session.summary(workflow);
      expect(summary).toMatchObject({
        openedConnections: 0,
        requests: 8,
        closes: 8,
        returnedEvents: 12,
        retries: 0,
        repeatedOperations: 4,
        relayFanout: 2,
      });
      initialContentLatencies.push(
        initialContentLatencyMs ?? summary.completionLatencyMs,
      );
      completionLatencies.push(summary.completionLatencyMs);
      evidenceEntries = workflowEntries(
        session,
        workflow.startIndex,
        workflow.completedIndex,
      );
      await Promise.all(runHarnesses.map((harness) => harness.close()));
    }

    const initialContentLatencyMs = summarizeSamples(initialContentLatencies);
    const completionLatencyMs = summarizeSamples(completionLatencies);
    emitAuditMeasurement({
      scenario: "thread-complete-traversal-ordinary-local-fixture",
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
        peakReplySubscriptions: (() => {
          const active = new Set<string>();
          let peak = 0;
          evidenceEntries.forEach((entry) => {
            if (
              entry.type === "request" &&
              entry.filters.some((filter) => filter["#e"] !== undefined)
            ) {
              active.add(entry.subscriptionId);
            }
            if (entry.type === "close") active.delete(entry.subscriptionId);
            peak = Math.max(peak, active.size);
          });
          return peak;
        })(),
      },
    });
    if (process.env.RELAY_AUDIT_OUTPUT === "1") {
      expect(initialContentLatencyMs.p95).toBeLessThanOrEqual(28);
      expect(completionLatencyMs.p95).toBeLessThanOrEqual(48);
    }
  });

  it("resolves the exact wide reply closure without a result limit", async () => {
    const directReplies = Array.from({ length: 60 }, (_, index) =>
      finalizeEvent({
        created_at: root.created_at + 1,
        kind: 1,
        tags: [["e", root.id, "", "reply"]],
        content: `wide-direct-${index}`,
      }, secretKey)
    );
    const replies: Event[] = [
      ...directReplies,
      ...directReplies.map((parent, index) =>
        finalizeEvent({
          created_at: root.created_at + 2,
          kind: 1,
          tags: [["e", parent.id, "", "reply"]],
          content: `wide-child-${index}`,
        }, secretKey)
      ),
    ];
    const session = new RelayTranscriptSession();
    const harness = await RelayTranscriptHarness.listen({
      session,
      onRequest(request) {
        const requestedIds = new Set(
          request.filters.flatMap((filter) => filter.ids ?? []),
        );
        const parentIds = new Set(
          request.filters.flatMap((filter) => filter["#e"] ?? []),
        );
        if (requestedIds.has(root.id)) request.sendEvent(root);
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
    const handle = subNote(
      root.id,
      (event) => receivedIds.add(event.id),
      [],
      {
        configuredRelayUrls: [harness.url],
        completeTraversal: true,
      },
    );
    await session.waitFor(() => receivedIds.size === replies.length + 1);
    handle.close();

    expect([...receivedIds].sort()).toEqual(
      [root.id, ...replies.map((event) => event.id)].sort(),
    );
    const replyFilters = session.entries
      .filter((entry) => entry.type === "request")
      .flatMap((entry) => entry.filters)
      .filter((filter) => filter["#e"] !== undefined);
    expect(replyFilters.length).toBeGreaterThan(0);
    expect(
      replyFilters.every((filter) =>
        filter.limit === undefined && (filter["#e"]?.length ?? 0) <= 50
      ),
    ).toBe(true);
  });

  it("reports successor relay closure instead of a false live fixpoint", async () => {
    const firstReply = finalizeEvent({
      created_at: root.created_at + 1,
      kind: 1,
      tags: [["e", root.id, "", "reply"]],
      content: "close-before-successor-eose",
    }, secretKey);
    const session = new RelayTranscriptSession();
    let replyRequests = 0;
    const harness = await RelayTranscriptHarness.listen({
      session,
      onRequest(request) {
        if (request.filters.some((filter) => filter.ids?.includes(root.id))) {
          request.sendEvent(root);
          request.sendEose();
          return;
        }
        replyRequests += 1;
        if (replyRequests === 1) {
          request.sendEvent(firstReply);
          request.sendEose();
          return;
        }
        request.closeConnection();
      },
    });
    harnesses.push(harness);
    await ensureRelaysConnected([harness.url]);

    let completion: ThreadTraversalCompletion | undefined;
    const handle = subNote(root.id, () => {}, [], {
      configuredRelayUrls: [harness.url],
      completeTraversal: true,
      onTraversalComplete(result) {
        completion = result;
      },
    });
    await session.waitFor((entries) =>
      entries.some((entry) => entry.type === "connection-closed")
    );
    await vi.waitFor(() =>
      expect(completion).toEqual({
        state: "incomplete",
        reason: "relay-closed",
      })
    );
    handle.close();
  });

  it("reopens reply coverage after the finite root query connects its relay", async () => {
    const recoveredReply = finalizeEvent({
      created_at: root.created_at + 1,
      kind: 1,
      tags: [["e", root.id, "", "reply"]],
      content: "reply-from-root-recovered-relay",
    }, secretKey);
    const session = new RelayTranscriptSession();
    const harness = await RelayTranscriptHarness.listen({
      session,
      onRequest(request) {
        if (request.filters.some((filter) => filter.ids?.includes(root.id))) {
          request.sendEvent(root);
        }
        if (request.filters.some((filter) => filter["#e"]?.includes(root.id))) {
          request.sendEvent(recoveredReply);
        }
        request.sendEose();
      },
    });
    harnesses.push(harness);

    const receivedIds = new Set<string>();
    let completion: ThreadTraversalCompletion | undefined;
    const handle = subNote(root.id, (event) => receivedIds.add(event.id), [], {
      configuredRelayUrls: [harness.url],
      completeTraversal: true,
      onTraversalComplete(result) {
        completion = result;
      },
    });
    await vi.waitFor(() =>
      expect(completion).toEqual({
        state: "complete",
        reason: "fixpoint-eose",
      })
    );
    handle.close();

    expect([...receivedIds].sort()).toEqual(
      [root.id, recoveredReply.id].sort(),
    );
    expect(
      session.entries
        .filter((entry) => entry.type === "request")
        .some((entry) =>
          entry.filters.some((filter) => filter["#e"]?.includes(root.id))
        ),
    ).toBe(true);
  });

  it("retains a same-second live arrival across overlapping replacements", async () => {
    const firstReply = finalizeEvent({
      created_at: root.created_at + 1,
      kind: 1,
      tags: [["e", root.id, "", "reply"]],
      content: "handoff-first",
    }, secretKey);
    const lateReply = finalizeEvent({
      created_at: firstReply.created_at,
      kind: 1,
      tags: [["e", root.id, "", "reply"]],
      content: "handoff-late",
    }, secretKey);
    const session = new RelayTranscriptSession();
    const replyRequests: RelayRequestController[] = [];
    const harness = await RelayTranscriptHarness.listen({
      session,
      onRequest(request) {
        if (request.filters.some((filter) => filter.ids?.includes(root.id))) {
          request.sendEvent(root);
          request.sendEose();
          return;
        }
        if (!request.filters.some((filter) => filter["#e"] !== undefined)) {
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
    let completion: ThreadTraversalCompletion | undefined;
    const handle = subNote(root.id, (event) => {
      callbackCounts.set(event.id, (callbackCounts.get(event.id) ?? 0) + 1);
    }, [], {
      configuredRelayUrls: [harness.url],
      completeTraversal: true,
      onTraversalComplete(result) {
        completion = result;
      },
    });
    await vi.waitFor(() => {
      expect(completion).toEqual({
        state: "complete",
        reason: "fixpoint-eose",
      });
      expect(callbackCounts.get(lateReply.id)).toBe(1);
    });
    handle.close();

    expect(callbackCounts).toEqual(new Map([
      [root.id, 1],
      [firstReply.id, 1],
      [lateReply.id, 1],
    ]));
    let peakReplySubscriptions = 0;
    const activeReplySubscriptions = new Set<string>();
    session.entries.forEach((entry) => {
      if (
        entry.type === "request" &&
        entry.filters.some((filter) => filter["#e"] !== undefined)
      ) {
        activeReplySubscriptions.add(entry.subscriptionId);
      }
      if (entry.type === "close") {
        activeReplySubscriptions.delete(entry.subscriptionId);
      }
      peakReplySubscriptions = Math.max(
        peakReplySubscriptions,
        activeReplySubscriptions.size,
      );
    });
    expect(replyRequests).toHaveLength(3);
    expect(peakReplySubscriptions).toBe(2);
  });

  it("resolves depth five and 101 same-second legacy replies exactly", async () => {
    const directReplies = Array.from({ length: 101 }, (_, index) =>
      finalizeEvent({
        created_at: root.created_at + 1,
        kind: 1,
        tags: [["e", root.id]],
        content: `legacy-direct-${index}`,
      }, secretKey)
    );
    const deepReplies: Event[] = [];
    let parentId = directReplies[0]!.id;
    for (let depth = 2; depth <= 5; depth += 1) {
      const event = finalizeEvent({
        created_at: root.created_at + depth,
        kind: 1,
        tags: [["e", parentId]],
        content: `legacy-depth-${depth}`,
      }, secretKey);
      deepReplies.push(event);
      parentId = event.id;
    }
    const replies = [...directReplies, ...deepReplies];
    const session = new RelayTranscriptSession();
    const harness = await RelayTranscriptHarness.listen({
      session,
      onRequest(request) {
        if (request.filters.some((filter) => filter.ids?.includes(root.id))) {
          request.sendEvent(root);
        }
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
    let completion: ThreadTraversalCompletion | undefined;
    const handle = subNote(root.id, (event) => receivedIds.add(event.id), [], {
      configuredRelayUrls: [harness.url],
      completeTraversal: true,
      onTraversalComplete(result) {
        completion = result;
      },
    });
    await vi.waitFor(() =>
      expect(completion).toEqual({
        state: "complete",
        reason: "fixpoint-eose",
      }), { timeout: 5_000 }
    );
    handle.close();

    expect([...receivedIds].sort()).toEqual(
      [root.id, ...replies.map((event) => event.id)].sort(),
    );
  });

  it("keeps approved large complete-traversal fixtures within their ceilings", async () => {
    if (process.env.RELAY_AUDIT_OUTPUT !== "1") return;

    const wideDirectReplies = Array.from({ length: 60 }, (_, index) =>
      finalizeEvent({
        created_at: root.created_at + 1,
        kind: 1,
        tags: [["e", root.id, "", "reply"]],
        content: `audit-wide-direct-${index}`,
      }, secretKey)
    );
    const wideReplies = [
      ...wideDirectReplies,
      ...wideDirectReplies.map((parent, index) =>
        finalizeEvent({
          created_at: root.created_at + 2,
          kind: 1,
          tags: [["e", parent.id, "", "reply"]],
          content: `audit-wide-child-${index}`,
        }, secretKey)
      ),
    ];
    const limitReplies = Array.from({ length: 101 }, (_, index) =>
      finalizeEvent({
        created_at: root.created_at + 1,
        kind: 1,
        tags: [["e", root.id]],
        content: `audit-limit-${index}`,
      }, secretKey)
    );
    const handoffFirst = finalizeEvent({
      created_at: root.created_at + 1,
      kind: 1,
      tags: [["e", root.id, "", "reply"]],
      content: "audit-handoff-first",
    }, secretKey);
    const handoffLate = finalizeEvent({
      created_at: handoffFirst.created_at,
      kind: 1,
      tags: [["e", root.id, "", "reply"]],
      content: "audit-handoff-late",
    }, secretKey);
    const staticHarness = async (
      session: RelayTranscriptSession,
      replies: readonly Event[],
    ) => RelayTranscriptHarness.listen({
      session,
      onRequest(request) {
        if (request.filters.some((filter) => filter.ids?.includes(root.id))) {
          request.sendEvent(root);
        }
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
    const wideHarness = await staticHarness(wideSession, wideReplies);
    const limitHarness = await staticHarness(limitSession, limitReplies);
    let replyRequestInRun = 0;
    let predecessor: RelayRequestController | undefined;
    const handoffHarness = await RelayTranscriptHarness.listen({
      session: handoffSession,
      onRequest(request) {
        if (request.filters.some((filter) => filter.ids?.includes(root.id))) {
          request.sendEvent(root);
          request.sendEose();
          return;
        }
        const pass = replyRequestInRun % 3;
        replyRequestInRun += 1;
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
      wide: [] as CompleteFixtureMeasurement[],
      limit: [] as CompleteFixtureMeasurement[],
      handoff: [] as CompleteFixtureMeasurement[],
    };
    for (let run = 0; run < auditSampleCount(); run += 1) {
      measurements.wide.push(
        await measureCompleteFixture(wideSession, wideHarness.url, wideReplies),
      );
      measurements.limit.push(
        await measureCompleteFixture(limitSession, limitHarness.url, limitReplies),
      );
      measurements.handoff.push(
        await measureCompleteFixture(
          handoffSession,
          handoffHarness.url,
          [handoffFirst, handoffLate],
        ),
      );
    }

    const summarizeFixture = (
      samples: readonly CompleteFixtureMeasurement[],
    ) => ({
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
    const wide = summarizeFixture(measurements.wide);
    const limit = summarizeFixture(measurements.limit);
    const handoff = summarizeFixture(measurements.handoff);

    emitAuditMeasurement({
      scenario: "thread-complete-traversal-approved-large-local-fixtures",
      wide,
      limit,
      handoff,
    });
    expect(wide.completionLatencyMs.p95).toBeLessThanOrEqual(1_900);
    expect(limit.completionLatencyMs.p95).toBeLessThanOrEqual(1_500);
    expect(handoff.completionLatencyMs.p95).toBeLessThanOrEqual(60);
  }, 180_000);

  it("batches referenced context and completes missing IDs at EOSE", async () => {
    const session = new RelayTranscriptSession();
    harnesses.push(
      await RelayTranscriptHarness.listen({
        session,
        onRequest(request) {
          request.sendEvent(root, 10);
          request.sendEose(10);
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
    await ensureRelaysConnected(relayUrls);
    const completionLatencies: number[] = [];
    let evidenceEntries: readonly RelayTranscriptEntry[] = [];
    for (let run = 0; run < auditSampleCount(); run += 1) {
      const workflow = session.beginWorkflow(`thread-referenced-context-${run + 1}`);
      const receivedIds = new Set<string>();
      const handle = subNotesOnce(
        [root.id, missingContextId],
        (event) => receivedIds.add(event.id),
        relayUrls,
      );
      await session.waitFor(
        (entries) => entries.filter((entry) => entry.type === "close").length ===
          (run + 1) * 2,
      );
      handle.close();
      workflow.complete();

      expect([...receivedIds]).toEqual([root.id]);
      const entries = workflowEntries(session, workflow.startIndex, workflow.completedIndex);
      const requests = entries.filter((entry) => entry.type === "request");
      expect(requests).toHaveLength(2);
      expect(requests.every((entry) => entry.filters.length === 1)).toBe(true);
      expect(requests[0]?.filters).toEqual([{
        ids: [root.id, missingContextId],
        kinds: [1],
        limit: 2,
      }]);
      expect(requests[1]?.filters).toEqual(requests[0]?.filters);
      expectMatchingProtocolCompletion(entries);
      const summary = session.summary(workflow);
      expect(summary).toMatchObject({
        openedConnections: 0,
        requests: 2,
        closes: 2,
        returnedEvents: 1,
        eose: 2,
        relayFanout: 2,
      });
      completionLatencies.push(summary.completionLatencyMs);
      evidenceEntries = entries;
    }
    emitAuditMeasurement({
      scenario: "thread-referenced-context-warm-local-fixture",
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

  it("restores missing referenced context from its exact relay hint", async () => {
    const session = new RelayTranscriptSession();
    const configuredHarness = await RelayTranscriptHarness.listen({
      session,
      onRequest(request) {
        request.sendEose();
      },
    });
    const hintedHarness = await RelayTranscriptHarness.listen({
      session,
      onRequest(request) {
        if (request.filters[0]?.ids?.includes(root.id)) {
          request.sendEvent(root);
        }
        request.sendEose();
      },
    });
    harnesses.push(configuredHarness, hintedHarness);
    await ensureRelaysConnected([configuredHarness.url]);

    const completionLatencies: number[] = [];
    const initialContextLatencies: number[] = [];
    let connectedHints = 0;
    let evidenceEntries: readonly RelayTranscriptEntry[] = [];
    for (let run = 0; run < auditSampleCount(); run += 1) {
      const workflow = session.beginWorkflow(`thread-hinted-context-${run + 1}`);
      const receivedIds = new Set<string>();
      let initialContextLatencyMs: number | undefined;
      const handle = subReferencedEventsOnce(
        [{ id: root.id, relays: [hintedHarness.url] }],
        (event) => {
          initialContextLatencyMs ??= Date.now() - workflow.startedAt;
          receivedIds.add(event.id);
        },
        {
          relayUrls: [configuredHarness.url],
          dynamicHints: true,
        },
      );

      await session.waitFor(
        (entries) => entries.filter((entry) => entry.type === "close").length ===
          (run + 1) * 2,
      );
      handle.close();
      workflow.complete();

      expect([...receivedIds]).toEqual([root.id]);
      const entries = workflowEntries(session, workflow.startIndex, workflow.completedIndex);
      const requests = entries.filter((entry) => entry.type === "request");
      expect(requests).toHaveLength(2);
      const exactFilter = [{ ids: [root.id], kinds: [1], limit: 1 }];
      expect(
        requests.find((entry) => entry.relayUrl === configuredHarness.url)?.filters,
      ).toEqual(exactFilter);
      expect(
        requests.find((entry) => entry.relayUrl === hintedHarness.url)?.filters,
      ).toEqual(exactFilter);
      expectMatchingProtocolCompletion(entries);

      const summary = session.summary(workflow);
      expect(summary).toMatchObject({
        openedConnections: run === 0 ? 1 : 0,
        requests: 2,
        closes: 2,
        returnedEvents: 1,
        eose: 2,
        repeatedOperations: 1,
        relayFanout: 2,
      });
      completionLatencies.push(summary.completionLatencyMs);
      initialContextLatencies.push(
        initialContextLatencyMs ?? summary.completionLatencyMs,
      );
      connectedHints += entries.filter(
        (entry) =>
          entry.type === "connection-opened" &&
          entry.relayUrl === hintedHarness.url,
      ).length;
      evidenceEntries = entries;
    }

    const initialContextLatencyMs = summarizeSamples(initialContextLatencies);
    const completionLatencyMs = summarizeSamples(completionLatencies);
    emitAuditMeasurement({
      scenario: "thread-hinted-context-recovery-local-fixture",
      samples: completionLatencies.length,
      initialContextLatencyMs,
      completionLatencyMs,
      evidence: {
        configuredRequests: 1,
        discoveredHints: 1,
        connectedHints,
        queriedHintRequests: 1,
        resolvedContextEvents: 1,
        filters: evidenceEntries
          .filter((entry) => entry.type === "request")
          .map((entry) => ({
            relayRole: entry.relayUrl === hintedHarness.url ? "hint" : "configured",
            filters: entry.filters,
          })),
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
      expect(initialContextLatencyMs.p95).toBeLessThanOrEqual(19);
      expect(completionLatencyMs.p95).toBeLessThanOrEqual(19);
    }
  });
});
