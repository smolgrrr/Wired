import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Event } from "nostr-tools";
import type { FiniteQuery, QueryCompletion } from "../browser-relay-access";
import type { SubCallback } from "../types";
import {
  MAX_REPLY_FETCH_DEPTH,
  MAX_REPLY_PARENT_IDS,
  REPLY_QUERY_LIMIT,
} from "./query-limits";

const { prepareRelayConnectionsMock, subscribeMock, startFiniteQueryMock } = vi.hoisted(() => ({
  prepareRelayConnectionsMock: vi.fn(),
  subscribeMock: vi.fn(),
  startFiniteQueryMock: vi.fn(),
}));

vi.mock("../client", () => ({
  prepareRelayConnections: prepareRelayConnectionsMock,
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
    prepareRelayConnectionsMock.mockReset();
    prepareRelayConnectionsMock.mockImplementation(() => ({
      done: Promise.resolve(),
      close: vi.fn(),
    }));
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

  it("starts configured missing-root coverage before querying still-missing ids on connected hints", async () => {
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
        requests[0].onEose?.();
      }

      if (id === "3") {
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
      dynamicRootHints: true,
    });

    await vi.waitFor(() => expect(subscribeMock).toHaveBeenCalledTimes(4));

    const configuredRootRequest = subscribeMock.mock.calls[1][0][0];
    expect(configuredRootRequest.filter).toEqual({
      ids: [rootId],
      kinds: [1],
      limit: 1,
    });
    expect(configuredRootRequest.filter).not.toHaveProperty("since");
    expect(configuredRootRequest.relayUrls).toEqual(threadRelays);
    expect(prepareRelayConnectionsMock).toHaveBeenCalledWith(
      ["wss://hint.example"],
      "wired.browser.feed",
    );

    const hintedRootRequest = subscribeMock.mock.calls[2][0][0];
    expect(hintedRootRequest.filter).toEqual({
      ids: [rootId],
      kinds: [1],
      limit: 1,
    });
    expect(hintedRootRequest.relayUrls).toEqual(["wss://hint.example"]);

    const replyRequest = subscribeMock.mock.calls[3][0][0];
    expect(replyRequest.filter).toMatchObject({
      "#e": [rootId],
      kinds: [1],
    });
    expect(replyRequest.relayUrls).toEqual(threadRelays);
  });

  it("keeps configured coverage immediate while a hint connection is delayed", async () => {
    const rootId = "1".repeat(64);
    const reply = {
      ...rootNote("2".repeat(64)),
      tags: [["e", rootId, "wss://slow-hint.example", "root"]],
    };
    let resolveHintConnection!: () => void;
    prepareRelayConnectionsMock.mockImplementation(() => ({
      done: new Promise<void>((resolve) => {
        resolveHintConnection = resolve;
      }),
      close: vi.fn(),
    }));
    const onEvent = vi.fn() as SubCallback;

    subscribeMock.mockImplementation((requests) => {
      const id = String(subscribeMock.mock.calls.length);
      if (id === "1") {
        requests[0].cb(reply, "wss://powrelay.xyz");
        requests[0].onEose?.();
      }
      if (id === "2") {
        requests[0].cb(rootNote(rootId), "wss://configured.example");
        requests[0].onEose?.();
      }
      return { id, close: vi.fn() };
    });

    subGlobalFeed(onEvent, 24, {
      rootRelayUrls: ["wss://powrelay.xyz"],
      replyRelayUrls: ["wss://configured.example"],
      replyDepth: 0,
      rootFilterDifficulty: 0,
      dynamicRootHints: true,
    });

    expect(subscribeMock).toHaveBeenCalledTimes(2);
    expect(subscribeMock.mock.calls[1][0][0].relayUrls).toEqual([
      "wss://configured.example",
    ]);
    expect(subscribeMock.mock.invocationCallOrder[1]).toBeLessThan(
      prepareRelayConnectionsMock.mock.invocationCallOrder[0]!,
    );

    resolveHintConnection();
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ id: rootId }),
      "wss://configured.example",
    ));
    expect(subscribeMock).toHaveBeenCalledTimes(2);
  });

  it("normalizes duplicate configured hints without extra connections or queries", () => {
    const rootId = "1".repeat(64);
    const reply = {
      ...rootNote("2".repeat(64)),
      tags: [["e", rootId, "wss://configured.example/", "root"]],
    };

    subscribeMock.mockImplementation((requests) => {
      const id = String(subscribeMock.mock.calls.length);
      if (id === "1") {
        requests[0].cb(reply, "wss://powrelay.xyz");
        requests[0].onEose?.();
      }
      if (id === "2") {
        requests[0].cb(rootNote(rootId), "wss://configured.example");
        requests[0].onEose?.();
      }
      return { id, close: vi.fn() };
    });

    subGlobalFeed(vi.fn(), 24, {
      replyRelayUrls: ["wss://configured.example/"],
      replyDepth: 0,
      rootFilterDifficulty: 0,
      dynamicRootHints: true,
    });

    expect(subscribeMock).toHaveBeenCalledTimes(2);
    expect(subscribeMock.mock.calls[1][0][0].relayUrls).toEqual([
      "wss://configured.example",
    ]);
    expect(prepareRelayConnectionsMock).not.toHaveBeenCalled();
  });

  it("queries each hinted relay for only the exact roots it advertised", async () => {
    const firstRootId = "1".repeat(64);
    const secondRootId = "2".repeat(64);
    const activities = [
      {
        ...rootNote("3".repeat(64)),
        tags: [["e", firstRootId, "wss://first-hint.example", "root"]],
      },
      {
        ...rootNote("4".repeat(64)),
        tags: [["e", secondRootId, "wss://second-hint.example", "root"]],
      },
    ];
    let resolveSecondHint!: () => void;
    prepareRelayConnectionsMock.mockImplementation(([relayUrl]: [string]) => {
      if (relayUrl === "wss://first-hint.example") {
        return { done: Promise.resolve(), close: vi.fn() };
      }
      return {
        done: new Promise<void>((resolve) => {
          resolveSecondHint = resolve;
        }),
        close: vi.fn(),
      };
    });

    subscribeMock.mockImplementation((requests) => {
      const id = String(subscribeMock.mock.calls.length);
      if (id === "1") {
        activities.forEach((event) =>
          requests[0].cb(event, "wss://powrelay.xyz")
        );
        requests[0].onEose?.();
      }
      if (id === "2") requests[0].onEose?.();
      if (id === "3") {
        requests[0].cb(rootNote(firstRootId), "wss://first-hint.example");
        requests[0].onEose?.();
      }
      if (id === "4") {
        requests[0].cb(rootNote(secondRootId), "wss://second-hint.example");
        requests[0].onEose?.();
      }
      return { id, close: vi.fn() };
    });

    subGlobalFeed(vi.fn(), 24, {
      replyRelayUrls: ["wss://configured.example"],
      replyDepth: 0,
      rootFilterDifficulty: 0,
      dynamicRootHints: true,
    });

    await vi.waitFor(() => expect(subscribeMock).toHaveBeenCalledTimes(3));
    expect(subscribeMock.mock.calls[2][0][0]).toMatchObject({
      filter: {
        ids: [firstRootId],
        kinds: [1],
        limit: 1,
      },
      relayUrls: ["wss://first-hint.example"],
    });
    resolveSecondHint();
    await vi.waitFor(() => expect(subscribeMock).toHaveBeenCalledTimes(4));
    expect(prepareRelayConnectionsMock).toHaveBeenNthCalledWith(
      1,
      ["wss://first-hint.example"],
      "wired.browser.feed",
    );
    expect(prepareRelayConnectionsMock).toHaveBeenNthCalledWith(
      2,
      ["wss://second-hint.example"],
      "wired.browser.feed",
    );
    expect(subscribeMock.mock.calls[3][0][0]).toMatchObject({
      filter: {
        ids: [secondRootId],
        kinds: [1],
        limit: 1,
      },
      relayUrls: ["wss://second-hint.example"],
    });
  });

  it("settles a failed hint path without inventing a root identity", async () => {
    const rootId = "1".repeat(64);
    const activityId = "2".repeat(64);
    const unrelatedRootId = "3".repeat(64);
    const activity = {
      ...rootNote(activityId),
      tags: [["e", rootId, "wss://failed-hint.example", "root"]],
    };
    const onEventMock = vi.fn();

    subscribeMock.mockImplementation((requests) => {
      const id = String(subscribeMock.mock.calls.length);
      if (id === "1") {
        requests[0].cb(activity, "wss://powrelay.xyz");
        requests[0].onEose?.();
      }
      if (id === "2") requests[0].onEose?.();
      if (id === "3") {
        requests[0].cb(
          rootNote(unrelatedRootId),
          "wss://failed-hint.example",
        );
        requests[0].onEose?.();
      }
      return { id, close: vi.fn() };
    });

    subGlobalFeed(onEventMock as SubCallback, 24, {
      replyRelayUrls: ["wss://configured.example"],
      replyDepth: 0,
      rootFilterDifficulty: 0,
      dynamicRootHints: true,
    });

    await vi.waitFor(() => expect(subscribeMock).toHaveBeenCalledTimes(3));
    expect(subscribeMock.mock.calls[2][0][0]).toMatchObject({
      filter: { ids: [rootId], kinds: [1], limit: 1 },
      relayUrls: ["wss://failed-hint.example"],
    });
    expect(onEventMock.mock.calls.map(([event]) => event.id)).toEqual([activityId]);
  });

  it("does not start a delayed hint query after navigation cleanup", async () => {
    const rootId = "1".repeat(64);
    const activity = {
      ...rootNote("2".repeat(64)),
      tags: [["e", rootId, "wss://slow-hint.example", "root"]],
    };
    let resolveHintConnection!: () => void;
    const hintConnection = new Promise<void>((resolve) => {
      resolveHintConnection = resolve;
    });
    const closePreparation = vi.fn();
    prepareRelayConnectionsMock.mockReturnValue({
      done: hintConnection,
      close: closePreparation,
    });

    subscribeMock.mockImplementation((requests) => {
      const id = String(subscribeMock.mock.calls.length);
      if (id === "1") {
        requests[0].cb(activity, "wss://powrelay.xyz");
        requests[0].onEose?.();
      }
      if (id === "2") requests[0].onEose?.();
      return { id, close: vi.fn() };
    });

    const handle = subGlobalFeed(vi.fn(), 24, {
      replyRelayUrls: ["wss://configured.example"],
      replyDepth: 0,
      rootFilterDifficulty: 0,
      dynamicRootHints: true,
    });
    expect(subscribeMock).toHaveBeenCalledTimes(2);

    handle.close();
    resolveHintConnection();
    await hintConnection;
    await Promise.resolve();
    await Promise.resolve();

    expect(subscribeMock).toHaveBeenCalledTimes(2);
    expect(closePreparation).toHaveBeenCalledOnce();
  });

  it("keeps the prior combined-coverage path as an immediate rollback", () => {
    const rootId = "1".repeat(64);
    const activity = {
      ...rootNote("2".repeat(64)),
      tags: [["e", rootId, "wss://hint.example", "root"]],
    };

    subscribeMock.mockImplementation((requests) => {
      const id = String(subscribeMock.mock.calls.length);
      if (id === "1") {
        requests[0].cb(activity, "wss://powrelay.xyz");
        requests[0].onEose?.();
      }
      return { id, close: vi.fn() };
    });

    subGlobalFeed(vi.fn(), 24, {
      replyRelayUrls: ["wss://configured.example"],
      replyDepth: 0,
      rootFilterDifficulty: 0,
      dynamicRootHints: false,
    });

    expect(subscribeMock).toHaveBeenCalledTimes(2);
    expect(subscribeMock.mock.calls[1][0][0]).toMatchObject({
      filter: { ids: [rootId], kinds: [1], limit: 1 },
      relayUrls: ["wss://configured.example", "wss://hint.example"],
    });
    expect(prepareRelayConnectionsMock).not.toHaveBeenCalled();
  });

  it("resolves chained hinted parents before enriching the root thread", async () => {
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

      if (id === "2" || id === "4") {
        requests[0].onEose?.();
      }

      if (id === "3") {
        const { cb, onEose } = requests[0];
        cb(parentReply, "wss://parent.example");
        onEose?.();
      }

      if (id === "5") {
        const { cb, onEose } = requests[0];
        cb(rootNote(rootId), "wss://root.example");
        onEose?.();
      }

      return { id, close: vi.fn() };
    });

    subGlobalFeed(vi.fn(), 24, {
      replyRelayUrls: threadRelays,
      rootFilterDifficulty: 0,
      dynamicRootHints: true,
    });

    await vi.waitFor(() => expect(subscribeMock).toHaveBeenCalledTimes(6));
    expect(subscribeMock.mock.calls[1][0][0].filter).toEqual({
      ids: [parentId],
      kinds: [1],
      limit: 1,
    });
    expect(subscribeMock.mock.calls[1][0][0].relayUrls).toEqual(threadRelays);
    expect(subscribeMock.mock.calls[2][0][0]).toMatchObject({
      filter: {
        ids: [parentId],
        kinds: [1],
        limit: 1,
      },
      relayUrls: ["wss://parent.example"],
    });
    expect(subscribeMock.mock.calls[3][0][0].filter).toEqual({
      ids: [rootId],
      kinds: [1],
      limit: 1,
    });
    expect(subscribeMock.mock.calls[3][0][0].relayUrls).toEqual(threadRelays);
    expect(subscribeMock.mock.calls[4][0][0]).toMatchObject({
      filter: {
        ids: [rootId],
        kinds: [1],
        limit: 1,
      },
      relayUrls: ["wss://root.example"],
    });
    expect(subscribeMock.mock.calls[5][0][0].filter).toMatchObject({
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

  it("fetches missing root ids in sequential configured chunks", async () => {
    const rootIds = Array.from(
      { length: FEED_ROOT_FETCH_CHUNK_SIZE + 3 },
      (_, index) => String(index + 1).padStart(64, "0"),
    );
    const replies = rootIds.map((rootId, index) => ({
      ...rootNote(String(index + 100).padStart(64, "0")),
      tags: [["e", rootId, "wss://relay.example/", "root"]],
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

    subGlobalFeed(vi.fn(), 24, {
      replyRelayUrls: ["wss://relay.example"],
      rootFilterDifficulty: 0,
      dynamicRootHints: true,
    });

    expect(subscribeMock).toHaveBeenCalledTimes(2);
    expect(subscribeMock.mock.calls[1][0][0].filter.ids).toHaveLength(
      FEED_ROOT_FETCH_CHUNK_SIZE,
    );

    subscribeMock.mock.calls[1][0][0].onEose?.();

    await vi.waitFor(() => expect(subscribeMock).toHaveBeenCalledTimes(3));
    expect(subscribeMock.mock.calls[2][0][0].filter.ids).toHaveLength(3);
    expect(prepareRelayConnectionsMock).not.toHaveBeenCalled();
  });

  it("starts the next configured chunk without waiting for slow hints", async () => {
    const rootIds = Array.from(
      { length: FEED_ROOT_FETCH_CHUNK_SIZE + 1 },
      (_, index) => String(index + 1).padStart(64, "0"),
    );
    const activities = rootIds.map((rootId, index) => ({
      ...rootNote(String(index + 100).padStart(64, "0")),
      tags: [["e", rootId, "wss://slow-hint.example", "root"]],
    }));
    let resolveHintConnection!: () => void;
    const closePreparation = vi.fn();
    prepareRelayConnectionsMock.mockReturnValue({
      done: new Promise<void>((resolve) => {
        resolveHintConnection = resolve;
      }),
      close: closePreparation,
    });
    subscribeMock.mockImplementation((requests) => {
      const id = String(subscribeMock.mock.calls.length);
      if (id === "1") {
        activities.forEach((event) =>
          requests[0].cb(event, "wss://powrelay.xyz")
        );
        requests[0].onEose?.();
      }
      return { id, close: vi.fn() };
    });

    const handle = subGlobalFeed(vi.fn(), 24, {
      replyRelayUrls: ["wss://configured.example"],
      replyDepth: 0,
      rootFilterDifficulty: 0,
      dynamicRootHints: true,
    });
    expect(subscribeMock.mock.calls[1][0][0].filter.ids).toHaveLength(
      FEED_ROOT_FETCH_CHUNK_SIZE,
    );

    subscribeMock.mock.calls[1][0][0].onEose?.();
    await vi.waitFor(() => expect(subscribeMock).toHaveBeenCalledTimes(3));

    expect(subscribeMock.mock.calls[2][0][0]).toMatchObject({
      filter: { ids: [rootIds.at(-1)], kinds: [1], limit: 1 },
      relayUrls: ["wss://configured.example"],
    });
    resolveHintConnection();
    await vi.waitFor(() => expect(subscribeMock).toHaveBeenCalledTimes(4));
    expect(subscribeMock.mock.calls[3][0][0].filter.ids).toHaveLength(
      FEED_ROOT_FETCH_CHUNK_SIZE,
    );

    subscribeMock.mock.calls[2][0][0].onEose?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(subscribeMock).toHaveBeenCalledTimes(4);

    subscribeMock.mock.calls[3][0][0].onEose?.();
    await vi.waitFor(() => expect(subscribeMock).toHaveBeenCalledTimes(5));
    expect(subscribeMock.mock.calls[4][0][0]).toMatchObject({
      filter: { ids: [rootIds.at(-1)], kinds: [1], limit: 1 },
      relayUrls: ["wss://slow-hint.example"],
    });

    handle.close();
    expect(closePreparation).toHaveBeenCalledOnce();
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
