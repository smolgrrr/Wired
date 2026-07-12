// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShareControl } from "./ShareControl";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("ShareControl", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function renderControl() {
    act(() => {
      root.render(<ShareControl eventId={"1".repeat(64)} excerpt="a signal" />);
    });
    return container.querySelector("button") as HTMLButtonElement;
  }

  it("uses the native share sheet with a canonical thread URL", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });
    const button = renderControl();

    await act(async () => button.click());

    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Wired signal",
        text: "a signal",
        url: expect.stringMatching(/^http:\/\/localhost:\d*\/thread\/nevent1/),
      }),
    );
  });

  it("copies the URL when native sharing is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const button = renderControl();

    await act(async () => button.click());

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/thread/nevent1"));
    expect(button.textContent).toContain("copied");
  });

  it("does nothing when the native share sheet is cancelled", async () => {
    const writeText = vi.fn();
    const share = vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"));
    vi.stubGlobal("navigator", { share, clipboard: { writeText } });
    const button = renderControl();

    await act(async () => button.click());

    expect(writeText).not.toHaveBeenCalled();
    expect(button.textContent).toContain("share");
  });

  it("copies after a non-cancellation share failure", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const share = vi.fn().mockRejectedValue(new Error("not available"));
    vi.stubGlobal("navigator", { share, clipboard: { writeText } });
    const button = renderControl();

    await act(async () => button.click());

    expect(writeText).toHaveBeenCalledOnce();
    expect(button.textContent).toContain("copied");
  });
});
