// @vitest-environment jsdom

import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LinkedBodyText } from "./LinkedBodyText";

describe("LinkedBodyText", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
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
});
