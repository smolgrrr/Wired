import { describe, expect, it } from "vitest";
import { Event } from "nostr-tools";
import {
  eventsFromProcessed,
  feedBootstrapUrls,
  fetchFeedBootstrapSnapshot,
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
    profiles: {},
  });

  const jsonResponse = (body: unknown, init?: ResponseInit) =>
    new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
      ...init,
    });

  it("returns the Cloudflare snapshot when it succeeds", async () => {
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
    const fetcher = async () => new Response("unavailable", { status: 503 });

    await expect(
      fetchFeedBootstrapSnapshot(fetcher, "https://snapshot.example/feed.json"),
    ).resolves.toBeNull();
  });
});
