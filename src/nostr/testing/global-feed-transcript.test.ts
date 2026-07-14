import { afterEach, describe, expect, it } from "vitest";
import {
  finalizeEvent,
  useWebSocketImplementation as configureWebSocketImplementation,
} from "nostr-tools";
import { WebSocket } from "ws";
import { ensureRelaysConnected } from "../client";
import { subGlobalFeed } from "../subscriptions/global-feed";
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
      const filterCounts = new Map<string, number>();
      requests.forEach((request) => {
        const filters = request.filters.map(({ since: _since, ...filter }) => filter);
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
});
