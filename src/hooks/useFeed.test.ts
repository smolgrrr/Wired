import { describe, expect, it, vi } from "vitest";
import type { Event } from "nostr-tools";
import type { ProcessedEvent } from "../nostr/types";
import { mergeProcessedFeedEvents } from "./useFeed";

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
  content: "plain text",
  sig: "b".repeat(128),
  ...overrides,
});

const processed = (
  postEvent: Event,
  overrides: Partial<ProcessedEvent> = {},
): ProcessedEvent => ({
  postEvent,
  replies: [],
  totalWork: 1,
  threadReplyCount: 0,
  ...overrides,
});

describe("mergeProcessedFeedEvents", () => {
  it("uses pre-ranked bootstrap rows as first-class feed items", () => {
    const replyPoweredRoot = event({
      id: "1".repeat(64),
      created_at: 1,
    });
    const highRootWork = event({
      id: "2".repeat(64),
      created_at: 2,
    });

    const result = mergeProcessedFeedEvents(
      [
        processed(replyPoweredRoot, {
          rootWork: 4,
          replyWork: Math.pow(2, 24),
          totalWork: Math.pow(2, 24) + 4,
        }),
        processed(highRootWork, {
          rootWork: Math.pow(2, 20),
          replyWork: 0,
          totalWork: Math.pow(2, 20),
        }),
      ],
      [],
    );

    expect(result.map((item) => item.postEvent.id)).toEqual([
      replyPoweredRoot.id,
      highRootWork.id,
    ]);
  });

  it("recomputes merged scores from the union of bootstrap and live replies", () => {
    const root = event({
      id: "1".repeat(64),
      tags: [["nonce", "root", "18"]],
    });
    const bootstrapReply = event({
      id: "2".repeat(64),
      tags: [["e", root.id], ["nonce", "bootstrap", "24"]],
    });
    const liveReplyA = event({
      id: "3".repeat(64),
      tags: [["e", root.id], ["nonce", "live-a", "16"]],
    });
    const liveReplyB = event({
      id: "4".repeat(64),
      tags: [["e", root.id], ["nonce", "live-b", "16"]],
    });
    const bootstrapRow = processed(root, {
      replies: [bootstrapReply],
      totalWork: Math.pow(2, 24) + Math.pow(2, 18),
      threadReplyCount: 1,
    });
    const liveRow = processed(root, {
      replies: [liveReplyA, liveReplyB],
      totalWork: Math.pow(2, 18) + Math.pow(2, 17),
      threadReplyCount: 2,
    });

    const [merged] = mergeProcessedFeedEvents([bootstrapRow], [liveRow], 21);

    expect(merged.replies.map((reply) => reply.id)).toEqual([
      bootstrapReply.id,
      liveReplyA.id,
      liveReplyB.id,
    ]);
    expect(merged).toMatchObject({
      threadReplyCount: 3,
      replyWork: Math.pow(2, 24),
      totalWork: Math.pow(2, 24) + Math.pow(2, 18),
    });
  });

  it("keeps bootstrap reply work when live data is incomplete", () => {
    const root = event({
      id: "1".repeat(64),
      tags: [["nonce", "root", "20"]],
    });
    const bootstrapReply = event({
      id: "2".repeat(64),
      tags: [["e", root.id], ["nonce", "bootstrap", "20"]],
    });
    const bootstrapRow = processed(root, {
      replies: [bootstrapReply],
      totalWork: Math.pow(2, 21),
      threadReplyCount: 1,
    });
    const incompleteLiveRow = processed(root, {
      replies: [],
      totalWork: Math.pow(2, 20),
      threadReplyCount: 0,
    });

    const [merged] = mergeProcessedFeedEvents(
      [bootstrapRow],
      [incompleteLiveRow],
      16,
    );

    expect(merged).toMatchObject({
      replies: [bootstrapReply],
      threadReplyCount: 1,
      replyWork: Math.pow(2, 20),
      totalWork: Math.pow(2, 21),
    });
  });

  it("lets live rows add feed items that are missing from bootstrap", () => {
    const existingRoot = event({ id: "1".repeat(64), created_at: 1 });
    const newRoot = event({
      id: "2".repeat(64),
      created_at: 2,
      tags: [["nonce", "root", "18"]],
    });
    const bootstrapRow = processed(existingRoot, {
      totalWork: Math.pow(2, 16),
    });
    const upgradedReply = event({
      id: "3".repeat(64),
      tags: [["e", existingRoot.id], ["nonce", "reply", "20"]],
    });
    const upgradedLiveRow = processed(existingRoot, {
      replies: [upgradedReply],
      totalWork: Math.pow(2, 20),
    });
    const newLiveRow = processed(newRoot, {
      totalWork: Math.pow(2, 18),
    });

    const result = mergeProcessedFeedEvents(
      [bootstrapRow],
      [newLiveRow, upgradedLiveRow],
      16,
    );

    expect(result.map((item) => item.postEvent.id)).toEqual([
      existingRoot.id,
      newRoot.id,
    ]);
    expect(result[0]).toMatchObject({
      replies: [upgradedReply],
      threadReplyCount: 1,
      totalWork: Math.pow(2, 20) + 1,
    });
    expect(result[1]).toEqual(newLiveRow);
  });
});