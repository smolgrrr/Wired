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
});

describe("processFeedEvents", () => {
  it("keeps one root post per pubkey and groups replies", () => {
    const root = event({ id: "1".repeat(64) });
    const duplicateAuthor = event({ id: "2".repeat(64), created_at: 2 });
    const reply = event({ id: "3".repeat(64), pubkey: "c".repeat(64), tags: [["e", root.id]] });

    const result = processFeedEvents([root, duplicateAuthor, reply]);

    expect(result).toHaveLength(1);
    expect(result[0].postEvent.id).toBe(root.id);
    expect(result[0].replies).toEqual([reply]);
    expect(result[0].threadReplyCount).toBe(1);
  });

  it("uses the same feed root eligibility for articles and root notes", () => {
    const article = event({
      id: "1".repeat(64),
      kind: 1068,
      pubkey: "a".repeat(64),
    });
    const duplicateAuthorRoot = event({
      id: "2".repeat(64),
      pubkey: "a".repeat(64),
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
      duplicateAuthorRoot,
      acceptedRoot,
      reply,
    ]);

    expect(result.map((item) => item.postEvent.id)).toEqual([
      acceptedRoot.id,
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
