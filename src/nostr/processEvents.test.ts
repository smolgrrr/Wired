import { describe, expect, it } from "vitest";
import { Event } from "nostr-tools";
import { parseRepost, processFeedEvents, toProcessedEvents } from "./processEvents";

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

describe("parseRepost", () => {
  it("rejects malformed repost content", () => {
    expect(parseRepost(event({ kind: 6, content: "not-json" }))).toBeNull();
  });
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
  });
});
