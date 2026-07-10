import { describe, expect, it } from "vitest";
import { Event, nip19 } from "nostr-tools";
import { parseContent } from "./content";

const PROFILE_PUBKEY = "82341f2e7e4b7ef002c65dde7dc0a22e7745af86f1b0638c1e1edf6b46e6e6a2";

describe("parseContent", () => {
  it("strips media URLs from comment and returns media items", () => {
    const content = "hello https://example.com/image.jpg :custom_emoji:";
    const event = { content } as Event;

    expect(parseContent(event)).toEqual({
      comment: "hello :custom_emoji:",
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
      attachments: [
        { kind: "link", item: { url: "https://example.com/page" } },
      ],
    });
  });

  it("strips original URL tokens after normalization changes the URL", () => {
    const content = "visit https://example.com then stay";
    const event = { content } as Event;

    expect(parseContent(event)).toEqual({
      comment: "visit then stay",
      attachments: [
        { kind: "link", item: { url: "https://example.com/" } },
      ],
    });
  });

  it("strips nostr event identifiers from displayed content", () => {
    const content =
      "Wem nützt diese Näherung mehr?\nnostr:nevent1qqsyfzfk3zkvvmuyqd8hzu9008efyn4n53ucvx2353wknnltte0d33spz4mhxue69uhkummnw3ezuerpw3sju6rpw4esygy86n6j2pxy0rmwdj062z5y7mjngl2pyrz334pptd2jwjkh8slxwu6szplm";
    const event = { content } as Event;

    expect(parseContent(event)).toEqual({
      comment: "Wem nützt diese Näherung mehr?",
      attachments: [],
    });
  });

  it("preserves nostr profile identifiers for inline rendering", () => {
    const nprofile = nip19.nprofileEncode({ pubkey: PROFILE_PUBKEY });
    const content = `hello nostr:${nprofile} today`;
    const event = { content } as Event;

    expect(parseContent(event)).toEqual({
      comment: content,
      attachments: [],
    });
  });

  it("strips inline nostr note references", () => {
    const content = "see nostr:note1qqqqqqqqqqqqqqqq for context";
    const event = { content } as Event;

    expect(parseContent(event)).toEqual({
      comment: "see for context",
      attachments: [],
    });
  });

  it("extracts multiple media items and strips all from comment", () => {
    const content =
      "shots https://example.com/1.jpg https://example.com/2.mp4 end";
    const event = { content } as Event;

    expect(parseContent(event)).toEqual({
      comment: "shots end",
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
      attachments: [
        { kind: "link", item: { url: "https://example.com/article" } },
        { kind: "media", item: { url: "https://example.com/shot.jpg", type: "image" } },
      ],
    });
  });

  it("orders mixed links, bare media, and imeta media by source token", () => {
    const event = {
      content:
        "one https://example.com/a two https://example.com/tag.png three https://example.com/b four https://example.com/clip.mp4",
      tags: [
        [
          "imeta",
          "url https://example.com/tag.png",
          "m image/png",
          "dim 640x480",
        ],
      ],
    } as Event;

    expect(parseContent(event)).toEqual({
      comment: "one two three four",
      attachments: [
        { kind: "link", item: { url: "https://example.com/a" } },
        {
          kind: "media",
          item: {
            url: "https://example.com/tag.png",
            type: "image",
            mime: "image/png",
            width: 640,
            height: 480,
          },
        },
        { kind: "link", item: { url: "https://example.com/b" } },
        {
          kind: "media",
          item: { url: "https://example.com/clip.mp4", type: "video" },
        },
      ],
    });
  });

  it("keeps imeta media and link attachments when both exist", () => {
    const event = {
      content: "read https://example.com/article",
      tags: [["imeta", "url https://example.com/tag.png", "m image/png"]],
    } as Event;

    expect(parseContent(event)).toEqual({
      comment: "read",
      attachments: [
        { kind: "link", item: { url: "https://example.com/article" } },
        {
          kind: "media",
          item: {
            url: "https://example.com/tag.png",
            type: "image",
            mime: "image/png",
          },
        },
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
      attachments: [
        { kind: "media", item: { url: "https://example.com/extra.webm", type: "video" } },
        {
          kind: "media",
          item: {
            url: "https://example.com/tag.png",
            type: "image",
            mime: "image/png",
          },
        },
      ],
    });
  });
});
