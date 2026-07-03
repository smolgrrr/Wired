import { describe, expect, it } from "vitest";
import { Event } from "nostr-tools";
import {
  eventsFromProcessed,
  eventsFromSnapshot,
  feedBootstrapUrls,
  fetchFeedBootstrapSnapshot,
  relayHintsFromSnapshot,
  resetFeedBootstrapSnapshotCache,
  threadEventsFromSnapshot,
  VERCEL_FEED_BOOTSTRAP_URL,
} from "./feedBootstrapClient";
import type { FeedBootstrapResponse } from "./feedBootstrapClient";

const event = (overrides: Partial<Event> = {}): Event => ({
  id: "f".repeat(64),
  pubkey: "a".repeat(64),
  created_at: 1,
  kind: 1,
  tags: [],
  content: "hello",
  sig: "b".repeat(128),
  ...overrides,
});

describe("eventsFromProcessed", () => {
  it("deduplicates post and reply events", () => {
    const root = event({ id: "1".repeat(64) });
    const reply = event({ id: "2".repeat(64), pubkey: "c".repeat(64) });

    const events = eventsFromProcessed([
      { postEvent: root, replies: [reply, reply], totalWork: 0 },
    ]);

    expect(events).toHaveLength(2);
    expect(events.map((item) => item.id)).toEqual([root.id, reply.id]);
  });
});

describe("eventsFromSnapshot", () => {
  it("deduplicates raw and processed events", () => {
    const root = event({ id: "1".repeat(64) });
    const reply = event({ id: "2".repeat(64), pubkey: "c".repeat(64) });

    expect(
      eventsFromSnapshot({
        fetchedAt: 1,
        events: [root],
        relayHintsByEventId: {},
        processedEvents: [{ postEvent: root, replies: [reply], totalWork: 0 }],
        profiles: {},
      }).map((item) => item.id),
    ).toEqual([root.id, reply.id]);
  });
});

describe("relayHintsFromSnapshot", () => {
  it("returns relay hints for processed root events", () => {
    const root = event({ id: "1".repeat(64) });
    const reply = event({ id: "2".repeat(64), pubkey: "c".repeat(64) });

    expect(
      relayHintsFromSnapshot({
        fetchedAt: 1,
        events: [root, reply],
        relayHintsByEventId: {
          [reply.id]: ["wss://reply.example"],
        },
        processedEvents: [
          {
            postEvent: root,
            replies: [reply],
            relayHints: ["wss://relay.example"],
            totalWork: 0,
          },
        ],
        profiles: {},
      }),
    ).toEqual(
      new Map([
        [reply.id, ["wss://reply.example"]],
        [root.id, ["wss://relay.example"]],
      ]),
    );
  });
});

describe("threadEventsFromSnapshot", () => {
  it("returns an op with nested replies from the snapshot", () => {
    const root = event({ id: "1".repeat(64) });
    const directReply = event({
      id: "2".repeat(64),
      pubkey: "c".repeat(64),
      tags: [["e", root.id]],
    });
    const nestedReply = event({
      id: "3".repeat(64),
      pubkey: "d".repeat(64),
      tags: [["e", directReply.id]],
    });

    expect(
      threadEventsFromSnapshot(
        {
          fetchedAt: 1,
          events: [root, directReply, nestedReply],
          relayHintsByEventId: {},
          processedEvents: [],
          profiles: {},
        },
        root.id,
      ).map((item) => item.id),
    ).toEqual([root.id, directReply.id, nestedReply.id]);
  });
});

describe("feedBootstrapUrls", () => {
  it("tries the external snapshot before the Vercel bootstrap endpoint", () => {
    expect(feedBootstrapUrls("https://snapshot.example/feed.json")).toEqual([
      "https://snapshot.example/feed.json",
      VERCEL_FEED_BOOTSTRAP_URL,
    ]);
  });

  it("uses only the Vercel bootstrap endpoint when no external snapshot is set", () => {
    expect(feedBootstrapUrls(null)).toEqual([VERCEL_FEED_BOOTSTRAP_URL]);
  });
});

describe("fetchFeedBootstrapSnapshot", () => {
  const snapshot = (): FeedBootstrapResponse => ({
    fetchedAt: 1,
    processedEvents: [],
    events: [],
    relayHintsByEventId: {},
    profiles: {},
  });

  const jsonResponse = (body: unknown, init?: ResponseInit) =>
    new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
      ...init,
    });

  it("returns the Cloudflare snapshot when it succeeds", async () => {
    resetFeedBootstrapSnapshotCache();
    const calls: string[] = [];
    const fetcher = async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return jsonResponse(snapshot());
    };

    const result = await fetchFeedBootstrapSnapshot(
      fetcher,
      "https://snapshot.example/feed.json",
    );

    expect(result).toEqual(snapshot());
    expect(calls).toEqual(["https://snapshot.example/feed.json"]);
  });

  it("falls back to Vercel bootstrap when the Cloudflare snapshot fails", async () => {
    resetFeedBootstrapSnapshotCache();
    const calls: string[] = [];
    const fetcher = async (input: RequestInfo | URL) => {
      calls.push(String(input));
      if (String(input).startsWith("https://snapshot.example")) {
        return new Response("not found", { status: 404 });
      }
      return jsonResponse(snapshot());
    };

    const result = await fetchFeedBootstrapSnapshot(
      fetcher,
      "https://snapshot.example/feed.json",
    );

    expect(result).toEqual(snapshot());
    expect(calls).toEqual([
      "https://snapshot.example/feed.json",
      VERCEL_FEED_BOOTSTRAP_URL,
    ]);
  });

  it("falls back to Vercel bootstrap when the Cloudflare payload is invalid", async () => {
    resetFeedBootstrapSnapshotCache();
    const calls: string[] = [];
    const fetcher = async (input: RequestInfo | URL) => {
      calls.push(String(input));
      if (String(input).startsWith("https://snapshot.example")) {
        return jsonResponse({ ok: true });
      }
      return jsonResponse(snapshot());
    };

    const result = await fetchFeedBootstrapSnapshot(
      fetcher,
      "https://snapshot.example/feed.json",
    );

    expect(result).toEqual(snapshot());
    expect(calls).toEqual([
      "https://snapshot.example/feed.json",
      VERCEL_FEED_BOOTSTRAP_URL,
    ]);
  });

  it("returns null when all bootstrap sources fail so live relays can take over", async () => {
    resetFeedBootstrapSnapshotCache();
    const fetcher = async () => new Response("unavailable", { status: 503 });

    await expect(
      fetchFeedBootstrapSnapshot(fetcher, "https://snapshot.example/feed.json"),
    ).resolves.toBeNull();
  });
});
