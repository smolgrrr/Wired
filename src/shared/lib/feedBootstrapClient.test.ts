import { describe, expect, it } from "vitest";
import { Event } from "nostr-tools";
import { eventsFromProcessed } from "./feedBootstrapClient";

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

describe("eventsFromProcessed", () => {
  it("deduplicates post and reply events", () => {
    const root = event({ id: "1".repeat(64) });
    const reply = event({ id: "2".repeat(64), pubkey: "c".repeat(64) });

    const events = eventsFromProcessed([
      { postEvent: root, replies: [reply, reply], totalWork: 0 },
    ]);

    expect(events).toHaveLength(2);
    expect(events.map((item) => item.id)).toEqual([root.id, reply.id]);
  });
});