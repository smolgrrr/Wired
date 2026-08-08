import { afterEach, describe, expect, it, vi } from "vitest";
import {
  finalizeEvent,
  useWebSocketImplementation as configureWebSocketImplementation,
  type Event,
} from "nostr-tools";
import { WebSocket } from "ws";
import { ensureRelaysConnected } from "../client";
import { subProfilesOnce } from "../subscriptions";
import {
  auditSampleCount,
  emitAuditMeasurement,
  summarizeSamples,
} from "./audit-metrics";
import {
  RelayTranscriptHarness,
  RelayTranscriptSession,
  type RelayTranscriptEntry,
} from "./relay-transcript";

vi.mock("../../config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../config")>()),
  COMPLETE_PROFILE_BATCHES_ENABLED: true,
}));

configureWebSocketImplementation(WebSocket);

function secretKey(index: number): Uint8Array {
  const key = new Uint8Array(32);
  new DataView(key.buffer).setUint32(28, index + 1);
  return key;
}

const profileFixtures = Array.from({ length: 251 }, (_, index) => {
  const key = secretKey(index);
  return {
    older: finalizeEvent({
      created_at: 2_000_000_010,
      kind: 0,
      tags: [],
      content: JSON.stringify({ name: `older-${index}` }),
    }, key),
    newer: finalizeEvent({
      created_at: 2_000_000_020,
      kind: 0,
      tags: [],
      content: JSON.stringify({ name: `newer-${index}` }),
    }, key),
  };
});
const pubkeys = profileFixtures.map(({ newer }) => newer.pubkey);

function workflowEntries(
  session: RelayTranscriptSession,
  startIndex: number,
  completedIndex: number | undefined,
): readonly RelayTranscriptEntry[] {
  return session.entries.slice(startIndex, completedIndex);
}

describe("complete profile batch relay transcript", () => {
  const harnesses: RelayTranscriptHarness[] = [];

  afterEach(async () => {
    await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
  });

  it("resolves all 251 authors in complete chunks with newest metadata", async () => {
    const session = new RelayTranscriptSession();
    const fixturesByPubkey = new Map(
      profileFixtures.map((fixture) => [fixture.newer.pubkey, fixture]),
    );
    const listen = async (version: "older" | "newer") =>
      RelayTranscriptHarness.listen({
        session,
        onRequest(request) {
          request.filters[0]?.authors?.forEach((pubkey) => {
            const event = fixturesByPubkey.get(pubkey)?.[version];
            if (event) request.sendEvent(event);
          });
          request.sendEose();
        },
      });
    const olderRelay = await listen("older");
    const newerRelay = await listen("newer");
    harnesses.push(olderRelay, newerRelay);
    const relayUrls = [olderRelay.url, newerRelay.url];
    await ensureRelaysConnected(relayUrls);

    const firstContentLatencies: number[] = [];
    const completionLatencies: number[] = [];
    let evidenceEntries: readonly RelayTranscriptEntry[] = [];
    for (let run = 0; run < auditSampleCount(); run += 1) {
      const workflow = session.beginWorkflow(`profiles-251-${run + 1}`);
      const selected = new Map<string, Event>();
      let firstContentAt: number | null = null;
      let completed = false;
      const handle = await subProfilesOnce(
        [...pubkeys, pubkeys[0]],
        (event) => {
          firstContentAt ??= Date.now();
          const existing = selected.get(event.pubkey);
          if (!existing || existing.created_at < event.created_at) {
            selected.set(event.pubkey, event);
          }
        },
        () => {
          completed = true;
        },
        { relayUrls },
      );
      await session.waitFor(() => completed, 5_000);
      await session.waitFor((entries) =>
        entries.filter((entry) => entry.type === "close").length === (run + 1) * 4,
      5_000);
      handle.close();
      workflow.complete();

      expect(selected.size).toBe(251);
      expect([...selected.values()].every((event) =>
        event.created_at === 2_000_000_020 &&
        (JSON.parse(event.content) as { name: string }).name.startsWith("newer-")
      )).toBe(true);
      const summary = session.summary(workflow);
      expect(summary).toMatchObject({
        requests: 4,
        closes: 4,
        eose: 4,
        returnedEvents: 502,
        relayFanout: 2,
      });
      const entries = workflowEntries(session, workflow.startIndex, workflow.completedIndex);
      const authorCounts = entries
        .filter((entry) => entry.type === "request")
        .map((entry) => entry.filters[0]?.authors?.length)
        .sort((left, right) => (left ?? 0) - (right ?? 0));
      expect(authorCounts).toEqual([1, 1, 250, 250]);
      firstContentLatencies.push((firstContentAt ?? workflow.startedAt) - workflow.startedAt);
      completionLatencies.push(summary.completionLatencyMs);
      evidenceEntries = entries;
    }

    const firstContentLatencyMs = summarizeSamples(firstContentLatencies);
    const completionLatencyMs = summarizeSamples(completionLatencies);
    if (process.env.RELAY_AUDIT_OUTPUT === "1") {
      expect(firstContentLatencyMs.p95).toBeLessThanOrEqual(34);
      expect(completionLatencyMs.p95).toBeLessThanOrEqual(2_500);
    }
    emitAuditMeasurement({
      scenario: "wired-browser-complete-profile-batches-local-fixture",
      samples: completionLatencies.length,
      firstContentLatencyMs,
      completionLatencyMs,
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
  }, 60_000);
});
