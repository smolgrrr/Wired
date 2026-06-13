import { describe, expect, it } from "vitest";
import { Event } from "nostr-tools";
import { parseContent } from "./content";

describe("parseContent", () => {
  it("preserves URLs, media references, Nostr identifiers, and emoji tokens as text", () => {
    const content = "https://example.com/image.jpg nostr:note1example :custom_emoji:";
    const event = { content } as Event;

    expect(parseContent(event)).toEqual({ comment: content });
  });
});
