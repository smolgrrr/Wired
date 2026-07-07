import { describe, expect, it, vi } from "vitest";
import { Event } from "nostr-tools";
import {
  collectThreadReplies,
  compareProcessedEventsByWork,
  processFeedEvents,
  toProcessedEvents,
} from "./processEvents";

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
  content: "plain text https://example.com/image.jpg nostr:note1example :emoji:",
  sig: "b".repeat(128),
  ...overrides,
});

describe("toProcessedEvents", () => {
  it("sorts replies oldest first regardless of signal", () => {
    const op = event({ id: "1".repeat(64), created_at: 100 });
    const olderReply = event({
      id: "2".repeat(64),
      pubkey: "b".repeat(64),
      created_at: 101,
      tags: [["e", op.id]],
    });
    const newerReply = event({
      id: "3".repeat(64),
      pubkey: "c".repeat(64),
      created_at: 200,
      tags: [["e", op.id]],
    });

    const result = toProcessedEvents([olderReply, newerReply], [olderReply, newerReply]);

    expect(result.map((item) => item.postEvent.id)).toEqual([olderReply.id, newerReply.id]);
  });

  it("adds relay hints for processed root posts", () => {
    const op = event({ id: "1".repeat(64), created_at: 100 });
    const reply = event({
      id: "2".repeat(64),
      pubkey: "b".repeat(64),
      created_at: 101,
      tags: [["e", op.id]],
    });

    const result = toProcessedEvents(
      [op],
      [reply],
      new Map([
        [op.id, ["wss://relay.example/", "wss://relay.example"]],
        [reply.id, ["wss://reply.example"]],
      ]),
    );

    expect(result[0]).toMatchObject({
      postEvent: op,
      relayHints: ["wss://relay.example"],
    });
  });
});

describe("processFeedEvents", () => {
  it("keeps valid same-author root posts and groups replies", () => {
    const root = event({ id: "1".repeat(64) });
    const sameAuthorRoot = event({ id: "2".repeat(64), created_at: 2 });
    const reply = event({ id: "3".repeat(64), pubkey: "c".repeat(64), tags: [["e", root.id]] });

    const result = processFeedEvents([root, sameAuthorRoot, reply]);

    expect(result.map((item) => item.postEvent.id)).toEqual([
      root.id,
      sameAuthorRoot.id,
    ]);
    expect(result.find((item) => item.postEvent.id === root.id)?.replies).toEqual([
      reply,
    ]);
    expect(result.find((item) => item.postEvent.id === root.id)?.threadReplyCount).toBe(1);
  });

  it("carries observed relay hints for feed roots", () => {
    const root = event({ id: "1".repeat(64) });
    const reply = event({
      id: "2".repeat(64),
      pubkey: "b".repeat(64),
      tags: [["e", root.id]],
    });

    const result = processFeedEvents(
      [root, reply],
      0,
      new Map([
        [root.id, ["wss://relay.wiredsignal.online"]],
        [reply.id, ["wss://reply.example"]],
      ]),
    );

    expect(result).toHaveLength(1);
    expect(result[0].relayHints).toEqual(["wss://relay.wiredsignal.online"]);
  });

  it("uses the same feed root eligibility for articles and root notes", () => {
    const article = event({
      id: "1".repeat(64),
      kind: 1068,
      pubkey: "a".repeat(64),
    });
    const sameAuthorRoot = event({
      id: "2".repeat(64),
      pubkey: "a".repeat(64),
      created_at: 2,
    });
    const acceptedRoot = event({
      id: "3".repeat(64),
      pubkey: "b".repeat(64),
    });
    const reply = event({
      id: "4".repeat(64),
      pubkey: "c".repeat(64),
      tags: [["e", acceptedRoot.id]],
    });

    const result = processFeedEvents([
      article,
      sameAuthorRoot,
      acceptedRoot,
      reply,
    ]);

    expect(result.map((item) => item.postEvent.id)).toEqual([
      acceptedRoot.id,
      sameAuthorRoot.id,
      article.id,
    ]);
    expect(result.find((item) => item.postEvent.id === acceptedRoot.id)?.replies).toEqual([
      reply,
    ]);
  });

  it("includes nested thread replies in feed reply count and total work", () => {
    const root = event({
      id: "1".repeat(64),
      pubkey: "1".repeat(64),
      tags: [["nonce", "root", "16"]],
    });
    const directReply = event({
      id: "2".repeat(64),
      pubkey: "2".repeat(64),
      tags: [["e", root.id], ["nonce", "direct", "16"]],
    });
    const nestedReply = event({
      id: "3".repeat(64),
      pubkey: "3".repeat(64),
      tags: [["e", directReply.id], ["nonce", "nested", "16"]],
    });

    const result = processFeedEvents([root, directReply, nestedReply], 16);

    expect(result).toHaveLength(1);
    expect(result[0].replies.map((reply) => reply.id)).toEqual([
      directReply.id,
      nestedReply.id,
    ]);
    expect(result[0]).toMatchObject({
      threadReplyCount: 2,
      replyWork: Math.pow(2, 17),
      rankingReplyCount: 2,
    });
  });

  it("promotes an older root when a fresh reply qualifies", () => {
    const oldRoot = event({
      id: "1".repeat(64),
      created_at: 1,
    });
    const qualifyingReply = event({
      id: "2".repeat(64),
      created_at: 100,
      tags: [["e", oldRoot.id, "", "root"], ["nonce", "reply", "16"]],
    });

    const result = processFeedEvents([oldRoot, qualifyingReply], 16);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      postEvent: oldRoot,
      replies: [qualifyingReply],
      rootWork: 1,
      replyWork: Math.pow(2, 16),
      rankingReplyCount: 1,
    });
  });

  it("resolves parent-only reply activity when the parent event is available", () => {
    const oldRoot = event({
      id: "1".repeat(64),
      created_at: 1,
    });
    const parentReply = event({
      id: "2".repeat(64),
      created_at: 50,
      tags: [["e", oldRoot.id]],
    });
    const qualifyingNestedReply = event({
      id: "3".repeat(64),
      created_at: 100,
      tags: [["e", parentReply.id], ["nonce", "nested", "16"]],
    });

    const result = processFeedEvents(
      [oldRoot, parentReply, qualifyingNestedReply],
      16,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      postEvent: oldRoot,
      replies: [parentReply, qualifyingNestedReply],
      replyWork: Math.pow(2, 16),
      rankingReplyCount: 1,
      threadReplyCount: 2,
    });
  });

  it("does not render an unresolved reply parent as a feed post", () => {
    const missingRootId = "1".repeat(64);
    const parentReply = event({
      id: "2".repeat(64),
      tags: [["e", missingRootId]],
    });
    const qualifyingNestedReply = event({
      id: "3".repeat(64),
      tags: [["e", parentReply.id], ["nonce", "nested", "16"]],
    });

    expect(processFeedEvents([parentReply, qualifyingNestedReply], 16)).toEqual([]);
  });

  it("ignores plain repost events", () => {
    const repost = event({ kind: 6, content: JSON.stringify(event()) });

    expect(processFeedEvents([repost])).toEqual([]);
  });

  it("uses the active filter difficulty as the minimum reply work difficulty", () => {
    const lowerWorkRoot = event({
      id: "1".repeat(64),
      pubkey: "1".repeat(64),
      created_at: 2,
      tags: [["nonce", "root-a", "16"]],
    });
    const highWorkRoot = event({
      id: "2".repeat(64),
      pubkey: "2".repeat(64),
      created_at: 1,
      tags: [["nonce", "root-b", "20"]],
    });
    const lowPowReplies = Array.from({ length: 20 }, (_, index) =>
      event({
        id: `3${String(index).padStart(63, "0")}`,
        pubkey: `3${String(index).padStart(63, "0")}`,
        created_at: 3 + index,
        tags: [["e", lowerWorkRoot.id], ["nonce", String(index), "15"]],
      }),
    );

    const result = processFeedEvents(
      [lowerWorkRoot, highWorkRoot, ...lowPowReplies],
      16,
    );

    expect(result.map((item) => item.postEvent.id)).toEqual([
      highWorkRoot.id,
      lowerWorkRoot.id,
    ]);
    expect(result.find((item) => item.postEvent.id === lowerWorkRoot.id)).toMatchObject({
      replies: lowPowReplies,
      replyWork: 0,
      rankingReplyCount: 0,
    });
  });

  it("allows qualifying reply work to lift a thread", () => {
    const repliedRoot = event({
      id: "1".repeat(64),
      pubkey: "1".repeat(64),
      created_at: 1,
      tags: [["nonce", "root-a", "16"]],
    });
    const unrepliedRoot = event({
      id: "2".repeat(64),
      pubkey: "2".repeat(64),
      created_at: 2,
      tags: [["nonce", "root-b", "20"]],
    });
    const qualifyingReplies = Array.from({ length: 16 }, (_, index) =>
      event({
        id: `3${String(index).padStart(63, "0")}`,
        pubkey: `3${String(index).padStart(63, "0")}`,
        created_at: 3 + index,
        tags: [["e", repliedRoot.id], ["nonce", String(index), "16"]],
      }),
    );

    const result = processFeedEvents(
      [repliedRoot, unrepliedRoot, ...qualifyingReplies],
      16,
    );

    expect(result.map((item) => item.postEvent.id)).toEqual([
      repliedRoot.id,
      unrepliedRoot.id,
    ]);
    expect(result[0]).toMatchObject({
      replyWork: Math.pow(2, 20),
      rankingReplyCount: 16,
    });
  });

  it("includes an old low-work root when fresh qualifying activity points at it", () => {
    const oldRoot = event({
      id: "1".repeat(64),
      pubkey: "1".repeat(64),
      created_at: 1,
      tags: [["nonce", "root", "0"]],
    });
    const freshPowReply = event({
      id: "2".repeat(64),
      pubkey: "2".repeat(64),
      created_at: 100,
      tags: [
        ["e", oldRoot.id, "wss://relay.example", "root"],
        ["nonce", "reply", "24"],
      ],
    });

    const result = processFeedEvents([oldRoot, freshPowReply], 16);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      postEvent: oldRoot,
      replies: [freshPowReply],
      replyWork: Math.pow(2, 24),
      rankingReplyCount: 1,
    });
  });

  it("does not include an old low-work root for below-threshold activity", () => {
    const oldRoot = event({
      id: "1".repeat(64),
      pubkey: "1".repeat(64),
      created_at: 1,
      tags: [["nonce", "root", "0"]],
    });
    const weakReply = event({
      id: "2".repeat(64),
      pubkey: "2".repeat(64),
      created_at: 100,
      tags: [
        ["e", oldRoot.id, "wss://relay.example", "root"],
        ["nonce", "reply", "15"],
      ],
    });

    expect(processFeedEvents([oldRoot, weakReply], 16)).toEqual([]);
  });
});

describe("collectThreadReplies", () => {
  it("deduplicates replies that tag both root and parent", () => {
    const root = event({ id: "1".repeat(64) });
    const directReply = event({
      id: "2".repeat(64),
      tags: [["e", root.id]],
    });
    const nestedReply = event({
      id: "3".repeat(64),
      tags: [["e", root.id], ["e", directReply.id]],
    });
    const repliesByParent = new Map([
      [root.id, [directReply, nestedReply]],
      [directReply.id, [nestedReply]],
    ]);

    expect(collectThreadReplies(root.id, repliesByParent).map((reply) => reply.id)).toEqual([
      directReply.id,
      nestedReply.id,
    ]);
  });
});

describe("compareProcessedEventsByWork", () => {
  it("breaks equal work ties by newer root post first", () => {
    const older = {
      postEvent: event({ id: "1".repeat(64), created_at: 1 }),
      replies: [],
      totalWork: 100,
    };
    const newer = {
      postEvent: event({ id: "2".repeat(64), created_at: 2 }),
      replies: [],
      totalWork: 100,
    };

    expect([older, newer].sort(compareProcessedEventsByWork)).toEqual([newer, older]);
  });
});
