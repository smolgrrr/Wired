import { describe, expect, it } from "vitest";
import { getEmojiDisplayUrls, getEmojiPickerDisplayUrls } from "./customEmoji";

describe("customEmoji display urls", () => {
  it("prefers the duckduckgo proxy for inline post rendering", () => {
    const url = "https://poa.st/emoji/custom/00.png";

    expect(getEmojiDisplayUrls(url)).toEqual([
      "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fpoa.st%2Femoji%2Fcustom%2F00.png",
      url,
    ]);
  });

  it("uses direct catalog urls in the picker", () => {
    const previewUrl = "https://poa.st/emoji/custom/00.png";
    const url = "https://poa.st/emoji/custom/00.png";

    expect(getEmojiPickerDisplayUrls(previewUrl, url)).toEqual([previewUrl]);
  });

  it("dedupes distinct preview and canonical urls in the picker", () => {
    expect(
      getEmojiPickerDisplayUrls(
        "https://example.com/preview.png",
        "https://example.com/full.png",
      ),
    ).toEqual(["https://example.com/preview.png", "https://example.com/full.png"]);
  });
});