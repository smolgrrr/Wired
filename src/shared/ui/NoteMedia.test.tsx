// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaAttachment, MediaGrid, NoteMedia } from "./NoteMedia";
import type { MediaPresentationVerdict } from "../lib/mediaModeration";

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
    expect(video?.getAttribute("width")).toBe("640");
    expect(video?.getAttribute("height")).toBe("360");
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

  it("uses orientation-aware compact classes for quoted landscape images", () => {
    act(() => {
      root.render(
        <MediaAttachment
          compact
          item={{
            url: "https://example.com/comic.jpg",
            type: "image",
            width: 1200,
            height: 400,
          }}
        />,
      );
    });

    const image = container.querySelector("img");
    expect(image?.getAttribute("width")).toBe("1200");
    expect(image?.getAttribute("height")).toBe("400");
    expect(image?.className).toContain("mx-auto");
    expect(image?.className).toContain("max-h-[12rem]");
    expect(image?.className.split(/\s+/)).not.toContain("w-full");
    expect(image?.className).not.toContain("max-h-[120px]");
    expect(image?.style.aspectRatio).toBe("1200 / 400");
  });

  it("uses orientation-aware compact classes for quoted portrait images", () => {
    act(() => {
      root.render(
        <MediaAttachment
          compact
          item={{
            url: "https://example.com/panel.jpg",
            type: "image",
            width: 800,
            height: 1400,
          }}
        />,
      );
    });

    const image = container.querySelector("img");
    expect(image?.getAttribute("width")).toBe("800");
    expect(image?.getAttribute("height")).toBe("1400");
    expect(image?.className).toContain("mx-auto");
    expect(image?.className).toContain("max-w-[min(100%,12rem)]");
    expect(image?.className).toContain("max-h-[16rem]");
    expect(image?.className.split(/\s+/)).not.toContain("w-full");
    expect(image?.style.aspectRatio).toBe("800 / 1400");
  });

  it("sets dimensions on grid images when imeta dimensions are present", () => {
    act(() => {
      root.render(
        <MediaGrid
          items={[
            {
              url: "https://example.com/one.jpg",
              type: "image",
              width: 1600,
              height: 900,
            },
            {
              url: "https://example.com/two.jpg",
              type: "image",
              width: 900,
              height: 1600,
            },
          ]}
        />,
      );
    });

    const images = container.querySelectorAll("img");
    expect(images[0]?.getAttribute("width")).toBe("1600");
    expect(images[0]?.getAttribute("height")).toBe("900");
    expect(images[1]?.getAttribute("width")).toBe("900");
    expect(images[1]?.getAttribute("height")).toBe("1600");
  });

  it("omits image dimensions when imeta dimensions are missing", () => {
    act(() => {
      root.render(
        <MediaAttachment
          item={{
            url: "https://example.com/photo.jpg",
            type: "image",
          }}
        />,
      );
    });

    const image = container.querySelector("img");
    expect(image?.hasAttribute("width")).toBe(false);
    expect(image?.hasAttribute("height")).toBe(false);
  });

  it("uses orientation-aware compact classes for quoted landscape video", () => {
    act(() => {
      root.render(
        <MediaAttachment
          compact
          item={{
            url: "https://example.com/quoted.mp4",
            type: "video",
            width: 640,
            height: 360,
          }}
        />,
      );
    });

    const wrapper = container.querySelector("video")?.parentElement;
    expect(wrapper?.className).toContain("mx-auto");
    expect(wrapper?.className).toContain("max-h-[12rem]");
    expect(wrapper?.className).not.toContain("max-h-[120px]");
    expect(wrapper?.style.aspectRatio).toBe("640 / 360");
  });

  it("constrains portrait video width in full posts", () => {
    act(() => {
      root.render(
        <MediaAttachment
          item={{
            url: "https://example.com/portrait.mp4",
            type: "video",
            width: 720,
            height: 1280,
          }}
        />,
      );
    });

    const wrapper = container.querySelector("video")?.parentElement;
    expect(wrapper?.className).toContain("mx-auto");
    expect(wrapper?.className).toContain("max-w-[min(100%,18rem)]");
    expect(wrapper?.className).toContain("max-h-[min(60vh,32rem)]");
    expect(wrapper?.style.aspectRatio).toBe("720 / 1280");
  });

  it("learns aspect ratio from loaded metadata when imeta dimensions are missing", () => {
    act(() => {
      root.render(
        <MediaAttachment
          item={{
            url: "https://example.com/bare-portrait.mp4",
            type: "video",
          }}
        />,
      );
    });

    const video = container.querySelector("video");
    const wrapper = video?.parentElement;
    expect(wrapper?.style.aspectRatio).toBe("16 / 9");

    Object.defineProperty(video, "videoWidth", {
      configurable: true,
      value: 720,
    });
    Object.defineProperty(video, "videoHeight", {
      configurable: true,
      value: 1280,
    });

    act(() => {
      video?.dispatchEvent(new Event("loadedmetadata", { bubbles: true }));
    });

    expect(wrapper?.style.aspectRatio).toBe("720 / 1280");
    expect(wrapper?.className).toContain("max-w-[min(100%,18rem)]");
    expect(video?.getAttribute("width")).toBe("720");
    expect(video?.getAttribute("height")).toBe("1280");
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

  it("preloads a pending image only behind an opaque moderation cover", () => {
    const verdict: MediaPresentationVerdict = {
      status: "pending",
      reason: "analysis_queued",
      enforced: true,
    };
    act(() => {
      root.render(
        <MediaAttachment
          item={{ url: "https://example.com/pending.jpg", type: "image" }}
          verdict={verdict}
        />,
      );
    });

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://example.com/pending.jpg",
    );
    const cover = container.querySelector("[data-media-cover='true']");
    expect(cover).not.toBeNull();
    expect(cover?.className).toContain("bg-surface");
    expect(container.textContent).toContain("checking media");
  });

  it("lets a user reveal an image when the moderation service is unavailable", () => {
    act(() => {
      root.render(
        <MediaAttachment
          item={{ url: "https://example.com/unavailable.jpg", type: "image" }}
          verdict={{
            status: "unavailable",
            reason: "verdict_api_unavailable",
            enforced: true,
          }}
        />,
      );
    });

    const reveal = container.querySelector<HTMLButtonElement>(
      "[data-media-cover='true']",
    );
    expect(reveal).not.toBeNull();

    act(() => reveal?.click());

    expect(container.querySelector("[data-media-cover='true']")).toBeNull();
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://example.com/unavailable.jpg",
    );
  });

  it("loads and reveals a pending video after the user clears its cover", () => {
    act(() => {
      root.render(
        <MediaAttachment
          item={{ url: "https://example.com/pending.mp4", type: "video" }}
          verdict={{ status: "pending", reason: "analysis_queued", enforced: true }}
        />,
      );
    });

    const reveal = container.querySelector<HTMLButtonElement>(
      "[data-media-cover='true']",
    );
    expect(container.querySelector("video")).toBeNull();

    act(() => reveal?.click());

    expect(container.querySelector("[data-media-cover='true']")).toBeNull();
    expect(container.querySelector("video")?.getAttribute("src")).toBe(
      "https://example.com/pending.mp4",
    );
  });

  it("reveals only the selected image in a moderated image grid", () => {
    const verdict: MediaPresentationVerdict = {
      status: "pending",
      reason: "analysis_queued",
      enforced: true,
    };
    act(() => {
      root.render(
        <MediaGrid
          items={[
            { url: "https://example.com/one.jpg", type: "image" },
            { url: "https://example.com/two.jpg", type: "image" },
          ]}
          verdicts={new Map([
            ["https://example.com/one.jpg", verdict],
            ["https://example.com/two.jpg", verdict],
          ])}
        />,
      );
    });

    const covers = container.querySelectorAll<HTMLButtonElement>(
      "[data-media-cover='true']",
    );
    expect(covers).toHaveLength(2);

    act(() => covers[0]?.click());

    expect(container.querySelectorAll("[data-media-cover='true']")).toHaveLength(1);
  });

  it("does not assign a video source before an allowed verdict", () => {
    act(() => {
      root.render(
        <MediaAttachment
          item={{ url: "https://example.com/pending.mp4", type: "video" }}
          verdict={{ status: "pending", reason: "analysis_queued", enforced: true }}
        />,
      );
    });

    expect(container.querySelector("video")).toBeNull();
    expect(container.innerHTML).not.toContain("https://example.com/pending.mp4");
    expect(container.textContent).toContain("checking media");
  });

  it("reveals media when enforcement is shadow-only", () => {
    act(() => {
      root.render(
        <MediaAttachment
          item={{ url: "https://example.com/shadow.jpg", type: "image" }}
          verdict={{ status: "blocked", reason: "model", enforced: false }}
        />,
      );
    });

    expect(container.querySelector("img")).not.toBeNull();
    expect(container.querySelector("[data-media-cover='true']")).toBeNull();
  });
});
