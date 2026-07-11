// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Header } from "./Header";

type ReactActGlobal = typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

function LocationProbe() {
  const { pathname } = useLocation();
  return <span data-testid="pathname">{pathname}</span>;
}

describe("Header", () => {
  let container: HTMLDivElement;
  let root: Root;

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
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("takes users back to the main feed when signal path is clicked", () => {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={["/thread/abc"]}>
          <Header />
          <LocationProbe />
        </MemoryRouter>,
      );
    });

    const homeLink = container.querySelector<HTMLAnchorElement>(
      "a[aria-label='go to main feed']",
    );
    expect(homeLink?.getAttribute("href")).toBe("/");
    expect(container.querySelector("[data-testid='pathname']")?.textContent).toBe("/thread/abc");

    act(() => {
      homeLink?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
      );
    });

    expect(container.querySelector("[data-testid='pathname']")?.textContent).toBe("/");
  });
});
