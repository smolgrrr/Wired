import { afterEach, describe, expect, it, vi } from "vitest";
import {
  finalizeEvent,
  matchFilters,
  nip19,
  Relay,
  type Subscription,
  useWebSocketImplementation as configureWebSocketImplementation,
} from "nostr-tools";
import { WebSocket } from "ws";
import {
  fetchThreadEventsFromRelays,
  resolveThreadPreview,
} from "../../../lib/threadPreview";
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
import { RelayWorkflowStatusIngestService } from "../../../lib/relayWorkflowStatusIngest";
import { MemoryRelayWorkflowStatusStore } from "../../../lib/relayWorkflowStatusStore";
import { createPreviewResolutionObserver } from "../../../lib/relayWorkflowPreviewCorrelation";

configureWebSocketImplementation(WebSocket);

const secretKey = new Uint8Array(32).fill(5);
const root = finalizeEvent({
  created_at: 2_000_000_000,
  kind: 1,
  tags: [],
  content: "preview root",
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
  tags: [
    ["e", root.id, "", "root"],
    ["e", reply.id, "", "reply"],
  ],
  content: "nested reply",
}, secretKey);

function returnCompleteThread(request: RelayRequestController, delayMs = 0): void {
  expect(request.filters).toEqual([
    { ids: [root.id], kinds: [1], limit: 1 },
    { "#e": [root.id], kinds: [1], limit: 500 },
  ]);
  request.sendEvent(root, delayMs);
  request.sendEvent(reply, delayMs);
  request.sendEvent(nestedReply, delayMs);
  request.sendEose(delayMs);
}

function expectMatchingCompletion(entries: readonly RelayTranscriptEntry[]): void {
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

describe("thread preview relay transcript", () => {
  const harnesses: RelayTranscriptHarness[] = [];

  afterEach(async () => {
    await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
  });

  it("unions an encoded event hint with configured coverage and deduplicates results", async () => {
    const session = new RelayTranscriptSession();
    const configuredHarness = await RelayTranscriptHarness.listen({
      session,
      onRequest: returnCompleteThread,
    });
    const hintedHarness = await RelayTranscriptHarness.listen({
      session,
      onRequest: returnCompleteThread,
    });
    harnesses.push(configuredHarness, hintedHarness);
    const ref = nip19.neventEncode({ id: root.id, relays: [hintedHarness.url] });
    const completionLatencies: number[] = [];
    let evidenceEntries: readonly RelayTranscriptEntry[] = [];

    for (let run = 0; run < auditSampleCount(); run += 1) {
      const workflow = session.beginWorkflow(`thread-preview-${run + 1}`);
      const preview = await resolveThreadPreview(ref, {
        origin: "https://wiredsignal.online",
        fetchImpl: async () => new Response(null, { status: 404 }),
        relayFallback: (eventId, relayHints) => {
          expect(relayHints).toEqual([hintedHarness.url]);
          return fetchThreadEventsFromRelays(eventId, relayHints, {
            configuredRelayUrls: [configuredHarness.url],
          });
        },
      });
      await session.waitFor(
        (entries) =>
          entries.filter((entry) => entry.type === "connection-closed").length ===
          (run + 1) * 2,
      );
      workflow.complete();

      expect(preview).toMatchObject({
        eventId: root.id,
        excerpt: "preview root",
        replyCount: 2,
      });
      const summary = session.summary(workflow);
      expect(summary).toMatchObject({
        openedConnections: 2,
        closedConnections: 2,
        requests: 2,
        closes: 2,
        returnedEvents: 6,
        eose: 2,
        repeatedOperations: 1,
        relayFanout: 2,
      });
      const entries = session.entries.slice(
        workflow.startIndex,
        workflow.completedIndex,
      );
      expectMatchingCompletion(entries);
      expect(
        entries
          .filter((entry) => entry.type === "request")
          .map((entry) => entry.relayUrl)
          .sort(),
      ).toEqual([configuredHarness.url, hintedHarness.url].sort());
      completionLatencies.push(summary.completionLatencyMs);
      evidenceEntries = entries;
    }

    emitAuditMeasurement({
      scenario: "thread-preview-local-fixture",
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

  it("records the legacy descendant that root-only preview filters cannot reach", async () => {
    const session = new RelayTranscriptSession();
    const legacyNestedReply = finalizeEvent({
      created_at: reply.created_at + 1,
      kind: 1,
      tags: [["e", reply.id, "", "reply"]],
      content: "legacy nested reply",
    }, secretKey);
    harnesses.push(await RelayTranscriptHarness.listen({
      session,
      onRequest(request) {
        [root, reply, legacyNestedReply]
          .filter((event) => matchFilters(request.filters, event))
          .forEach((event) => request.sendEvent(event));
        request.sendEose();
      },
    }));
    const workflow = session.beginWorkflow("thread-preview-legacy-descendant");
    const events = await fetchThreadEventsFromRelays(root.id, [], {
      configuredRelayUrls: [harnesses[0]!.url],
    });
    workflow.complete();

    expect(events.map((event) => event.id)).toEqual([root.id, reply.id]);
    expect(events).not.toContainEqual(legacyNestedReply);
    expect(session.summary(workflow)).toMatchObject({
      requests: 1,
      returnedEvents: 2,
      relayFanout: 1,
    });
  });

  it("keeps preview identity and p95 stable with correlation disabled or enabled", async () => {
    const session = new RelayTranscriptSession();
    const harness = await RelayTranscriptHarness.listen({
      session,
      onRequest: returnCompleteThread,
    });
    harnesses.push(harness);
    const store = new MemoryRelayWorkflowStatusStore();
    const service = new RelayWorkflowStatusIngestService(store);
    const deferred: Promise<unknown>[] = [];
    const variants = [
      { name: "disabled", onResolution: undefined },
      {
        name: "enabled",
        onResolution: createPreviewResolutionObserver({
          endpoint: "thread-html",
          enabled: true,
          service,
          secret: "controlled-preview-correlation-secret-32-bytes",
          defer: (promise) => { deferred.push(promise); },
        }),
      },
    ];
    const latencies = new Map(variants.map((variant) => [variant.name, [] as number[]]));

    for (let run = 0; run < 20; run += 1) {
      for (const variant of variants) {
        const workflow = session.beginWorkflow(`preview-correlation-${variant.name}-${run}`);
        const preview = await resolveThreadPreview(root.id, {
          origin: "https://wiredsignal.online",
          fetchImpl: async () => new Response(null, { status: 404 }),
          relayFallback: (eventId, relayHints) =>
            fetchThreadEventsFromRelays(eventId, relayHints, {
              configuredRelayUrls: [harness.url],
            }),
          ...(variant.onResolution ? { onResolution: variant.onResolution } : {}),
        });
        workflow.complete();
        expect(preview).toMatchObject({ eventId: root.id, replyCount: 2 });
        latencies.get(variant.name)!.push(session.summary(workflow).completionLatencyMs);
      }
    }
    await Promise.all(deferred);

    const p95 = Object.fromEntries(
      [...latencies].map(([name, samples]) => [name, summarizeSamples(samples).p95]),
    );
    expect(p95.enabled).toBeLessThanOrEqual(p95.disabled + 3);
    expect(store.rows).toHaveLength(20);
    if (process.env.RELAY_AUDIT_OUTPUT === "1") {
      console.info(JSON.stringify({
        scenario: "thread-preview-correlation-local-fixture",
        samplesPerVariant: 20,
        completionP95Ms: p95,
      }));
    }
  });

  it("retains complete output but reaches the deadline after a relay disconnects", async () => {
    const session = new RelayTranscriptSession();
    harnesses.push(
      await RelayTranscriptHarness.listen({
        session,
        onRequest(request) {
          returnCompleteThread(request, 10);
        },
      }),
      await RelayTranscriptHarness.listen({
        session,
        onRequest(request) {
          request.closeConnection();
        },
      }),
    );
    const workflow = session.beginWorkflow("thread-preview-degraded-relay");
    const preview = await resolveThreadPreview(root.id, {
      origin: "https://wiredsignal.online",
      fetchImpl: async () => new Response(null, { status: 404 }),
      relayFallback: (eventId, relayHints) =>
        fetchThreadEventsFromRelays(eventId, relayHints, {
          configuredRelayUrls: harnesses.map((harness) => harness.url),
          timeoutMs: process.env.RELAY_AUDIT_OUTPUT === "1" ? 2_500 : 50,
        }),
    });
    workflow.complete();

    expect(preview?.replyCount).toBe(2);
    const summary = session.summary(workflow);
    expect(summary).toMatchObject({
      requests: 2,
      returnedEvents: 3,
      eose: 1,
      relayFanout: 2,
    });
    emitAuditMeasurement({
      scenario: "thread-preview-degraded-relay-local-fixture",
      samples: 1,
      completionLatencyMs: summary.completionLatencyMs,
    });
  });

  it("settles a terminal subscription close and clears its EOSE timer", async () => {
    vi.useFakeTimers();
    try {
      const completedRelay = new Relay("ws://completed-relay.invalid");
      const closedRelay = new Relay("ws://closed-relay.invalid");
      const closedSubscription = {
        close: vi.fn(),
        receivedEose: vi.fn(),
      } as unknown as Subscription;
      vi.spyOn(completedRelay, "subscribe").mockImplementation((_filters, params) => {
        queueMicrotask(() => params.oneose?.());
        return { close: vi.fn() } as unknown as Subscription;
      });
      vi.spyOn(closedRelay, "subscribe").mockImplementation((_filters, params) => {
        queueMicrotask(() => params.onclose?.("relay connection closed"));
        return closedSubscription;
      });

      expect(await fetchThreadEventsFromRelays(root.id, [], {
        configuredRelayUrls: [completedRelay.url, closedRelay.url],
        connectRelay: async (url) =>
          url.includes("completed-relay") ? completedRelay : closedRelay,
        timeoutMs: 2_500,
      })).toEqual([]);

      expect(closedSubscription.receivedEose).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes a connection that arrives after the connection deadline", async () => {
    vi.useFakeTimers();
    try {
      const lateRelay = new Relay("ws://late-relay.invalid");
      const close = vi.spyOn(lateRelay, "close");
      const result = fetchThreadEventsFromRelays(root.id, [], {
        configuredRelayUrls: [lateRelay.url],
        connectRelay: async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return lateRelay;
        },
        timeoutMs: 5,
      });

      await vi.advanceTimersByTimeAsync(5);
      expect(await result).toEqual([]);
      expect(close).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(15);
      expect(close).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
