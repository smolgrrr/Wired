// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CustomEmojiPicker,
  emojiFailureKey,
} from "./CustomEmojiPicker";
import type { CustomEmoji } from "./customEmojiCatalog";

const TEST_EMOJIS: CustomEmoji[] = [
  {
    shortcode: "00",
    previewUrl: "https://poa.st/emoji/custom/00.png",
    url: "https://poa.st/emoji/custom/00.png",
  },
  {
    shortcode: "broken",
    previewUrl: "https://poa.st/emoji/custom/broken.png",
    url: "https://poa.st/emoji/custom/broken.png",
  },
];

vi.mock("./customEmojiCatalog", () => ({
  EMOJI_GROUPS: [{ label: "0-9", matches: (shortcode: string) => /^[0-9]/.test(shortcode) }],
  filterCustomEmojis: (emojis: CustomEmoji[]) => emojis,
  getCustomEmojiCatalogState: () => ({
    status: "ready" as const,
    emojis: TEST_EMOJIS,
  }),
  loadCustomEmojiCatalog: vi.fn(() => Promise.resolve(TEST_EMOJIS)),
  subscribeCustomEmojiCatalog: () => () => undefined,
}));

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("CustomEmojiPicker", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    window.localStorage.clear();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    window.localStorage.clear();
  });

  it("loads direct poa.st preview urls instead of the duckduckgo proxy", () => {
    act(() => {
      root.render(<CustomEmojiPicker onSelect={() => undefined} />);
    });

    act(() => {
      container.querySelector("button[aria-label='open custom emoji picker']")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    const image = container.querySelector("img");
    expect(image?.getAttribute("src")).toBe("https://poa.st/emoji/custom/00.png");
    expect(image?.getAttribute("src")).not.toContain("duckduckgo.com");
  });

  it("hides emojis that fail to render and persists the failure key", () => {
    act(() => {
      root.render(<CustomEmojiPicker onSelect={() => undefined} />);
    });

    act(() => {
      container.querySelector("button[aria-label='open custom emoji picker']")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    const images = [...container.querySelectorAll("img")];
    expect(images).toHaveLength(2);

    act(() => {
      images
        .find((image) => image.getAttribute("src")?.includes("broken.png"))
        ?.dispatchEvent(new Event("error", { bubbles: true }));
    });

    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(
      window.localStorage.getItem("wired.failedCustomEmojis"),
    ).toContain(emojiFailureKey(TEST_EMOJIS[1]));
  });
});