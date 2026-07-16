import { describe, expect, it, vi } from "vitest";
import type { Event } from "nostr-tools";
import type { FeedBootstrapSnapshot } from "../src/shared/lib/feedBootstrapTypes";
import { previewFromSnapshot, resolveThreadPreview } from "./threadPreview";

const rootId = "1".repeat(64);

function event(overrides: Partial<Event> = {}): Event {
  return {
    id: rootId,
    pubkey: "2".repeat(64),
    created_at: 1,
    kind: 1,
    tags: [],
    content: "A useful anonymous signal https://example.com/image.jpg",
    sig: "3".repeat(128),
    ...overrides,
  };
}

function snapshot(): FeedBootstrapSnapshot {
  return {
    fetchedAt: 1,
    processedEvents: [
      {
        postEventId: rootId,
        replyIds: ["4".repeat(64)],
        threadReplyCount: 7,
        rootWork: 1,
        replyWork: 1,
        totalWork: 2,
        rankingReplyCount: 1,
      },
    ],
    eventsById: { [rootId]: event() },
    relayHintsByEventId: {},
    profiles: {},
    scoring: { ageHours: 24, minPow: 16, replyDepth: 2, sort: "totalWork" },
  };
}

describe("thread preview", () => {
  it("builds a clean excerpt and uses the snapshot thread reply count", () => {
    expect(previewFromSnapshot(snapshot(), rootId)).toEqual({
      eventId: rootId,
      excerpt: "A useful anonymous signal",
      replyCount: 7,
    });
  });

  it("falls back to relay events when snapshots do not contain the thread", async () => {
    const reply = event({ id: "5".repeat(64), tags: [["e", rootId]] });
    const relayFallback = vi.fn().mockResolvedValue([event(), reply]);
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ unavailable: true }), { status: 200 }),
    );
    const onResolution = vi.fn();

    const preview = await resolveThreadPreview(rootId, {
      origin: "https://wiredsignal.online",
      fetchImpl,
      relayFallback,
      onResolution,
    });

    expect(preview?.replyCount).toBe(1);
    expect(relayFallback).toHaveBeenCalledWith(rootId, []);
    expect(onResolution).toHaveBeenCalledWith({
      eventId: rootId,
      outcome: "relay-fallback",
    });
  });

  it("rejects invalid thread references without network work", async () => {
    const fetchImpl = vi.fn();
    const relayFallback = vi.fn();
    expect(
      await resolveThreadPreview("invalid", {
        origin: "https://wiredsignal.online",
        fetchImpl,
        relayFallback,
      }),
    ).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(relayFallback).not.toHaveBeenCalled();
  });
});
