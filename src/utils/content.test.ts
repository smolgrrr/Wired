import { describe, expect, it } from "vitest";
import { Event } from "nostr-tools";
import { parseContent } from "./content";

describe("parseContent", () => {
  it("strips media URLs from comment and returns media items", () => {
    const content = "hello https://example.com/image.jpg :custom_emoji:";
    const event = { content } as Event;

    expect(parseContent(event)).toEqual({
      comment: "hello :custom_emoji:",
      media: [{ url: "https://example.com/image.jpg", type: "image" }],
      links: [],
      attachments: [
        { kind: "media", item: { url: "https://example.com/image.jpg", type: "image" } },
      ],
    });
  });

  it("strips non-media URLs into links and attachments", () => {
    const content = "visit https://example.com/page";
    const event = { content } as Event;

    expect(parseContent(event)).toEqual({
      comment: "visit",
      media: [],
      links: [{ url: "https://example.com/page" }],
      attachments: [
        { kind: "link", item: { url: "https://example.com/page" } },
      ],
    });
  });

  it("strips nostr bech32 identifiers from displayed content", () => {
    const content =
      "Wem nützt diese Näherung mehr?\nnostr:nevent1qqsyfzfk3zkvvmuyqd8hzu9008efyn4n53ucvx2353wknnltte0d33spz4mhxue69uhkummnw3ezuerpw3sju6rpw4esygy86n6j2pxy0rmwdj062z5y7mjngl2pyrz334pptd2jwjkh8slxwu6szplm";
    const event = { content } as Event;

    expect(parseContent(event)).toEqual({
      comment: "Wem nützt diese Näherung mehr?",
      media: [],
      links: [],
      attachments: [],
    });
  });

  it("strips inline nostr note references", () => {
    const content = "see nostr:note1qqqqqqqqqqqqqqqq for context";
    const event = { content } as Event;

    expect(parseContent(event)).toEqual({
      comment: "see for context",
      media: [],
      links: [],
      attachments: [],
    });
  });

  it("extracts multiple media items and strips all from comment", () => {
    const content =
      "shots https://example.com/1.jpg https://example.com/2.mp4 end";
    const event = { content } as Event;

    expect(parseContent(event)).toEqual({
      comment: "shots end",
      media: [
        { url: "https://example.com/1.jpg", type: "image" },
        { url: "https://example.com/2.mp4", type: "video" },
      ],
      links: [],
      attachments: [
        { kind: "media", item: { url: "https://example.com/1.jpg", type: "image" } },
        { kind: "media", item: { url: "https://example.com/2.mp4", type: "video" } },
      ],
    });
  });

  it("interleaves media and link attachments in source order", () => {
    const content =
      "read https://example.com/article then https://example.com/shot.jpg";
    const event = { content } as Event;

    expect(parseContent(event)).toEqual({
      comment: "read then",
      media: [{ url: "https://example.com/shot.jpg", type: "image" }],
      links: [{ url: "https://example.com/article" }],
      attachments: [
        { kind: "link", item: { url: "https://example.com/article" } },
        { kind: "media", item: { url: "https://example.com/shot.jpg", type: "image" } },
      ],
    });
  });

  it("combines imeta tags with bare URLs", () => {
    const event = {
      content: "extra https://example.com/extra.webm",
      tags: [["imeta", "url https://example.com/tag.png", "m image/png"]],
    } as Event;

    expect(parseContent(event)).toEqual({
      comment: "extra",
      media: [
        {
          url: "https://example.com/tag.png",
          type: "image",
          mime: "image/png",
        },
        { url: "https://example.com/extra.webm", type: "video" },
      ],
      links: [],
      attachments: [
        {
          kind: "media",
          item: {
            url: "https://example.com/tag.png",
            type: "image",
            mime: "image/png",
          },
        },
        { kind: "media", item: { url: "https://example.com/extra.webm", type: "video" } },
      ],
    });
  });
});