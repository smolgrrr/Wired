import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Event } from "nostr-tools";
import type { FiniteQuery, QueryCompletion } from "../browser-relay-access";
import type { SubCallback } from "../types";
import {
  MAX_REPLY_FETCH_DEPTH,
  MAX_REPLY_PARENT_IDS,
  REPLY_QUERY_LIMIT,
} from "./query-limits";

const { subscribeMock, startFiniteQueryMock } = vi.hoisted(() => ({
  subscribeMock: vi.fn(),
  startFiniteQueryMock: vi.fn(),
}));

vi.mock("../client", () => ({
  getRegistry: () => ({
    subscribe: subscribeMock,
  }),
  startFiniteQuery: startFiniteQueryMock,
}));

import {
  FEED_REPLY_PARENT_CHUNK_SIZE,
  FEED_ROOT_FETCH_CHUNK_SIZE,
  subGlobalFeed,
  subRepliesForRootIds,
} from "./global-feed";

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
    startFiniteQueryMock.mockReset();
    startFiniteQueryMock.mockImplementation((query: FiniteQuery) => {
      const relayUrls = [...new Set([
        ...query.coverage.configuredRelayUrls,
        ...(query.coverage.hintedRelayUrls ?? []),
      ])];
      const completion: QueryCompletion = {
        reason: "settled",
        targets: relayUrls.map((relayUrl) => ({ relayUrl, state: "eose" })),
        receivedEvents: 0,
      };
      const legacy = subscribeMock([{
        filter: query.filters[0],
        relayUrls,
        cb: query.onEvent,
        closeOnEose: true,
        onEose: () => query.onComplete?.(completion),
      }]);
      return {
        done: Promise.resolve(completion),
        close: legacy.close,
      };
    });
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
      limit: REPLY_QUERY_LIMIT,
      since: expect.any(Number),
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
      limit: REPLY_QUERY_LIMIT,
      since: expect.any(Number),
    });
    expect(replyRequest.relayUrls).toEqual(enrichmentRelays);

    const nestedReplyRequest = subscribeMock.mock.calls[2][0][0];
    expect(nestedReplyRequest.filter).toMatchObject({
      "#e": [replyId],
      kinds: [1],
      limit: REPLY_QUERY_LIMIT,
      since: expect.any(Number),
    });
    expect(nestedReplyRequest.relayUrls).toEqual(enrichmentRelays);
  });

  it("fetches missing roots by id from thread relays plus tag relay hints", () => {
    const rootId = `${"1".repeat(64)}`;
    const replyId = `${"2".repeat(64)}`;
    const powRelays = ["wss://powrelay.xyz"];
    const threadRelays = ["wss://relay.damus.io"];
    const reply = {
      ...rootNote(replyId),
      tags: [["e", rootId, "wss://hint.example/", "root"], ["nonce", "reply", "16"]],
    };

    subscribeMock.mockImplementation((requests) => {
      const id = String(subscribeMock.mock.calls.length);

      if (id === "1") {
        const { cb, onEose } = requests[0];
        cb(reply, powRelays[0]);
        onEose?.();
      }

      if (id === "2") {
        const { cb, onEose } = requests[0];
        cb(rootNote(rootId), "wss://hint.example");
        onEose?.();
      }

      return { id, close: vi.fn() };
    });

    subGlobalFeed(vi.fn(), 24, {
      rootRelayUrls: powRelays,
      replyRelayUrls: threadRelays,
      rootFilterDifficulty: 0,
    });

    expect(subscribeMock).toHaveBeenCalledTimes(3);

    const rootFetchRequest = subscribeMock.mock.calls[1][0][0];
    expect(rootFetchRequest.filter).toEqual({
      ids: [rootId],
      kinds: [1],
      limit: 1,
    });
    expect(rootFetchRequest.filter).not.toHaveProperty("since");
    expect(rootFetchRequest.relayUrls).toEqual([
      ...threadRelays,
      "wss://hint.example",
    ]);

    const replyRequest = subscribeMock.mock.calls[2][0][0];
    expect(replyRequest.filter).toMatchObject({
      "#e": [rootId],
      kinds: [1],
    });
    expect(replyRequest.relayUrls).toEqual(threadRelays);
  });

  it("resolves parent-only reply activity before enriching the root thread", () => {
    const rootId = `${"1".repeat(64)}`;
    const parentId = `${"2".repeat(64)}`;
    const nestedReplyId = `${"3".repeat(64)}`;
    const threadRelays = ["wss://relay.damus.io"];
    const nestedReply = {
      ...rootNote(nestedReplyId),
      tags: [["e", parentId, "wss://parent.example"], ["nonce", "nested", "16"]],
    };
    const parentReply = {
      ...rootNote(parentId),
      tags: [["e", rootId, "wss://root.example", "root"]],
    };

    subscribeMock.mockImplementation((requests) => {
      const id = String(subscribeMock.mock.calls.length);

      if (id === "1") {
        const { cb, onEose } = requests[0];
        cb(nestedReply, "wss://powrelay.xyz");
        onEose?.();
      }

      if (id === "2") {
        const { cb, onEose } = requests[0];
        cb(parentReply, "wss://parent.example");
        onEose?.();
      }

      if (id === "3") {
        const { cb, onEose } = requests[0];
        cb(rootNote(rootId), "wss://root.example");
        onEose?.();
      }

      return { id, close: vi.fn() };
    });

    subGlobalFeed(vi.fn(), 24, {
      replyRelayUrls: threadRelays,
      rootFilterDifficulty: 0,
    });

    expect(subscribeMock).toHaveBeenCalledTimes(4);
    expect(subscribeMock.mock.calls[1][0][0].filter).toEqual({
      ids: [parentId],
      kinds: [1],
      limit: 1,
    });
    expect(subscribeMock.mock.calls[1][0][0].relayUrls).toEqual([
      ...threadRelays,
      "wss://parent.example",
    ]);
    expect(subscribeMock.mock.calls[2][0][0].filter).toEqual({
      ids: [rootId],
      kinds: [1],
      limit: 1,
    });
    expect(subscribeMock.mock.calls[2][0][0].relayUrls).toEqual([
      ...threadRelays,
      "wss://root.example",
    ]);
    expect(subscribeMock.mock.calls[3][0][0].filter).toMatchObject({
      "#e": [rootId],
      kinds: [1],
    });
  });

  it("does not treat articles as main-feed roots", () => {
    const articleId = `${"1".repeat(64)}`;
    const sameAuthorRootId = `${"2".repeat(64)}`;
    const acceptedRootId = `${"3".repeat(64)}`;

    const article = {
      ...rootNoteFromPubkey(articleId, "a".repeat(64)),
      kind: 1068,
    };
    const sameAuthorRoot = rootNoteFromPubkey(
      sameAuthorRootId,
      "a".repeat(64),
    );
    const acceptedRoot = rootNoteFromPubkey(acceptedRootId, "b".repeat(64));

    subscribeMock.mockImplementation((requests) => {
      const id = String(subscribeMock.mock.calls.length);

      if (id === "1") {
        const { cb, onEose } = requests[0];
        cb(article, "wss://powrelay.xyz");
        cb(sameAuthorRoot, "wss://powrelay.xyz");
        cb(acceptedRoot, "wss://powrelay.xyz");
        onEose?.();
      }

      return { id, close: vi.fn() };
    });

    subGlobalFeed(vi.fn(), 24, { rootFilterDifficulty: 0 });

    expect(subscribeMock).toHaveBeenCalledTimes(2);
    expect(subscribeMock.mock.calls[1][0][0].filter["#e"]).toEqual([
      sameAuthorRootId,
      acceptedRootId,
    ]);
  });

  it("uses fresh PoW replies to fetch and enrich their root threads", () => {
    const rootId = `${"1".repeat(64)}`;
    const replyId = `${"2".repeat(64)}`;

    const powReply = rootNote(replyId);
    powReply.tags = [["e", rootId, "wss://relay.example", "root"]];

    subscribeMock.mockImplementation((requests) => {
      const id = String(subscribeMock.mock.calls.length);

      if (id === "1") {
        const { cb, onEose } = requests[0];
        cb(powReply, "wss://powrelay.xyz");
        onEose?.();
        return { id, close: vi.fn() };
      }

      if (id === "2") {
        const { cb, onEose } = requests[0];
        cb(rootNote(rootId), "wss://relay.example");
        onEose?.();
      }

      return { id, close: vi.fn() };
    });

    subGlobalFeed(vi.fn(), 24, { rootFilterDifficulty: 0 });

    expect(subscribeMock).toHaveBeenCalledTimes(3);
    expect(subscribeMock.mock.calls[1][0][0].filter).toMatchObject({
      ids: [rootId],
      kinds: [1],
      limit: 1,
    });
    expect(subscribeMock.mock.calls[2][0][0].filter).toMatchObject({
      "#e": [rootId],
      kinds: [1],
      limit: REPLY_QUERY_LIMIT,
      since: expect.any(Number),
    });
  });

  it("can enrich replies for known root ids", () => {
    const rootId = `${"1".repeat(64)}`;
    const replyId = `${"2".repeat(64)}`;
    const enrichmentRelays = ["wss://relay.damus.io"];

    subscribeMock.mockImplementation((requests) => {
      const id = String(subscribeMock.mock.calls.length);

      if (id === "1") {
        const { cb, onEose } = requests[0];
        cb(rootNote(replyId), enrichmentRelays[0]);
        onEose?.();
      }

      return { id, close: vi.fn() };
    });

    subRepliesForRootIds([rootId], vi.fn(), {
      relayUrls: enrichmentRelays,
      depth: 2,
    });

    expect(subscribeMock).toHaveBeenCalledTimes(2);

    const replyRequest = subscribeMock.mock.calls[0][0][0];
    expect(replyRequest.filter).toMatchObject({
      "#e": [rootId],
      kinds: [1],
      limit: REPLY_QUERY_LIMIT,
      since: expect.any(Number),
    });
    expect(replyRequest.relayUrls).toEqual(enrichmentRelays);

    const nestedReplyRequest = subscribeMock.mock.calls[1][0][0];
    expect(nestedReplyRequest.filter).toMatchObject({
      "#e": [replyId],
      kinds: [1],
      limit: REPLY_QUERY_LIMIT,
      since: expect.any(Number),
    });
  });

  it("caps reply parent ids and requested depth", () => {
    const rootIds = Array.from({ length: MAX_REPLY_PARENT_IDS + 10 }, (_, index) =>
      String(index).padStart(64, "0"),
    );

    const firstLevelChunkCount = Math.ceil(
      MAX_REPLY_PARENT_IDS / FEED_REPLY_PARENT_CHUNK_SIZE,
    );

    subscribeMock.mockImplementation((requests) => {
      const id = String(subscribeMock.mock.calls.length);
      if (Number(id) <= firstLevelChunkCount + 1) {
        const { cb, onEose } = requests[0];
        cb(rootNote(String(Number(id)).repeat(64)), "wss://relay.damus.io");
        onEose?.();
      }
      return { id, close: vi.fn() };
    });

    subRepliesForRootIds(rootIds, vi.fn(), { depth: MAX_REPLY_FETCH_DEPTH + 3 });

    expect(subscribeMock).toHaveBeenCalledTimes(firstLevelChunkCount + 1);
    const firstReplyRequest = subscribeMock.mock.calls[0][0][0];
    expect(firstReplyRequest.filter["#e"]).toHaveLength(
      FEED_REPLY_PARENT_CHUNK_SIZE,
    );
    expect(firstReplyRequest.filter).toMatchObject({
      kinds: [1],
      limit: REPLY_QUERY_LIMIT,
      since: expect.any(Number),
    });
  });

  it("opens reply parent chunks sequentially", () => {
    const rootIds = Array.from(
      { length: FEED_REPLY_PARENT_CHUNK_SIZE + 5 },
      (_, index) => String(index).padStart(64, "0"),
    );

    subscribeMock.mockImplementation(() => {
      const id = String(subscribeMock.mock.calls.length);
      return { id, close: vi.fn() };
    });

    subRepliesForRootIds(rootIds, vi.fn());

    expect(subscribeMock).toHaveBeenCalledTimes(1);
    expect(subscribeMock.mock.calls[0][0][0].filter["#e"]).toHaveLength(
      FEED_REPLY_PARENT_CHUNK_SIZE,
    );

    subscribeMock.mock.calls[0][0][0].onEose?.();

    expect(subscribeMock).toHaveBeenCalledTimes(2);
    expect(subscribeMock.mock.calls[1][0][0].filter["#e"]).toHaveLength(5);
  });

  it("fetches missing root ids in sequential chunks", () => {
    const rootIds = Array.from(
      { length: FEED_ROOT_FETCH_CHUNK_SIZE + 3 },
      (_, index) => String(index + 1).padStart(64, "0"),
    );
    const replies = rootIds.map((rootId, index) => ({
      ...rootNote(String(index + 100).padStart(64, "0")),
      tags: [["e", rootId, "wss://relay.example", "root"]],
    }));

    subscribeMock.mockImplementation((requests) => {
      const id = String(subscribeMock.mock.calls.length);

      if (id === "1") {
        const { cb, onEose } = requests[0];
        replies.forEach((reply) => cb(reply, "wss://powrelay.xyz"));
        onEose?.();
      }

      return { id, close: vi.fn() };
    });

    subGlobalFeed(vi.fn(), 24, { rootFilterDifficulty: 0 });

    expect(subscribeMock).toHaveBeenCalledTimes(2);
    expect(subscribeMock.mock.calls[1][0][0].filter.ids).toHaveLength(
      FEED_ROOT_FETCH_CHUNK_SIZE,
    );

    subscribeMock.mock.calls[1][0][0].onEose?.();

    expect(subscribeMock).toHaveBeenCalledTimes(3);
    expect(subscribeMock.mock.calls[2][0][0].filter.ids).toHaveLength(3);
  });

  it("closes reply traversal children that are added after the parent closes", () => {
    const rootId = `${"1".repeat(64)}`;
    const replyId = `${"2".repeat(64)}`;
    const closeMocks: ReturnType<typeof vi.fn>[] = [];

    subscribeMock.mockImplementation(() => {
      const id = String(subscribeMock.mock.calls.length);
      const close = vi.fn();
      closeMocks.push(close);
      return { id, close };
    });

    const handle = subRepliesForRootIds([rootId], vi.fn(), { depth: 2 });
    const firstRequest = subscribeMock.mock.calls[0][0][0];

    handle.close();
    firstRequest.cb(rootNote(replyId), "wss://relay.damus.io");
    firstRequest.onEose?.();

    expect(subscribeMock).toHaveBeenCalledTimes(2);
    expect(closeMocks[0]).toHaveBeenCalledTimes(1);
    expect(closeMocks[1]).toHaveBeenCalledTimes(1);
  });
});
