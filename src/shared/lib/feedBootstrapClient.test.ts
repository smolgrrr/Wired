import { afterEach, describe, expect, it, vi } from "vitest";
import { Event } from "nostr-tools";
import {
  eventsFromSnapshot,
  feedBootstrapUrls,
  fetchFeedBootstrapSnapshot,
  loadFeedBootstrapSnapshot,
  processedEventsFromSnapshot,
  relayHintsFromSnapshot,
  resetFeedBootstrapSnapshotCache,
  threadEventsFromSnapshot,
  VERCEL_FEED_BOOTSTRAP_URL,
} from "./feedBootstrapClient";
import type { FeedBootstrapResponse } from "./feedBootstrapClient";

afterEach(() => {
  vi.useRealTimers();
});

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

const snapshot = (
  overrides: Partial<FeedBootstrapResponse> = {},
): FeedBootstrapResponse => ({
  fetchedAt: 1,
  processedEvents: [],
  eventsById: {},
  relayHintsByEventId: {},
  profiles: {},
  scoring: {
    ageHours: 24,
    minPow: 16,
    replyDepth: 2,
    sort: "totalWork",
  },
  ...overrides,
});

describe("eventsFromSnapshot", () => {
  it("returns normalized events", () => {
    const root = event({ id: "1".repeat(64) });
    const reply = event({ id: "2".repeat(64), pubkey: "c".repeat(64) });

    expect(
      eventsFromSnapshot(snapshot({
        eventsById: {
          [root.id]: root,
          [reply.id]: reply,
        },
      })).map((item) => item.id),
    ).toEqual([root.id, reply.id]);
  });
});

describe("processedEventsFromSnapshot", () => {
  it("hydrates processed rows from event ids", () => {
    const root = event({ id: "1".repeat(64) });
    const reply = event({
      id: "2".repeat(64),
      pubkey: "c".repeat(64),
      tags: [["e", root.id]],
    });

    expect(
      processedEventsFromSnapshot(snapshot({
        eventsById: {
          [root.id]: root,
          [reply.id]: reply,
        },
        processedEvents: [
          {
            postEventId: root.id,
            replyIds: [reply.id],
            relayHints: ["wss://relay.example"],
            threadReplyCount: 1,
            rootWork: 1,
            replyWork: 2,
            totalWork: 3,
            rankingReplyCount: 1,
          },
        ],
      })),
    ).toEqual([
      {
        postEvent: root,
        replies: [reply],
        relayHints: ["wss://relay.example"],
        threadReplyCount: 1,
        rootWork: 1,
        replyWork: 2,
        totalWork: 3,
        rankingReplyCount: 1,
      },
    ]);
  });
});

describe("relayHintsFromSnapshot", () => {
  it("returns relay hints for processed root events", () => {
    const root = event({ id: "1".repeat(64) });
    const reply = event({ id: "2".repeat(64), pubkey: "c".repeat(64) });

    expect(
      relayHintsFromSnapshot(snapshot({
        eventsById: {
          [root.id]: root,
          [reply.id]: reply,
        },
        relayHintsByEventId: {
          [reply.id]: ["wss://reply.example"],
        },
        processedEvents: [
          {
            postEventId: root.id,
            replyIds: [reply.id],
            relayHints: ["wss://relay.example"],
            threadReplyCount: 1,
            rootWork: 1,
            replyWork: 0,
            totalWork: 0,
            rankingReplyCount: 0,
          },
        ],
      })),
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
        snapshot({
          eventsById: {
            [root.id]: root,
            [directReply.id]: directReply,
            [nestedReply.id]: nestedReply,
          },
        }),
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

  it("keeps the Vercel fallback cheap when the external snapshot misses", async () => {
    vi.useFakeTimers();
    resetFeedBootstrapSnapshotCache();
    const calls: string[] = [];
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(String(input));
      if (String(input).startsWith("https://snapshot.example")) {
        return Promise.resolve(new Response("not found", { status: 404 }));
      }

      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true },
        );
      });
    });

    const result = fetchFeedBootstrapSnapshot(
      fetcher,
      "https://snapshot.example/feed.json",
      { timeoutMs: 1_000, fallbackTimeoutMs: 25 },
    );

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(25);

    await expect(result).resolves.toBeNull();
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

describe("loadFeedBootstrapSnapshot", () => {
  it("coalesces a cache miss and serves the subsequent cache hit without I/O", async () => {
    resetFeedBootstrapSnapshotCache();
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));

    const first = loadFeedBootstrapSnapshot(fetcher, null);
    const coalesced = loadFeedBootstrapSnapshot(fetcher, null);
    expect(coalesced).toBe(first);
    expect(fetcher).toHaveBeenCalledOnce();

    resolveFetch?.(new Response(JSON.stringify(snapshot()), {
      headers: { "content-type": "application/json" },
    }));
    await expect(first).resolves.toEqual(snapshot());
    await expect(loadFeedBootstrapSnapshot(fetcher, null)).resolves.toEqual(snapshot());
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
