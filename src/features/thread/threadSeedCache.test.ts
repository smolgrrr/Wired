// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import type { Event } from "nostr-tools";
import { readThreadSeedEvents, writeThreadSeedEvents } from "./threadSeedCache";

function event(overrides: Partial<Event> = {}): Event {
  return {
    id: "1".repeat(64),
    pubkey: "2".repeat(64),
    created_at: 1,
    kind: 1,
    tags: [],
    content: "hello",
    sig: "3".repeat(128),
    ...overrides,
  };
}

describe("threadSeedCache", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("stores and reads seed events by thread id", () => {
    const first = event({ id: "a".repeat(64) });
    const second = event({ id: "b".repeat(64) });

    writeThreadSeedEvents(first.id, [first]);
    writeThreadSeedEvents(second.id, [second]);

    expect(readThreadSeedEvents(first.id)).toEqual([first]);
    expect(readThreadSeedEvents(second.id)).toEqual([second]);
  });

  it("ignores corrupted seed data", () => {
    sessionStorage.setItem(`threadSeed:${"a".repeat(64)}`, "{not json");

    expect(readThreadSeedEvents("a".repeat(64))).toEqual([]);
  });

  it("filters invalid event shapes", () => {
    const valid = event({ id: "a".repeat(64) });
    sessionStorage.setItem(
      `threadSeed:${valid.id}`,
      JSON.stringify({ events: [valid, { id: "missing-fields" }] }),
    );

    expect(readThreadSeedEvents(valid.id)).toEqual([valid]);
  });
});
