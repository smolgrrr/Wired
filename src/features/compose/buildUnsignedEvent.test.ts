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
});
