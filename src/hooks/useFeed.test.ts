import { describe, expect, it } from "vitest";
import type { Event } from "nostr-tools";
import type { ProcessedEvent } from "../nostr/types";
import { mergeProcessedFeedEvents } from "./useFeed";

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

  it("does not let an incomplete live row downgrade a bootstrap row", () => {
    const root = event({ id: "1".repeat(64) });
    const bootstrapRow = processed(root, {
      replies: [event({ id: "2".repeat(64), tags: [["e", root.id]] })],
      totalWork: Math.pow(2, 20),
    });
    const incompleteLiveRow = processed(root, {
      replies: [],
      totalWork: Math.pow(2, 16),
    });

    expect(mergeProcessedFeedEvents([bootstrapRow], [incompleteLiveRow])).toEqual([
      bootstrapRow,
    ]);
  });

  it("lets live rows upgrade or add feed items", () => {
    const existingRoot = event({ id: "1".repeat(64), created_at: 1 });
    const newRoot = event({ id: "2".repeat(64), created_at: 2 });
    const bootstrapRow = processed(existingRoot, {
      totalWork: Math.pow(2, 16),
    });
    const upgradedLiveRow = processed(existingRoot, {
      replies: [event({ id: "3".repeat(64), tags: [["e", existingRoot.id]] })],
      totalWork: Math.pow(2, 20),
    });
    const newLiveRow = processed(newRoot, {
      totalWork: Math.pow(2, 18),
    });

    const result = mergeProcessedFeedEvents(
      [bootstrapRow],
      [newLiveRow, upgradedLiveRow],
    );

    expect(result).toEqual([upgradedLiveRow, newLiveRow]);
  });
});
