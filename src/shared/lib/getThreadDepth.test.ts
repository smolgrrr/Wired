import { describe, expect, it } from "vitest";
import type { Event } from "nostr-tools";
import { getThreadDepth } from "./getThreadDepth";

function makeEvent(id: string, parentId?: string): Event {
  const tags: string[][] = [["client", "wired-green.vercel.app"]];
  if (parentId) {
    tags.push(["e", parentId]);
  }

  return {
    id,
    kind: 1,
    pubkey: "aa".repeat(32),
    created_at: 1,
    tags,
    content: id,
    sig: "sig",
  };
}

describe("getThreadDepth", () => {
  it("returns 0 for the root event", () => {
    const root = makeEvent("root");
    const events = new Map([["root", root]]);

    expect(getThreadDepth(root, "root", events)).toBe(0);
  });

  it("returns 1 for a direct reply to root", () => {
    const root = makeEvent("root");
    const reply = makeEvent("reply", "root");
    const events = new Map([
      ["root", root],
      ["reply", reply],
    ]);

    expect(getThreadDepth(reply, "root", events)).toBe(1);
  });

  it("caps depth at 3", () => {
    const root = makeEvent("root");
    const d1 = makeEvent("d1", "root");
    const d2 = makeEvent("d2", "d1");
    const d3 = makeEvent("d3", "d2");
    const d4 = makeEvent("d4", "d3");
    const events = new Map(
      [root, d1, d2, d3, d4].map((event) => [event.id, event]),
    );

    expect(getThreadDepth(d4, "root", events)).toBe(3);
  });

  it("falls back when parent is missing from the map", () => {
    const root = makeEvent("root");
    const orphan = makeEvent("orphan", "missing");
    const events = new Map([["root", root], ["orphan", orphan]]);

    expect(getThreadDepth(orphan, "root", events)).toBe(1);
  });
});