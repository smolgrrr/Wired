import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Event } from "nostr-tools";
import type { SubCallback } from "../types";

const subscribeMock = vi.fn();

vi.mock("../client", () => ({
  getRegistry: () => ({
    subscribe: subscribeMock,
  }),
}));

import { subGlobalFeed } from "./global-feed";

const rootNote = (id: string): Event => ({
  id,
  pubkey: "a".repeat(64),
  created_at: 1,
  kind: 1,
  tags: [],
  content: "hello",
  sig: "b".repeat(128),
});

const rootNoteFromPubkey = (id: string, pubkey: string): Event => ({
  ...rootNote(id),
  pubkey,
});

describe("subGlobalFeed", () => {
  beforeEach(() => {
    subscribeMock.mockReset();
  });

  it("subscribes to replies when the root feed reaches EOSE", () => {
    subscribeMock.mockImplementation((requests) => {
      const id = String(subscribeMock.mock.calls.length);

      if (id === "1") {
        const { cb, onEose } = requests[0];
        cb(rootNote("1".repeat(64)), "wss://powrelay.xyz");
        onEose?.();
        return { id, close: vi.fn() };
      }

      return { id, close: vi.fn() };
    });

    const onEvent = vi.fn() as SubCallback;
    subGlobalFeed(onEvent, 24);

    expect(subscribeMock).toHaveBeenCalledTimes(2);

    const replyRequest = subscribeMock.mock.calls[1][0][0];
    expect(replyRequest.filter).toMatchObject({
      "#e": ["1".repeat(64)],
      kinds: [1],
    });
    expect(replyRequest.closeOnEose).toBe(true);
  });

  it("does not subscribe to replies when no root notes were seen", () => {
    subscribeMock.mockImplementation((requests) => {
      const id = String(subscribeMock.mock.calls.length);
      requests[0].onEose?.();
      return { id, close: vi.fn() };
    });

    subGlobalFeed(vi.fn(), 24);

    expect(subscribeMock).toHaveBeenCalledTimes(1);
  });

  it("can fetch PoW roots first and then enrich accepted roots from separate reply relays", () => {
    const rootId = `${"1".repeat(64)}`;
    const replyId = `${"2".repeat(64)}`;
    const powRelays = ["wss://powrelay.xyz"];
    const enrichmentRelays = ["wss://relay.damus.io"];

    subscribeMock.mockImplementation((requests) => {
      const id = String(subscribeMock.mock.calls.length);

      if (id === "1") {
        const { cb, onEose } = requests[0];
        cb(rootNoteFromPubkey(rootId, "a".repeat(64)), powRelays[0]);
        onEose?.();
        return { id, close: vi.fn() };
      }

      if (id === "2") {
        const { cb, onEose } = requests[0];
        cb(rootNote(replyId), enrichmentRelays[0]);
        onEose?.();
        return { id, close: vi.fn() };
      }

      return { id, close: vi.fn() };
    });

    const onEvent = vi.fn() as SubCallback;
    subGlobalFeed(onEvent, 24, {
      rootRelayUrls: powRelays,
      replyRelayUrls: enrichmentRelays,
      rootFilterDifficulty: 0,
      replyDepth: 2,
    });

    expect(subscribeMock).toHaveBeenCalledTimes(3);

    const rootRequest = subscribeMock.mock.calls[0][0][0];
    expect(rootRequest.relayUrls).toEqual(powRelays);

    const replyRequest = subscribeMock.mock.calls[1][0][0];
    expect(replyRequest.filter).toMatchObject({
      "#e": [rootId],
      kinds: [1],
    });
    expect(replyRequest.relayUrls).toEqual(enrichmentRelays);

    const nestedReplyRequest = subscribeMock.mock.calls[2][0][0];
    expect(nestedReplyRequest.filter).toMatchObject({
      "#e": [replyId],
      kinds: [1],
    });
    expect(nestedReplyRequest.relayUrls).toEqual(enrichmentRelays);
  });
});
