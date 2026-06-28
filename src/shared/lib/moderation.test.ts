import { describe, expect, it } from "vitest";
import type { Event } from "nostr-tools";
import {
  contentFingerprint,
  filterModeratedEvents,
  manifestFromActions,
  type ModerationAction,
} from "./moderation";

function event(overrides: Partial<Event>): Event {
  return {
    id: "a".repeat(64),
    pubkey: "b".repeat(64),
    created_at: 1,
    kind: 1,
    tags: [],
    content: "hello",
    sig: "c".repeat(128),
    ...overrides,
  };
}

function action(overrides: Partial<ModerationAction>): ModerationAction {
  return {
    id: "action",
    kind: "block_event",
    value: "a".repeat(64),
    reason: "spam",
    createdAt: 1,
    moderator: "test",
    ...overrides,
  };
}

describe("moderation filters", () => {
  it("filters blocked events", () => {
    const blocked = event({ id: "d".repeat(64) });
    const visible = event({ id: "e".repeat(64) });
    const manifest = manifestFromActions([
      action({ kind: "block_event", value: blocked.id }),
    ]);

    expect(filterModeratedEvents([blocked, visible], manifest)).toEqual([visible]);
  });

  it("filters replies to blocked thread roots", () => {
    const rootId = "f".repeat(64);
    const reply = event({
      id: "1".repeat(64),
      tags: [["e", rootId]],
    });
    const manifest = manifestFromActions([
      action({ kind: "block_thread", value: rootId }),
    ]);

    expect(filterModeratedEvents([reply], manifest)).toEqual([]);
  });

  it("filters media URLs and linked domains", () => {
    const media = event({
      id: "2".repeat(64),
      content: "https://example.com/bad.png",
    });
    const link = event({
      id: "3".repeat(64),
      content: "https://spam.example/path",
    });
    const manifest = manifestFromActions([
      action({
        kind: "block_media_url",
        value: "https://example.com/bad.png",
      }),
      action({ kind: "block_domain", value: "spam.example" }),
    ]);

    expect(filterModeratedEvents([media, link], manifest)).toEqual([]);
  });

  it("filters duplicate text by content fingerprint", () => {
    const original = event({ id: "4".repeat(64), content: "Same spam text" });
    const duplicate = event({
      id: "5".repeat(64),
      content: "same   spam text https://example.com",
    });
    const manifest = manifestFromActions([
      action({
        kind: "block_content_fingerprint",
        value: contentFingerprint(original.content),
      }),
    ]);

    expect(filterModeratedEvents([duplicate], manifest)).toEqual([]);
  });
});
