import { afterEach, describe, expect, it } from "vitest";
import {
  finalizeEvent,
  type Event,
  useWebSocketImplementation as configureWebSocketImplementation,
} from "nostr-tools";
import { WebSocket } from "ws";
import {
  closeAllSubscriptions,
  ensureRelaysConnected,
  getRegistry,
  startFiniteQuery,
} from "../client";
import {
  DEFAULT_BROWSER_QUERY_DEADLINE_MS,
  type QueryCompletion as BrowserQueryCompletion,
} from "../browser-relay-access";
import {
  runReplyFrontierPrototype,
  startOverlappingLivePrototype,
  type ReplyFrontierQuery,
  type ReplyFrontierQueryResult,
} from "../prototypes/reply-frontier-prototype";
import {
  type QueryCompletion as ServerQueryCompletion,
  withFiniteRelaySession,
} from "../../../lib/serverRelaySession";
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

const secretKey = new Uint8Array(32).fill(12);

function reply(value: number, parentId: string): Event {
  return finalizeEvent({
    created_at: 2_000_000_000,
    kind: 1,
    tags: [["e", parentId, "", "reply"]],
    content: `reply-frontier-prototype-${value}`,
  }, new Uint8Array(secretKey).fill((value % 250) + 1));
}

function fixtures() {
  const root = finalizeEvent({
    created_at: 1_999_999_999,
    kind: 1,
    tags: [],
    content: "reply-frontier-prototype-root",
  }, secretKey);
  const deep: Event[] = [];
  let parentId = root.id;
  for (let value = 1; value <= 5; value += 1) {
    const event = reply(value, parentId);
    deep.push(event);
    parentId = event.id;
  }
  const wideParents = Array.from({ length: 60 }, (_, index) =>
    reply(index + 10, root.id)
  );
  const wide = [
    ...wideParents,
    ...wideParents.map((event, index) => reply(index + 1_000, event.id)),
  ];
  const limit = Array.from({ length: 101 }, (_, index) =>
    reply(index + 2_000, root.id)
  );
  const handoffFirst = reply(5_000, root.id);
  const handoffLate = reply(5_001, root.id);
  return {
    root,
    cases: {
      deep: { events: deep, expected: deep.length },
      wide: { events: wide, expected: wide.length },
      limit: { events: limit, expected: limit.length },
      handoff: {
        events: [handoffFirst],
        lateEvent: handoffLate,
        expected: 2,
      },
    },
  };
}

function transcriptMetrics(entries: readonly RelayTranscriptEntry[]) {
  let peakSubscriptions = 0;
  const active = new Set<string>();
  entries.forEach((entry) => {
    if (entry.type === "request") active.add(entry.subscriptionId);
    if (entry.type === "close") active.delete(entry.subscriptionId);
    peakSubscriptions = Math.max(peakSubscriptions, active.size);
  });
  return {
    requests: entries.filter((entry) => entry.type === "request").length,
    requestBytes: entries
      .filter((entry) => entry.type === "request")
      .reduce((total, entry) => total + entry.bytes, 0),
    returnedEvents: entries.filter((entry) => entry.type === "event-returned").length,
    peakSubscriptions,
  };
}

function classifyCompletion(
  completion: BrowserQueryCompletion | ServerQueryCompletion,
): ReplyFrontierQueryResult {
  if (completion.reason === "deadline") {
    return { state: "incomplete", reason: "deadline" };
  }
  if (completion.reason === "cancelled") {
    return { state: "incomplete", reason: "cancelled" };
  }
  const incompleteTarget = completion.targets.find((target) => target.state !== "eose");
  if (!incompleteTarget) return { state: "complete" };
  if (incompleteTarget.state === "connect-failed") {
    return { state: "incomplete", reason: "connect-failed" };
  }
  if (incompleteTarget.state === "cancelled") {
    return { state: "incomplete", reason: "cancelled" };
  }
  return {
    state: "incomplete",
    reason: incompleteTarget.state === "timed-out" ? "deadline" : "relay-closed",
  };
}

describe("PROTOTYPE reply-frontier alternatives through public transport seams", () => {
  const harnesses: RelayTranscriptHarness[] = [];

  afterEach(async () => {
    closeAllSubscriptions();
    await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
  });

  it("compares exact closure, work, and timing for browser and server runtimes", async () => {
    const fixture = fixtures();
    const session = new RelayTranscriptSession();
    let activeEvents: Event[] = [];
    let lateEvent: Event | undefined;
    let requestNumber = 0;
    const harness = await RelayTranscriptHarness.listen({
      session,
      onRequest(request) {
        requestNumber += 1;
        if (lateEvent && requestNumber === 2) {
          activeEvents.push(lateEvent);
          lateEvent = undefined;
        }
        const parentIds = request.filters[0]?.["#e"] ?? [];
        activeEvents
          .filter((event) =>
            event.tags.some((tag) =>
              tag[0] === "e" && parentIds.includes(tag[1] ?? "")
            )
          )
          .forEach((event) => request.sendEvent(event));
        request.sendEose();
      },
    });
    harnesses.push(harness);

    const browserQuery: ReplyFrontierQuery = async ({ parentIds, onEvent }) => {
      const query = startFiniteQuery({
        workflowOwner: "wired.browser.thread",
        filters: [{ "#e": [...parentIds], kinds: [1] }],
        coverage: {
          configuredRelayUrls: [harness.url],
          hintedRelayUrls: [],
        },
        completionDeadlineMs: DEFAULT_BROWSER_QUERY_DEADLINE_MS,
        onEvent,
      });
      return classifyCompletion(await query.done);
    };
    const measurements: object[] = [];
    const requestedRuntime = process.env.REPLY_FRONTIER_RUNTIME;
    const runtimes: readonly ("browser" | "server")[] =
      requestedRuntime === "browser" || requestedRuntime === "server"
        ? [requestedRuntime]
        : ["browser", "server"];

    for (const runtime of runtimes) {
      for (
        const candidate of [
          "frontier-once",
          "cumulative-fixpoint",
        ] as const
      ) {
        for (const [fixtureName, selected] of Object.entries(fixture.cases)) {
          const initialSamples: number[] = [];
          const completionSamples: number[] = [];
          let finalEvidence: ReturnType<typeof transcriptMetrics> | undefined;
          let finalRun: Awaited<ReturnType<typeof runReplyFrontierPrototype>> | undefined;
          let finalEntries: readonly RelayTranscriptEntry[] = [];
          const executeSamples = async (query: ReplyFrontierQuery) => {
            for (let sample = 0; sample < auditSampleCount(); sample += 1) {
              activeEvents = [...selected.events];
              lateEvent = "lateEvent" in selected ? selected.lateEvent : undefined;
              requestNumber = 0;
              const startIndex = session.entries.length;
              finalRun = await runReplyFrontierPrototype({
                candidate,
                rootIds: [fixture.root.id],
                query,
              });
              finalEntries = session.entries.slice(startIndex);
              finalEvidence = transcriptMetrics(finalEntries);
              if (finalRun.initialResultLatencyMs !== null) {
                initialSamples.push(finalRun.initialResultLatencyMs);
              }
              completionSamples.push(finalRun.completionLatencyMs);
            }
          };
          if (runtime === "browser") {
            await executeSamples(browserQuery);
          } else {
            await withFiniteRelaySession(
              { relayUrls: [harness.url], connectDeadlineMs: 5_000 },
              async (relaySession) => executeSamples(
                async ({ parentIds, onEvent }) => {
                  return classifyCompletion(await relaySession.query({
                    filters: [{ "#e": [...parentIds], kinds: [1] }],
                    relayUrls: [harness.url],
                    deadlineMs: 5_000,
                    onEvent,
                  }));
                },
              ),
            );
          }

          const expected = selected.expected;
          const shouldResolveAll =
            fixtureName !== "handoff" || candidate === "cumulative-fixpoint";
          const expectedEvents = shouldResolveAll && "lateEvent" in selected
            ? [...selected.events, selected.lateEvent]
            : selected.events;
          expect(
            finalRun?.eventIds.sort(),
            `${runtime}/${candidate}/${fixtureName}`,
          ).toEqual(
            expectedEvents.map((event) => event.id).sort(),
          );
          expect(finalRun?.state.completion).toBe("settled");
          expect(finalEvidence?.peakSubscriptions).toBe(1);
          expect(
            finalEntries
              .filter((entry) => entry.type === "request")
              .every((entry) => entry.filters[0]?.limit === undefined),
          ).toBe(true);
          measurements.push({
            runtime,
            candidate,
            fixture: fixtureName,
            exactReachable: finalRun?.eventIds.length,
            requiredReachable: expected,
            queryCount: finalRun?.queryCount,
            requestParentCounts: finalRun?.requestParentCounts,
            repeatedDeliveries: finalRun?.repeatedDeliveries,
            initialResultLatencyMs: initialSamples.length > 0
              ? summarizeSamples(initialSamples)
              : null,
            completionLatencyMs: summarizeSamples(completionSamples),
            ...finalEvidence,
          });
          if (process.env.RELAY_AUDIT_OUTPUT === "1") {
            console.info(JSON.stringify({
              scenario: "reply-frontier-prototype-alternative-complete",
              runtime,
              candidate,
              fixture: fixtureName,
              exactReachable: finalRun?.eventIds.length,
              requiredReachable: expected,
              queryCount: finalRun?.queryCount,
              repeatedDeliveries: finalRun?.repeatedDeliveries,
              initialResultLatencyMs: initialSamples.length > 0
                ? summarizeSamples(initialSamples)
                : null,
              completionLatencyMs: summarizeSamples(completionSamples),
              ...finalEvidence,
            }));
          }
        }
      }
    }

    emitAuditMeasurement({
      scenario: "reply-frontier-prototype-local-fixtures",
      samplesPerAlternative: auditSampleCount(),
      alternatives: measurements,
    });
  }, process.env.RELAY_AUDIT_OUTPUT === "1" ? 360_000 : 30_000);

  it("preserves incomplete completion from each public finite-query seam", async () => {
    const fixture = fixtures();
    for (const runtime of ["browser", "server"] as const) {
      const harness = await RelayTranscriptHarness.listen({
        onRequest(request) {
          request.closeConnection();
        },
      });
      harnesses.push(harness);
      const run = runtime === "browser"
        ? await runReplyFrontierPrototype({
          candidate: "cumulative-fixpoint",
          rootIds: [fixture.root.id],
          query: async ({ parentIds, onEvent }) => {
            const query = startFiniteQuery({
              workflowOwner: "wired.browser.thread",
              filters: [{ "#e": [...parentIds], kinds: [1] }],
              coverage: {
                configuredRelayUrls: [harness.url],
                hintedRelayUrls: [],
              },
              completionDeadlineMs: DEFAULT_BROWSER_QUERY_DEADLINE_MS,
              onEvent,
            });
            return classifyCompletion(await query.done);
          },
        })
        : await withFiniteRelaySession(
          { relayUrls: [harness.url], connectDeadlineMs: 5_000 },
          async (relaySession) =>
            runReplyFrontierPrototype({
              candidate: "cumulative-fixpoint",
              rootIds: [fixture.root.id],
              query: async ({ parentIds, onEvent }) =>
                classifyCompletion(await relaySession.query({
                  filters: [{ "#e": [...parentIds], kinds: [1] }],
                  relayUrls: [harness.url],
                  deadlineMs: 5_000,
                  onEvent,
                })),
            }),
        );
      expect(run.state).toMatchObject({
        terminal: true,
        completion: "relay-closed",
      });
    }
  });

  it("overlaps browser live replacements so a same-second handoff arrival is retained", async () => {
    const fixture = fixtures();
    const firstReply = fixture.cases.handoff.events[0]!;
    const lateReply = fixture.cases.handoff.lateEvent;
    const session = new RelayTranscriptSession();
    const requests: RelayRequestController[] = [];
    const harness = await RelayTranscriptHarness.listen({
      session,
      onRequest(request) {
        requests.push(request);
        const requestPosition = ((requests.length - 1) % 3) + 1;
        if (requestPosition === 1) {
          request.sendEvent(firstReply);
          request.sendEose();
          return;
        }
        if (requestPosition === 2) {
          requests[requests.length - 2]?.sendEvent(lateReply);
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

    const initialSamples: number[] = [];
    const completionSamples: number[] = [];
    let finalEntries: readonly RelayTranscriptEntry[] = [];
    let finalCallbackCount = 0;
    let finalReceivedIds = new Set<string>();
    for (let sample = 0; sample < auditSampleCount(); sample += 1) {
      const startedAt = Date.now();
      const startIndex = session.entries.length;
      const receivedIds = new Set<string>();
      let callbackCount = 0;
      let initialResultLatencyMs: number | null = null;
      const live = startOverlappingLivePrototype({
        rootIds: [fixture.root.id],
        open({ parentIds, onEvent, onEose }) {
          return getRegistry().subscribe([{
            filter: { "#e": [...parentIds], kinds: [1] },
            relayUrls: [harness.url],
            cb: onEvent,
            onEose,
          }]);
        },
        onEvent(event) {
          callbackCount += 1;
          initialResultLatencyMs ??= Date.now() - startedAt;
          receivedIds.add(event.id);
        },
      });

      await live.ready;
      const beforeClose = live.snapshot();
      const completionLatencyMs = Date.now() - startedAt;
      live.close();
      await session.waitFor(
        (entries) =>
          entries.slice(startIndex).filter((entry) => entry.type === "close")
            .length === 3,
      );
      finalEntries = session.entries.slice(startIndex);
      finalCallbackCount = callbackCount;
      finalReceivedIds = receivedIds;
      if (initialResultLatencyMs !== null) {
        initialSamples.push(initialResultLatencyMs);
      }
      completionSamples.push(completionLatencyMs);
      expect([...receivedIds].sort()).toEqual(
        [firstReply.id, lateReply.id].sort(),
      );
      expect(callbackCount).toBe(2);
      expect(beforeClose).toMatchObject({
        replacements: 2,
        activeSubscriptions: 1,
        peakSubscriptions: 2,
      });
    }

    const liveEvidence = transcriptMetrics(finalEntries);
    const requestEntries = finalEntries.filter((entry) => entry.type === "request");
    expect(requestEntries).toHaveLength(3);
    expect(
      requestEntries.every((entry) => entry.filters[0]?.limit === undefined),
    ).toBe(true);
    if (process.env.RELAY_AUDIT_OUTPUT === "1") {
      emitAuditMeasurement({
        scenario: "reply-frontier-prototype-browser-live-overlap",
        samples: auditSampleCount(),
        exactReachable: finalReceivedIds.size,
        requiredReachable: 2,
        callbackDeliveries: finalCallbackCount,
        repeatedRelayDeliveries:
          liveEvidence.returnedEvents - finalReceivedIds.size,
        initialResultLatencyMs: summarizeSamples(initialSamples),
        completionLatencyMs: summarizeSamples(completionSamples),
        ...liveEvidence,
      });
    }
  });
});
