// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignalAvatar } from "./SignalAvatar";

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("SignalAvatar", () => {
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
    vi.unstubAllEnvs();
  });

  it("renders fixed image dimensions and keeps priority loading for visible avatars", () => {
    vi.stubEnv("DEV", false);

    act(() => {
      root.render(
        <SignalAvatar
          pubkey="abcdef1234567890"
          pictureUrl="https://image.nostr.build/avatar.jpg"
          priority
        />,
      );
    });

    const image = container.querySelector("img");
    expect(image?.getAttribute("src")).toBe(
      "/_vercel/image?url=https%3A%2F%2Fimage.nostr.build%2Favatar.jpg&w=48&q=75",
    );
    expect(image?.getAttribute("width")).toBe("20");
    expect(image?.getAttribute("height")).toBe("20");
    expect(image?.getAttribute("loading")).toBe("eager");
    expect(image?.getAttribute("fetchpriority")).toBe("high");
  });

  it("falls back from an optimized avatar URL to the raw image URL", () => {
    vi.stubEnv("DEV", false);

    act(() => {
      root.render(
        <SignalAvatar
          pubkey="abcdef1234567890"
          pictureUrl="https://image.nostr.build/avatar.jpg"
        />,
      );
    });

    act(() => {
      container.querySelector("img")?.dispatchEvent(new Event("error", { bubbles: true }));
    });

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://image.nostr.build/avatar.jpg",
    );
    expect(container.querySelector("svg")).toBeNull();
  });

  it("uses the grid fallback after one raw avatar error", () => {
    vi.stubEnv("DEV", false);

    act(() => {
      root.render(
        <SignalAvatar
          pubkey="abcdef1234567890"
          pictureUrl="https://unknown.example/avatar.jpg"
        />,
      );
    });

    const image = container.querySelector("img");
    expect(image?.getAttribute("src")).toBe("https://unknown.example/avatar.jpg");

    act(() => {
      image?.dispatchEvent(new Event("error", { bubbles: true }));
    });

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
