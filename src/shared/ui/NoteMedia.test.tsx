// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NoteMedia } from "./NoteMedia";

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("NoteMedia video previews", () => {
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

  it("requests a first frame for bare video URLs", () => {
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
    expect(video?.getAttribute("preload")).toBe("auto");
    expect(video?.hasAttribute("controls")).toBe(true);
    expect(video?.getAttribute("poster")).toBeNull();
    expect(video?.parentElement?.style.aspectRatio).toBe("640 / 360");
    expect(container.textContent).toContain("video preview");

    Object.defineProperty(video, "duration", {
      configurable: true,
      value: 12,
    });

    act(() => {
      video?.dispatchEvent(new Event("loadedmetadata", { bubbles: true }));
    });

    expect(video?.currentTime).toBe(0.001);

    act(() => {
      video?.dispatchEvent(new Event("loadeddata", { bubbles: true }));
    });

    expect(container.textContent).not.toContain("video preview");
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
