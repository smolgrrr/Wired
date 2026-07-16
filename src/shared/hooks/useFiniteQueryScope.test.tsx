// @vitest-environment jsdom

import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFiniteQueryScope } from "./useFiniteQueryScope";

const mocks = vi.hoisted(() => ({
  startFiniteQuery: vi.fn(),
}));

vi.mock("../../nostr/client", () => ({
  startFiniteQuery: mocks.startFiniteQuery,
}));

describe("useFiniteQueryScope", () => {
  afterEach(() => {
    mocks.startFiniteQuery.mockReset();
    document.body.innerHTML = "";
  });

  it("closes route-owned finite work on an actual navigation", async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    const close = vi.fn();
    mocks.startFiniteQuery.mockReturnValue({
      close,
      done: new Promise(() => {}),
    });

    function ThreadRoute() {
      const startQuery = useFiniteQueryScope();
      useEffect(() => {
        startQuery({
          workflowOwner: "wired.browser.thread",
          filters: [{ kinds: [1] }],
          coverage: { configuredRelayUrls: ["wss://relay.example"] },
          completionDeadlineMs: 1_000,
          onEvent: vi.fn(),
        });
      }, [startQuery]);
      return <Link to="/feed">Feed</Link>;
    }

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/thread/1"]}>
          <Routes>
            <Route path="/thread/:id" element={<ThreadRoute />} />
            <Route path="/feed" element={<div>Feed route</div>} />
          </Routes>
        </MemoryRouter>,
      );
    });
    expect(mocks.startFiniteQuery).toHaveBeenCalledOnce();

    await act(async () => {
      container.querySelector("a")?.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        button: 0,
        cancelable: true,
      }));
    });

    expect(container.textContent).toBe("Feed route");
    expect(close).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });
});
