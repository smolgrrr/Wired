// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LinkPreview } from "./LinkPreview";

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("LinkPreview layout", () => {
  let container: HTMLDivElement;
  let root: Root;
  let intersectionCallback: IntersectionObserverCallback = () => undefined;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.stubGlobal("fetch", vi.fn());

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

  it("uses a stable shell with an image slot before metadata resolves", () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => undefined));

    act(() => {
      root.render(<LinkPreview url="https://example.com/article-pending" />);
    });

    const idleShell = container.querySelector("a");
    expect(idleShell?.className).toContain("overflow-hidden");
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();

    act(() => {
      intersectionCallback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    const loadingShell = container.querySelector("a");
    expect(loadingShell).not.toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("resolving link");
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(loadingShell?.querySelector(".min-h-\\[4\\.5rem\\]")).not.toBeNull();
  });

  it("fills the reserved shell when metadata arrives", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          title: "Example headline",
          description: "Short summary",
          domain: "example.com",
          image: "https://example.com/og.png",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    act(() => {
      root.render(<LinkPreview url="https://example.com/article-ready" />);
    });

    await act(async () => {
      intersectionCallback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Example headline");
    expect(container.textContent).toContain("Short summary");
    expect(container.querySelector('img[src="https://example.com/og.png"]')).not.toBeNull();
    expect(container.querySelector("a")?.className).toContain("overflow-hidden");
  });
});