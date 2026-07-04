import { describe, expect, it } from "vitest";
import { filterCustomEmojis, loadCustomEmojiCatalog } from "./customEmojiCatalog";

describe("customEmojiCatalog", () => {
  it("loads the generated catalog", () => {
    return loadCustomEmojiCatalog().then((emojis) => {
      expect(emojis.length).toBeGreaterThan(8000);
      expect(emojis[0]).toEqual(
        expect.objectContaining({
          shortcode: expect.any(String),
          previewUrl: expect.stringMatching(/^https:\/\//),
          url: expect.stringMatching(/^https:\/\//),
        }),
      );
    });
  });

  it("filters by group and shortcode", () => {
    return loadCustomEmojiCatalog().then((emojis) => {
      expect(filterCustomEmojis(emojis, "", 0).every((emoji) => /^[0-9]/.test(emoji.shortcode))).toBe(true);
      expect(filterCustomEmojis(emojis, "cats", 0).some((emoji) => emoji.shortcode.includes("cat"))).toBe(true);
    });
  });
});
