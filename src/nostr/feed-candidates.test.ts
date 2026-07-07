import { describe, expect, it, vi } from "vitest";
import type { Event } from "nostr-tools";
import {
  buildFeedEventMap,
  feedRootRefsFromQualifyingActivity,
  isFeedPostEvent,
  resolveFeedRootRef,
} from "./feed-candidates";

vi.mock("../shared/pow/core", () => ({
  verifyPow: (event: Event) =>
    Number(event.tags.find((tag) => tag[0] === "nonce")?.[2] ?? 0),
}));

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

describe("resolveFeedRootRef", () => {
  it("uses the NIP-10 root marker before fallback e tags", () => {
    const rootId = "1".repeat(64);
    const parentId = "2".repeat(64);
    const reply = event({
      id: "3".repeat(64),
      tags: [
        ["e", parentId, "wss://parent.example"],
        ["e", rootId, "wss://root.example/", "root"],
      ],
    });

    expect(resolveFeedRootRef(reply)).toEqual({
      id: rootId,
      relays: ["wss://root.example"],
    });
  });

  it("falls back to the first valid e tag", () => {
    const rootId = "1".repeat(64);
    const reply = event({
      id: "2".repeat(64),
      tags: [
        ["e", "not-an-event-id", "wss://invalid.example"],
        ["e", rootId, "wss://root.example"],
      ],
    });

    expect(resolveFeedRootRef(reply)).toEqual({
      id: rootId,
      relays: ["wss://root.example"],
    });
  });

  it("resolves parent-only replies through a bounded known parent chain", () => {
    const root = event({ id: "1".repeat(64) });
    const parent = event({
      id: "2".repeat(64),
      tags: [["e", root.id, "wss://root.example", "root"]],
    });
    const nested = event({
      id: "3".repeat(64),
      tags: [["e", parent.id, "wss://parent.example"]],
    });

    expect(resolveFeedRootRef(nested, buildFeedEventMap([root, parent, nested]))).toEqual({
      id: root.id,
      relays: ["wss://parent.example", "wss://root.example"],
    });
  });
});

describe("feedRootRefsFromQualifyingActivity", () => {
  it("accepts a reply activity only when its work qualifies", () => {
    const rootId = "1".repeat(64);
    const lowerWorkReply = event({
      id: "2".repeat(64),
      tags: [["e", rootId, "", "root"], ["nonce", "lower", "15"]],
    });
    const qualifyingReply = event({
      id: "3".repeat(64),
      tags: [["e", rootId, "", "root"], ["nonce", "higher", "16"]],
    });
    expect(feedRootRefsFromQualifyingActivity([lowerWorkReply], 16)).toEqual([]);
    expect(feedRootRefsFromQualifyingActivity([qualifyingReply], 16)).toEqual([
      { id: rootId, relays: [] },
    ]);
  });

  it("does not treat kind-1068 articles as main-feed posts", () => {
    expect(isFeedPostEvent(event({ kind: 1068 }))).toBe(false);
    expect(feedRootRefsFromQualifyingActivity([
      event({ kind: 1068, tags: [["nonce", "article", "24"]] }),
    ], 16)).toEqual([]);
  });
});
