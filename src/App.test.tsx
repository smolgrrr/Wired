// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Link, MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ScrollToTop } from "./App";

type ReactActGlobal = typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

function RouteProbe() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Link to="/thread/note1">open thread</Link>} />
        <Route path="/thread/:id" element={<button type="button">thread</button>} />
      </Routes>
    </>
  );
}

function BackProbe() {
  const navigate = useNavigate();

  return (
    <>
      <ScrollToTop />
      <button type="button" onClick={() => navigate(-1)}>
        back
      </button>
    </>
  );
}

describe("ScrollToTop", () => {
  let container: HTMLDivElement;
  let root: Root;
  let scrollTo: ReturnType<typeof vi.fn>;

  beforeAll(() => {
    (globalThis as ReactActGlobal).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    delete (globalThis as ReactActGlobal).IS_REACT_ACT_ENVIRONMENT;
  });

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it("resets scroll when pushing a thread route from the feed", () => {
    act(() => {
      root.render(
        <MemoryRouter
          initialEntries={["/"]}
          future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        >
          <RouteProbe />
        </MemoryRouter>,
      );
    });

    expect(scrollTo).not.toHaveBeenCalled();

    act(() => {
      container
        .querySelector("a")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });
  });

  it("does not reset scroll on browser-style back navigation", () => {
    act(() => {
      root.render(
        <MemoryRouter
          initialEntries={["/", "/thread/note1"]}
          initialIndex={1}
          future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        >
          <BackProbe />
        </MemoryRouter>,
      );
    });

    act(() => {
      container
        .querySelector("button")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(scrollTo).not.toHaveBeenCalled();
  });
});
