import { afterEach, describe, expect, it } from "vitest";
import {
  finalizeEvent,
  useWebSocketImplementation as configureWebSocketImplementation,
} from "nostr-tools";
import { WebSocket } from "ws";
import {
  fetchThreadEventsFromRelays,
  resolveThreadPreview,
} from "../../../lib/threadPreview";
import {
  RelayTranscriptHarness,
  RelayTranscriptSession,
  type RelayRequestController,
} from "./relay-transcript";

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
  request.sendEvent(root, delayMs);
  request.sendEvent(reply, delayMs);
  request.sendEvent(nestedReply, delayMs);
  request.sendEose(delayMs);
}

describe("thread preview relay transcript", () => {
  const harnesses: RelayTranscriptHarness[] = [];

  afterEach(async () => {
    await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
  });

  it("deduplicates complete preview results across hinted relays", async () => {
    const session = new RelayTranscriptSession();
    harnesses.push(
      await RelayTranscriptHarness.listen({
        session,
        onRequest: returnCompleteThread,
      }),
      await RelayTranscriptHarness.listen({
        session,
        onRequest: returnCompleteThread,
      }),
    );
    const relayUrls = harnesses.map((harness) => harness.url);
    const completionLatencies: number[] = [];

    for (let run = 0; run < 20; run += 1) {
      const workflow = session.beginWorkflow(`thread-preview-${run + 1}`);
      const preview = await resolveThreadPreview(root.id, {
        origin: "https://wiredsignal.online",
        fetchImpl: async () => new Response(null, { status: 404 }),
        relayFallback: (eventId, relayHints) =>
          fetchThreadEventsFromRelays(eventId, relayHints, { relayUrls }),
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
      completionLatencies.push(summary.completionLatencyMs);
    }

    if (process.env.RELAY_AUDIT_OUTPUT === "1") {
      const sorted = [...completionLatencies].sort((a, b) => a - b);
      const percentile = (value: number) =>
        sorted[Math.ceil((value / 100) * sorted.length) - 1] ?? 0;
      console.info(JSON.stringify({
        scenario: "thread-preview-local-fixture",
        samples: sorted.length,
        completionLatencyMs: {
          p50: percentile(50),
          p95: percentile(95),
          samples: completionLatencies,
        },
      }));
    }
  });

  it("completes from one delayed relay when another relay disconnects", async () => {
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
          relayUrls: harnesses.map((harness) => harness.url),
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
    if (process.env.RELAY_AUDIT_OUTPUT === "1") {
      console.info(JSON.stringify({
        scenario: "thread-preview-degraded-relay-local-fixture",
        samples: 1,
        completionLatencyMs: summary.completionLatencyMs,
      }));
    }
  });
});
