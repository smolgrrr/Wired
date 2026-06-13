import { describe, expect, it } from "vitest";
import { Event } from "nostr-tools";
import { parseContent } from "./content";

describe("parseContent", () => {
  it("preserves plain text, URLs, and emoji tokens", () => {
    const content = "hello https://example.com/image.jpg :custom_emoji:";
    const event = { content } as Event;

    expect(parseContent(event)).toEqual({ comment: content });
  });

  it("strips nostr bech32 identifiers from displayed content", () => {
    const content =
      "Wem nützt diese Näherung mehr?\nnostr:nevent1qqsyfzfk3zkvvmuyqd8hzu9008efyn4n53ucvx2353wknnltte0d33spz4mhxue69uhkummnw3ezuerpw3sju6rpw4esygy86n6j2pxy0rmwdj062z5y7mjngl2pyrz334pptd2jwjkh8slxwu6szplm";
    const event = { content } as Event;

    expect(parseContent(event)).toEqual({
      comment: "Wem nützt diese Näherung mehr?",
    });
  });

  it("strips inline nostr note references", () => {
    const content = "see nostr:note1qqqqqqqqqqqqqqqq for context";
    const event = { content } as Event;

    expect(parseContent(event)).toEqual({ comment: "see for context" });
  });
});