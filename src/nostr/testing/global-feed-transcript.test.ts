import { afterEach, describe, expect, it } from "vitest";
import {
  finalizeEvent,
  useWebSocketImplementation as configureWebSocketImplementation,
} from "nostr-tools";
import { WebSocket } from "ws";
import { ensureRelaysConnected } from "../client";
import { subGlobalFeed } from "../subscriptions/global-feed";
import {
  RelayTranscriptHarness,
  type RelayRequestController,
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
  created_at: rootEvent.created_at,
  kind: 1,
  tags: [["e", rootEvent.id, "", "reply"]],
  content: "reply",
}, secretKey);

describe("global feed relay transcript", () => {
  let harness: RelayTranscriptHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("captures complete workflow output and finite relay work", async () => {
    harness = await RelayTranscriptHarness.listen({
      onRequest(request: RelayRequestController) {
        const [filter] = request.filters;
        if (filter?.["#e"]?.includes(rootEvent.id)) {
          request.sendEvent(replyEvent);
        } else {
          request.sendEvent(rootEvent);
        }
        request.sendEose();
      },
    });

    const workflow = harness.beginWorkflow("global-feed");
    await ensureRelaysConnected([harness.url]);
    const receivedIds: string[] = [];
    const handle = subGlobalFeed(
      (event) => receivedIds.push(event.id),
      24,
      {
        rootRelayUrls: [harness.url],
        replyRelayUrls: [harness.url],
        replyDepth: 1,
      },
    );

    await harness.waitFor(
      (entries) => entries.filter((entry) => entry.type === "close").length === 2,
    );
    handle.close();
    workflow.complete();

    expect(receivedIds).toEqual([rootEvent.id, replyEvent.id]);
    expect(harness.summary(workflow)).toMatchObject({
      openedConnections: 1,
      connectionReuseCount: 1,
      requests: 2,
      closes: 2,
      returnedEvents: 2,
      eose: 2,
      publishes: 0,
      acknowledgements: 0,
      rejections: 0,
      retries: 0,
      repeatedOperations: 0,
      relayFanout: 1,
    });
    const summary = harness.summary(workflow);
    expect(summary.returnedEventBytes).toBeGreaterThan(0);
    expect(summary.subscriptionLifetimesMs).toHaveLength(2);
    expect(summary.completionLatencyMs).toBeGreaterThanOrEqual(0);

    const entries = harness.entries.slice(
      workflow.startIndex,
      workflow.completedIndex,
    );
    const requests = entries.filter((entry) => entry.type === "request");
    expect(requests).toHaveLength(2);
    expect(requests[0]?.filters).toEqual([
      { kinds: [1], since: expect.any(Number), limit: 500 },
    ]);
    expect(requests[1]?.filters).toEqual([
      {
        "#e": [rootEvent.id],
        kinds: [1],
        since: expect.any(Number),
        limit: 100,
      },
    ]);
    expect(requests[1]?.filters[0]?.since).toBe(
      requests[0]?.filters[0]?.since,
    );
    expect(requests.every((request) => request.bytes > 0)).toBe(true);

    const returnedEvents = entries.filter(
      (entry) => entry.type === "event-returned",
    );
    expect(returnedEvents.map((entry) => entry.eventId)).toEqual([
      rootEvent.id,
      replyEvent.id,
    ]);
    expect(returnedEvents.every((entry) => entry.bytes > 0)).toBe(true);

    const requestIds = requests.map((request) => request.subscriptionId).sort();
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
  });
});
