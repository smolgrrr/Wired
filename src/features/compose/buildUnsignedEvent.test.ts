import { describe, expect, it } from "vitest";
import { buildUnsignedEvent } from "./buildUnsignedEvent";

describe("buildUnsignedEvent", () => {
  it("adds Nostr custom emoji tags for selected shortcodes still present in the comment", () => {
    const unsigned = buildUnsignedEvent({
      comment: "ship it :wired:",
      customEmojis: [
        { shortcode: "wired", url: "https://example.com/wired.png" },
        { shortcode: "deleted", url: "https://example.com/deleted.png" },
      ],
    });

    expect(unsigned.tags).toContainEqual(["emoji", "wired", "https://example.com/wired.png"]);
    expect(unsigned.tags).not.toContainEqual(["emoji", "deleted", "https://example.com/deleted.png"]);
  });

  it("deduplicates custom emoji tags", () => {
    const unsigned = buildUnsignedEvent({
      comment: ":wired: :wired:",
      customEmojis: [
        { shortcode: "wired", url: "https://example.com/wired.png" },
        { shortcode: "wired", url: "https://example.com/wired.png" },
      ],
    });

    expect(
      unsigned.tags.filter((tag) => tag[0] === "emoji" && tag[1] === "wired"),
    ).toHaveLength(1);
  });

  it("adds uploaded media URLs and imeta tags", () => {
    const unsigned = buildUnsignedEvent({
      comment: "look",
      media: [
        {
          url: "https://cdn.example/image.webp",
          mime: "image/webp",
          sha256: "a".repeat(64),
          size: 1234,
          width: 800,
          height: 600,
          imetaFields: ["blurhash abc", "thumb https://cdn.example/thumb.webp"],
        },
      ],
    });

    expect(unsigned.content).toBe("look\n\nhttps://cdn.example/image.webp");
    expect(unsigned.tags).toContainEqual([
      "imeta",
      "url https://cdn.example/image.webp",
      "m image/webp",
      `x ${"a".repeat(64)}`,
      "size 1234",
      "dim 800x600",
      "blurhash abc",
      "thumb https://cdn.example/thumb.webp",
    ]);
  });

  it("allows media-only notes", () => {
    const unsigned = buildUnsignedEvent({
      comment: "",
      media: [
        {
          url: "https://cdn.example/audio.mp3",
          mime: "audio/mpeg",
          sha256: "b".repeat(64),
          size: 42,
        },
      ],
    });

    expect(unsigned.content).toBe("https://cdn.example/audio.mp3");
  });
});
