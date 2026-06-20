// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLinkMetadata } from "./useLinkMetadata";

function Probe({ url, enabled }: { url: string; enabled: boolean }) {
  const state = useLinkMetadata(url, enabled);
  return <span data-status={state.status}>{state.status}</span>;
}

describe("useLinkMetadata", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it("returns idle without fetching when disabled", () => {
    act(() => {
      root.render(<Probe url="https://example.com" enabled={false} />);
    });

    expect(container.querySelector("[data-status]")?.textContent).toBe("idle");
    expect(fetch).not.toHaveBeenCalled();
  });
});