// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaAttachment, NoteMedia } from "./NoteMedia";

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("NoteMedia video previews", () => {
  let container: HTMLDivElement;
  let root: Root;
  let intersectionCallback: IntersectionObserverCallback = () => undefined;
  let loadMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    loadMock = vi.fn();
    Object.defineProperty(HTMLMediaElement.prototype, "load", {
      configurable: true,
      value: loadMock,
    });
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          intersectionCallback = callback;
        }

        observe = vi.fn();
        disconnect = vi.fn();
        unobserve = vi.fn();
        takeRecords = vi.fn(() => []);
      },
    );
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it("primes a first frame for bare video URLs when they approach the viewport", () => {
    act(() => {
      root.render(
        <NoteMedia
          items={[
            {
              url: "https://example.com/bare.mp4",
              type: "video",
              width: 640,
              height: 360,
            },
          ]}
        />,
      );
    });

    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video?.getAttribute("src")).toBe("https://example.com/bare.mp4");
    expect(video?.getAttribute("preload")).toBe("metadata");
    expect(video?.hasAttribute("controls")).toBe(true);
    expect(video?.getAttribute("poster")).toBeNull();
    expect(video?.parentElement?.style.aspectRatio).toBe("640 / 360");
    expect(container.textContent).toContain("video preview");
    expect(loadMock).not.toHaveBeenCalled();

    Object.defineProperty(video, "duration", {
      configurable: true,
      value: 12,
    });

    act(() => {
      intersectionCallback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    expect(video?.getAttribute("preload")).toBe("auto");
    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(video?.currentTime).toBe(0.001);

    act(() => {
      video?.dispatchEvent(new Event("loadeddata", { bubbles: true }));
    });

    expect(container.textContent).not.toContain("video preview");
  });

  it("primes priority video previews immediately", () => {
    act(() => {
      root.render(
        <MediaAttachment
          priority
          item={{
            url: "https://example.com/top-feed.mp4",
            type: "video",
          }}
        />,
      );
    });

    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video?.getAttribute("preload")).toBe("auto");
    expect(loadMock).toHaveBeenCalledTimes(1);
  });

  it("preserves imeta posters without seeking for a preview frame", () => {
    act(() => {
      root.render(
        <NoteMedia
          items={[
            {
              url: "https://example.com/clip.mp4",
              type: "video",
              posterUrl: "https://example.com/poster.jpg",
            },
          ]}
        />,
      );
    });

    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video?.getAttribute("poster")).toBe("https://example.com/poster.jpg");
    expect(video?.getAttribute("preload")).toBe("metadata");
    expect(container.textContent).not.toContain("video preview");
    expect(loadMock).not.toHaveBeenCalled();

    Object.defineProperty(video, "duration", {
      configurable: true,
      value: 12,
    });

    act(() => {
      video?.dispatchEvent(new Event("loadedmetadata", { bubbles: true }));
    });

    expect(video?.currentTime).toBe(0);
  });

  it("keeps the media fallback on video errors", () => {
    act(() => {
      root.render(
        <NoteMedia
          items={[
            {
              url: "https://example.com/broken.webm",
              type: "video",
            },
          ]}
        />,
      );
    });

    const video = container.querySelector("video");

    act(() => {
      video?.dispatchEvent(new Event("error", { bubbles: true }));
    });

    expect(container.querySelector("video")).toBeNull();
    expect(container.textContent).toContain("signal lost");
  });
});
