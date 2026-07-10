// @vitest-environment jsdom

import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { nip19 } from "nostr-tools";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LinkedBodyText } from "./LinkedBodyText";

const mocks = vi.hoisted(() => ({
  useProfile: vi.fn(),
}));

vi.mock("../hooks/useProfiles", () => ({
  useProfile: mocks.useProfile,
}));

const PROFILE_PUBKEY = "82341f2e7e4b7ef002c65dde7dc0a22e7745af86f1b0638c1e1edf6b46e6e6a2";

describe("LinkedBodyText", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.useProfile.mockReturnValue(undefined);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it("renders preserved body URLs as clickable hyperlinks", () => {
    act(() => {
      root.render(
        <LinkedBodyText className="body">
          {"read https://example.com/article now"}
        </LinkedBodyText>,
      );
    });

    const link = container.querySelector("a");
    expect(link?.textContent).toBe("https://example.com/article");
    expect(link?.getAttribute("href")).toBe("https://example.com/article");
    expect(container.textContent).toBe("read https://example.com/article now");
  });

  it("renders Nostr custom emoji tags inline", () => {
    act(() => {
      root.render(
        <LinkedBodyText
          className="body"
          emojis={[{ shortcode: "lain", url: "https://example.com/lain.png" }]}
        >
          {"test :lain:"}
        </LinkedBodyText>,
      );
    });

    const emoji = container.querySelector("img");
    expect(emoji?.getAttribute("src")).toBe("https://example.com/lain.png");
    expect(emoji?.getAttribute("alt")).toBe(":lain:");
  });

  it("keeps unknown custom emoji shortcodes as text", () => {
    act(() => {
      root.render(<LinkedBodyText className="body">{"test :missing:"}</LinkedBodyText>);
    });

    expect(container.textContent).toBe("test :missing:");
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders multiple Nostr custom emoji tags in one body", () => {
    act(() => {
      root.render(
        <LinkedBodyText
          className="body"
          emojis={[
            { shortcode: "lain", url: "https://example.com/lain.png" },
            { shortcode: "lain_happy", url: "https://example.com/lain_happy.png" },
          ]}
        >
          {"test :lain: and :lain_happy:"}
        </LinkedBodyText>,
      );
    });

    const emojis = Array.from(container.querySelectorAll("[data-custom-emoji]"));
    expect(emojis.map((emoji) => emoji.getAttribute("data-custom-emoji"))).toEqual([
      "lain",
      "lain_happy",
    ]);
  });

  it("renders Nostr profile references as inline mentions", () => {
    const nprofile = nip19.nprofileEncode({ pubkey: PROFILE_PUBKEY });
    mocks.useProfile.mockReturnValue({ name: "jack" });

    act(() => {
      root.render(
        <LinkedBodyText className="body">
          {`hello nostr:${nprofile}`}
        </LinkedBodyText>,
      );
    });

    const link = container.querySelector("a");
    expect(link?.textContent).toBe("@jack");
    expect(link?.getAttribute("href")).toBe(`nostr:${nprofile}`);
    expect(container.textContent).toBe("hello @jack");
  });
});
