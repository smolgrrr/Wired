import { describe, expect, it } from "vitest";
import { Event } from "nostr-tools";
import {
  extractMedia,
  parseBareMediaUrls,
  parseImetaTags,
  stripMediaUrls,
} from "./mediaUtils";

describe("parseImetaTags", () => {
  it("parses url, mime, and dimensions from imeta tags", () => {
    const tags = [
      [
        "imeta",
        "url https://example.com/photo.png",
        "m image/png",
        "dim 800x600",
      ],
    ];

    expect(parseImetaTags(tags)).toEqual([
      {
        url: "https://example.com/photo.png",
        type: "image",
        mime: "image/png",
        width: 800,
        height: 600,
      },
    ]);
  });

  it("parses video and audio imeta tags", () => {
    const tags = [
      ["imeta", "url https://example.com/clip.mp4", "m video/mp4"],
      ["imeta", "url https://example.com/song.mp3", "m audio/mpeg"],
    ];

    expect(parseImetaTags(tags)).toEqual([
      { url: "https://example.com/clip.mp4", type: "video", mime: "video/mp4" },
      { url: "https://example.com/song.mp3", type: "audio", mime: "audio/mpeg" },
    ]);
  });

  it("rejects non-http schemes", () => {
    const tags = [["imeta", "url javascript:alert(1)", "m image/png"]];
    expect(parseImetaTags(tags)).toEqual([]);
  });
});

describe("parseBareMediaUrls", () => {
  it("detects image, video, and audio URLs in content order", () => {
    const content =
      "look https://example.com/a.jpg then https://example.com/b.mp4 and https://example.com/c.mp3";

    expect(parseBareMediaUrls(content)).toEqual([
      { url: "https://example.com/a.jpg", type: "image" },
      { url: "https://example.com/b.mp4", type: "video" },
      { url: "https://example.com/c.mp3", type: "audio" },
    ]);
  });

  it("deduplicates repeated bare URLs", () => {
    const content = "https://example.com/a.png https://example.com/a.png";
    expect(parseBareMediaUrls(content)).toHaveLength(1);
  });
});

describe("extractMedia", () => {
  it("orders imeta before bare content URLs and deduplicates", () => {
    const event = {
      content: "https://example.com/bare.jpg https://example.com/imeta.jpg",
      tags: [["imeta", "url https://example.com/imeta.jpg", "m image/jpeg"]],
    } as Event;

    expect(extractMedia(event)).toEqual([
      {
        url: "https://example.com/imeta.jpg",
        type: "image",
        mime: "image/jpeg",
      },
      { url: "https://example.com/bare.jpg", type: "image" },
    ]);
  });
});

describe("stripMediaUrls", () => {
  it("removes media URLs and cleans whitespace", () => {
    const media = [
      { url: "https://example.com/a.jpg", type: "image" as const },
      { url: "https://example.com/b.mp4", type: "video" as const },
    ];
    const content = "before\n\nhttps://example.com/a.jpg\n\nafter https://example.com/b.mp4";

    expect(stripMediaUrls(content, media)).toBe("before\n\nafter");
  });
});