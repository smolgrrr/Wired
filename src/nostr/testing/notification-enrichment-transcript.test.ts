import { afterEach, describe, expect, it } from "vitest";
import {
  finalizeEvent,
  useWebSocketImplementation as configureWebSocketImplementation,
} from "nostr-tools";
import { WebSocket } from "ws";
import { ensureRelaysConnected } from "../client";
import {
  subNotifications,
  subProfilesOnce,
  subQuotedEventsOnce,
} from "../subscriptions";
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

const localPubkeyKey = new Uint8Array(32).fill(80);
const otherKey = new Uint8Array(32).fill(81);
const localAuthored = finalizeEvent({
  created_at: 2_000_000_000,
  kind: 1,
  tags: [["p", finalizeEvent({
    created_at: 1,
    kind: 1,
    tags: [],
    content: "pubkey seed",
  }, localPubkeyKey).pubkey]],
  content: "authored and tagged",
}, localPubkeyKey);
const authoredReaction = finalizeEvent({
  created_at: 2_000_000_001,
  kind: 7,
  tags: [["e", localAuthored.id]],
  content: "+",
}, localPubkeyKey);
const taggedMention = finalizeEvent({
  created_at: 2_000_000_002,
  kind: 1,
  tags: [["p", localAuthored.pubkey]],
  content: "mention",
}, otherKey);

function driveNotifications(request: RelayRequestController, delayMs = 0): void {
  const [filter] = request.filters;
  if (filter?.authors) {
    request.sendEvent(localAuthored, delayMs);
    if (filter.kinds?.includes(7)) {
      request.sendEvent(authoredReaction, delayMs);
    }
  } else if (filter?.["#p"]) {
    request.sendEvent(localAuthored, delayMs);
    request.sendEvent(taggedMention, delayMs);
  }
  request.sendEose(delayMs);
}

function workflowEntries(
  session: RelayTranscriptSession,
  workflow: { startIndex: number; completedIndex?: number },
): readonly RelayTranscriptEntry[] {
  return session.entries.slice(workflow.startIndex, workflow.completedIndex);
}

function expectExactFiniteCompletion(entries: readonly RelayTranscriptEntry[]): void {
  const requestIds = entries
    .flatMap((entry) => entry.type === "request" ? [entry.subscriptionId] : [])
    .sort();
  const idsFor = (type: "eose" | "close") => entries
    .flatMap((entry) => entry.type === type ? [entry.subscriptionId] : [])
    .sort();

  expect(idsFor("eose")).toEqual(requestIds);
  expect(idsFor("close")).toEqual(requestIds);
}

function expectExactQuoteFilters(entries: readonly RelayTranscriptEntry[]): void {
  entries
    .filter((entry) => entry.type === "request")
    .forEach((request) => {
      const ids = request.filters[0]?.ids;
      expect(ids).toHaveLength(1);
      expect(request.filters).toEqual([{
        ids,
        kinds: [1, 1068],
        limit: 1,
      }]);
    });
}

describe("notification and enrichment relay transcripts", () => {
  const harnesses: RelayTranscriptHarness[] = [];

  afterEach(async () => {
    await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
  });

  it("captures authored/tagged notification duplicates and finite completion", async () => {
    const completionLatencies: number[] = [];
    let evidenceEntries: readonly RelayTranscriptEntry[] = [];

    for (let run = 0; run < auditSampleCount(); run += 1) {
      const session = new RelayTranscriptSession();
      const runHarnesses = [
        await RelayTranscriptHarness.listen({
          session,
          onRequest: (request) => driveNotifications(request, 5),
        }),
        await RelayTranscriptHarness.listen({
          session,
          onRequest: (request) => driveNotifications(request, 5),
        }),
      ];
      harnesses.push(...runHarnesses);
      const relayUrls = runHarnesses.map((harness) => harness.url);
      await ensureRelaysConnected(relayUrls);
      const workflow = session.beginWorkflow(`notifications-${run + 1}`);
      const receivedIds = new Set<string>();
      let completed = false;
      const handle = subNotifications(
        [localAuthored.pubkey],
        (event) => receivedIds.add(event.id),
        () => {
          completed = true;
        },
        { relayUrls },
      );

      await session.waitFor(() => completed);
      await session.waitFor((entries) =>
        entries.filter((entry) => entry.type === "close").length === 4
      );
      handle.close();
      workflow.complete();

      expect([...receivedIds].sort()).toEqual(
        [localAuthored.id, taggedMention.id].sort(),
      );
      const summary = session.summary(workflow);
      expect(summary).toMatchObject({
        openedConnections: 0,
        requests: 4,
        closes: 4,
        eose: 4,
        returnedEvents: 6,
        repeatedOperations: 2,
        relayFanout: 2,
      });
      const requests = workflowEntries(session, workflow)
        .filter((entry) => entry.type === "request");
      expect(new Map(requests.map((request) => [
        JSON.stringify(request.filters),
        requests.filter((candidate) =>
          JSON.stringify(candidate.filters) === JSON.stringify(request.filters)
        ).length,
      ]))).toEqual(new Map([
        [JSON.stringify([{
          authors: [localAuthored.pubkey],
          kinds: [1],
          limit: 25,
        }]), 2],
        [JSON.stringify([{
          "#p": [localAuthored.pubkey],
          kinds: [1],
          limit: 50,
        }]), 2],
      ]));
      expectExactFiniteCompletion(workflowEntries(session, workflow));
      completionLatencies.push(summary.completionLatencyMs);
      evidenceEntries = workflowEntries(session, workflow);
    }

    emitAuditMeasurement({
      scenario: "wired-browser-notifications-local-fixture",
      samples: completionLatencies.length,
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

  it("retains exact notifications when a peer relay disconnects", async () => {
    const session = new RelayTranscriptSession();
    const healthyRelay = await RelayTranscriptHarness.listen({
      session,
      onRequest: (request) => driveNotifications(request, 5),
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
    const workflow = session.beginWorkflow("notifications-peer-disconnect");
    const receivedIds = new Set<string>();
    let completed = false;
    const handle = subNotifications(
      [localAuthored.pubkey],
      (event) => receivedIds.add(event.id),
      () => {
        completed = true;
      },
      { relayUrls },
    );

    await session.waitFor(() => completed);
    handle.close();
    workflow.complete();
    expect([...receivedIds].sort()).toEqual(
      [localAuthored.id, taggedMention.id].sort(),
    );
    expect(session.summary(workflow)).toMatchObject({
      requests: 4,
      returnedEvents: 3,
      eose: 2,
      relayFanout: 2,
    });
  });

  it("completes an empty notification union across all covered relays", async () => {
    const session = new RelayTranscriptSession();
    const relayUrls = await Promise.all([0, 1].map(async () => {
      const relay = await RelayTranscriptHarness.listen({
        session,
        onRequest(request) {
          request.sendEose(5);
        },
      });
      harnesses.push(relay);
      return relay.url;
    }));
    await ensureRelaysConnected(relayUrls);
    const workflow = session.beginWorkflow("notifications-empty");
    const receivedIds = new Set<string>();
    let completed = false;
    const handle = subNotifications(
      [localAuthored.pubkey],
      (event) => receivedIds.add(event.id),
      () => { completed = true; },
      { relayUrls },
    );

    await session.waitFor(() => completed);
    await session.waitFor((entries) =>
      entries.filter((entry) => entry.type === "close").length === 4
    );
    handle.close();
    workflow.complete();

    expect(receivedIds).toEqual(new Set());
    const entries = workflowEntries(session, workflow);
    expectExactFiniteCompletion(entries);
    expect(session.summary(workflow)).toMatchObject({
      requests: 4,
      closes: 4,
      eose: 4,
      returnedEvents: 0,
      relayFanout: 2,
    });
  });

  it("captures batched profiles and deterministic newest metadata inputs", async () => {
    const session = new RelayTranscriptSession();
    const profileKeys = [localPubkeyKey, otherKey];
    const listen = async (name: string, createdAt: number) =>
      RelayTranscriptHarness.listen({
        session,
        onRequest(request) {
          profileKeys.forEach((key, index) => request.sendEvent(finalizeEvent({
            created_at: createdAt,
            kind: 0,
            tags: [],
            content: JSON.stringify({ name: `${name}-${index}` }),
          }, key)));
          request.sendEose();
        },
      });
    const olderRelay = await listen("older", 2_000_000_010);
    const newerRelay = await listen("newer", 2_000_000_020);
    harnesses.push(olderRelay, newerRelay);
    const relayUrls = [olderRelay.url, newerRelay.url];
    const completionLatencies: number[] = [];
    let evidenceEntries: readonly RelayTranscriptEntry[] = [];
    for (let run = 0; run < auditSampleCount(); run += 1) {
      const workflow = session.beginWorkflow(`profiles-batched-${run + 1}`);
      const profiles = new Map<string, { name: string; createdAt: number }>();
      let completed = false;
      const handle = await subProfilesOnce(
        [localAuthored.pubkey, taggedMention.pubkey],
        (event) => {
          const name = (JSON.parse(event.content) as { name: string }).name;
          const existing = profiles.get(event.pubkey);
          if (!existing || existing.createdAt < event.created_at) {
            profiles.set(event.pubkey, { name, createdAt: event.created_at });
          }
        },
        () => {
          completed = true;
        },
        { relayUrls },
      );
      await session.waitFor(() => completed);
      await session.waitFor((entries) =>
        entries.filter((entry) => entry.type === "close").length === (run + 1) * 2
      );
      handle.close();
      workflow.complete();

      expect([...profiles.values()].map((profile) => profile.name).sort()).toEqual([
        "newer-0",
        "newer-1",
      ]);
      expect(session.summary(workflow)).toMatchObject({
        requests: 2,
        closes: 2,
        eose: 2,
        returnedEvents: 4,
        relayFanout: 2,
      });
      const entries = workflowEntries(session, workflow);
      const requests = entries.filter((entry) => entry.type === "request");
      expect(requests.every((request) =>
        JSON.stringify(request.filters) === JSON.stringify([{
          authors: [localAuthored.pubkey, taggedMention.pubkey],
          kinds: [0],
          limit: 2,
        }])
      )).toBe(true);
      expectExactFiniteCompletion(entries);
      completionLatencies.push(session.summary(workflow).completionLatencyMs);
      evidenceEntries = entries;
    }

    emitAuditMeasurement({
      scenario: "wired-browser-profiles-local-fixture",
      samples: completionLatencies.length,
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

  it("captures fallback quotes, a delayed extra hint, stale hints, and missing results", async () => {
    const session = new RelayTranscriptSession();
    const fallbackQuote = finalizeEvent({
      created_at: 2_000_000_030,
      kind: 1,
      tags: [],
      content: "fallback quote",
    }, new Uint8Array(32).fill(82));
    const hintedQuote = finalizeEvent({
      created_at: 2_000_000_031,
      kind: 1068,
      tags: [],
      content: "hinted quote",
    }, new Uint8Array(32).fill(83));
    const missingId = "f".repeat(64);
    const fallbackDriver = (request: RelayRequestController) => {
      if (request.filters[0]?.ids?.includes(fallbackQuote.id)) {
        request.sendEvent(fallbackQuote, 5);
      }
      request.sendEose(10);
    };
    const fallbackRelays = [
      await RelayTranscriptHarness.listen({ session, onRequest: fallbackDriver }),
      await RelayTranscriptHarness.listen({ session, onRequest: fallbackDriver }),
    ];
    const hintedRelay = await RelayTranscriptHarness.listen({
      session,
      onRequest(request) {
        if (request.filters[0]?.ids?.includes(hintedQuote.id)) {
          request.sendEvent(hintedQuote, 20);
        }
        request.sendEose(25);
      },
    });
    harnesses.push(...fallbackRelays, hintedRelay);
    const workflow = session.beginWorkflow("quoted-fallback-hint-missing");
    const receivedIds = new Set<string>();
    const completedIds = new Set<string>();
    const handle = await subQuotedEventsOnce(
      [
        { id: fallbackQuote.id, relays: [] },
        { id: hintedQuote.id, relays: [hintedRelay.url] },
        { id: missingId, relays: ["ws://127.0.0.1:9"] },
      ],
      (event) => receivedIds.add(event.id),
      (id) => completedIds.add(id),
      { fallbackRelayUrls: fallbackRelays.map((relay) => relay.url) },
    );
    await session.waitFor(() => completedIds.size === 3);
    await session.waitFor((entries) =>
      entries.filter((entry) => entry.type === "close").length === 7
    );
    handle.close();
    workflow.complete();

    expect([...receivedIds].sort()).toEqual([fallbackQuote.id, hintedQuote.id].sort());
    expect(completedIds).toEqual(new Set([fallbackQuote.id, hintedQuote.id, missingId]));
    const summary = session.summary(workflow);
    expect(summary).toMatchObject({
      openedConnections: 3,
      requests: 7,
      closes: 7,
      eose: 7,
      returnedEvents: 3,
      repeatedOperations: 4,
      relayFanout: 3,
    });
    const requests = workflowEntries(session, workflow)
      .filter((entry) => entry.type === "request");
    expectExactQuoteFilters(workflowEntries(session, workflow));
    expectExactFiniteCompletion(workflowEntries(session, workflow));
    expect(requests.filter((request) =>
      request.filters[0]?.ids?.includes(hintedQuote.id)
    )).toHaveLength(3);
    expect(requests.some((request) => request.relayUrl === "ws://127.0.0.1:9"))
      .toBe(false);
  });

  it("measures fallback and preconnected-hint quote enrichment", async () => {
    const session = new RelayTranscriptSession();
    const fallbackQuote = finalizeEvent({
      created_at: 2_000_000_040,
      kind: 1,
      tags: [],
      content: "normal fallback quote",
    }, new Uint8Array(32).fill(84));
    const hintedQuote = finalizeEvent({
      created_at: 2_000_000_041,
      kind: 1068,
      tags: [],
      content: "already-connected hint",
    }, new Uint8Array(32).fill(85));
    const fallbackDriver = (request: RelayRequestController) => {
      if (request.filters[0]?.ids?.includes(fallbackQuote.id)) {
        request.sendEvent(fallbackQuote, 5);
      }
      request.sendEose(10);
    };
    const fallbackRelays = [
      await RelayTranscriptHarness.listen({ session, onRequest: fallbackDriver }),
      await RelayTranscriptHarness.listen({ session, onRequest: fallbackDriver }),
    ];
    const hintedRelay = await RelayTranscriptHarness.listen({
      session,
      onRequest(request) {
        if (request.filters[0]?.ids?.includes(hintedQuote.id)) {
          request.sendEvent(hintedQuote, 15);
        }
        request.sendEose(20);
      },
    });
    harnesses.push(...fallbackRelays, hintedRelay);
    await ensureRelaysConnected([
      ...fallbackRelays.map((relay) => relay.url),
      hintedRelay.url,
    ]);
    const completionLatencies: number[] = [];
    let evidenceEntries: readonly RelayTranscriptEntry[] = [];

    for (let run = 0; run < auditSampleCount(); run += 1) {
      const workflow = session.beginWorkflow(`quotes-normal-${run + 1}`);
      const receivedIds = new Set<string>();
      const completedIds = new Set<string>();
      const handle = await subQuotedEventsOnce(
        [
          { id: fallbackQuote.id, relays: [] },
          { id: hintedQuote.id, relays: [hintedRelay.url] },
        ],
        (event) => receivedIds.add(event.id),
        (id) => completedIds.add(id),
        { fallbackRelayUrls: fallbackRelays.map((relay) => relay.url) },
      );
      await session.waitFor(() => completedIds.size === 2);
      await session.waitFor((entries) =>
        entries.filter((entry) => entry.type === "close").length === (run + 1) * 5
      );
      handle.close();
      workflow.complete();

      expect(receivedIds).toEqual(new Set([fallbackQuote.id, hintedQuote.id]));
      expect(session.summary(workflow)).toMatchObject({
        requests: 5,
        closes: 5,
        eose: 5,
        returnedEvents: 3,
        repeatedOperations: 3,
        relayFanout: 3,
      });
      const entries = workflowEntries(session, workflow);
      const hintedRequests = entries
        .filter((entry) => entry.type === "request")
        .filter((entry) => entry.relayUrl === hintedRelay.url);
      expect(hintedRequests).toHaveLength(1);
      expectExactQuoteFilters(entries);
      expectExactFiniteCompletion(entries);
      completionLatencies.push(session.summary(workflow).completionLatencyMs);
      evidenceEntries = entries;
    }

    emitAuditMeasurement({
      scenario: "wired-browser-quotes-local-fixture",
      samples: completionLatencies.length,
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
});
