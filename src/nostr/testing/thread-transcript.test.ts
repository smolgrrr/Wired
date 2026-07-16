import { afterEach, describe, expect, it } from "vitest";
import {
  finalizeEvent,
  useWebSocketImplementation as configureWebSocketImplementation,
} from "nostr-tools";
import { WebSocket } from "ws";
import { ensureRelaysConnected } from "../client";
import { subNotesOnce } from "../subscriptions";
import { subNote } from "../subscriptions/thread";
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
      harnesses.push(...runHarnesses);
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
});
