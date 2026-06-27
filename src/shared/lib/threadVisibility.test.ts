import { describe, expect, it } from "vitest";
import type { Event } from "nostr-tools";
import { isThreadDescendant } from "./threadVisibility";

function makeEvent(id: string, parentIds: string[] = []): Event {
  return {
    id,
    kind: 1,
    pubkey: "aa".repeat(32),
    created_at: 1,
    tags: parentIds.map((parentId) => ["e", parentId]),
    content: id,
    sig: "sig",
  };
}

describe("isThreadDescendant", () => {
  it("matches direct replies to the thread root", () => {
    const root = makeEvent("root");
    const reply = makeEvent("reply", ["root"]);

    expect(isThreadDescendant(reply, root.id, new Map([[root.id, root]]))).toBe(true);
  });

  it("matches nested replies whose parent chain reaches the thread root", () => {
    const root = makeEvent("root");
    const reply = makeEvent("reply", ["root"]);
    const nested = makeEvent("nested", ["reply"]);
    const eventsById = new Map(
      [root, reply, nested].map((event) => [event.id, event]),
    );

    expect(isThreadDescendant(nested, root.id, eventsById)).toBe(true);
  });

  it("does not match events from another thread", () => {
    const root = makeEvent("root");
    const otherRoot = makeEvent("other-root");
    const reply = makeEvent("reply", ["other-root"]);
    const eventsById = new Map(
      [root, otherRoot, reply].map((event) => [event.id, event]),
    );

    expect(isThreadDescendant(reply, root.id, eventsById)).toBe(false);
  });
});
