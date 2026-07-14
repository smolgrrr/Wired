import { afterEach, describe, expect, it } from "vitest";
import {
  finalizeEvent,
  useWebSocketImplementation as configureWebSocketImplementation,
} from "nostr-tools";
import { WebSocket } from "ws";
import { ensureRelaysConnected } from "../client";
import { subNote } from "../subscriptions/thread";
import {
  RelayTranscriptHarness,
  RelayTranscriptSession,
  type RelayRequestController,
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

describe("thread relay transcript", () => {
  const harnesses: RelayTranscriptHarness[] = [];

  afterEach(async () => {
    await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
  });

  it("captures hinted-relay duplicates, recursive replacement, and navigation cleanup", async () => {
    const session = new RelayTranscriptSession();
    harnesses.push(
      await RelayTranscriptHarness.listen({ session, onRequest: driveThreadRequest }),
      await RelayTranscriptHarness.listen({ session, onRequest: driveThreadRequest }),
    );
    const relayUrls = harnesses.map((harness) => harness.url);
    await ensureRelaysConnected(relayUrls);

    const completionLatencies: number[] = [];
    for (let run = 0; run < 20; run += 1) {
      const workflow = session.beginWorkflow(`thread-navigation-${run + 1}`);
      const receivedIds = new Set<string>();
      const handle = subNote(
        root.id,
        (event) => receivedIds.add(event.id),
        relayUrls,
      );

      await session.waitFor(() => receivedIds.has(nestedReply.id));
      handle.close();
      await session.waitFor(
        (entries) => entries.filter((entry) => entry.type === "close").length ===
          (run + 1) * 8,
      );
      workflow.complete();

      expect([...receivedIds].sort()).toEqual(
        [root.id, reply.id, nestedReply.id].sort(),
      );
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
      expect(summary.connectionReuseCount).toBe(6);
      expect(summary.subscriptionLifetimesMs).toHaveLength(8);
      completionLatencies.push(summary.completionLatencyMs);
    }

    const replyRequests = session.entries
      .filter((entry) => entry.type === "request")
      .filter((entry) => entry.filters[0]?.["#e"]);
    expect(
      [...new Set(replyRequests.map((entry) => entry.filters[0]?.["#e"]?.length))],
    ).toEqual([1, 2, 3]);
    if (process.env.RELAY_AUDIT_OUTPUT === "1") {
      const sorted = [...completionLatencies].sort((a, b) => a - b);
      const percentile = (value: number) =>
        sorted[Math.ceil((value / 100) * sorted.length) - 1] ?? 0;
      console.info(JSON.stringify({
        scenario: "thread-navigation-local-fixture",
        samples: sorted.length,
        completionLatencyMs: {
          p50: percentile(50),
          p95: percentile(95),
          samples: completionLatencies,
        },
      }));
    }
  });
});
