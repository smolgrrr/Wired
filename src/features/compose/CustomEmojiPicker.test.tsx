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

  async function flushFocusHandoff() {
    await act(async () => {
      await new Promise((resolve) => {
        if (typeof window.requestAnimationFrame === "function") {
          window.requestAnimationFrame(() => resolve(undefined));
          return;
        }

        window.setTimeout(resolve, 0);
      });
    });
  }

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

  it("moves focus into the picker and returns it to the trigger on Escape", async () => {
    act(() => {
      root.render(<CustomEmojiPicker onSelect={() => undefined} />);
    });

    const trigger = container.querySelector<HTMLButtonElement>(
      "button[aria-label='open custom emoji picker']",
    );
    trigger?.focus();

    act(() => {
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushFocusHandoff();

    expect(document.activeElement).toBe(container.querySelector("input[type='search']"));
    expect(container.querySelector("[role='dialog']")).not.toBeNull();
    expect(container.querySelector("button[aria-label='close custom emoji picker']")).not.toBeNull();

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(container.querySelector("[role='dialog']")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes when pressing outside the picker", () => {
    act(() => {
      root.render(<CustomEmojiPicker onSelect={() => undefined} />);
    });

    act(() => {
      container.querySelector("button[aria-label='open custom emoji picker']")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(container.querySelector("[role='dialog']")).not.toBeNull();

    act(() => {
      document.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });

    expect(container.querySelector("[role='dialog']")).toBeNull();
  });
});
