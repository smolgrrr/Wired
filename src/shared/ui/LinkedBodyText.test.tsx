// @vitest-environment jsdom

import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LinkedBodyText } from "./LinkedBodyText";

describe("LinkedBodyText", () => {
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

  it("renders preserved body URLs as clickable hyperlinks", () => {
    act(() => {
      root.render(
        <LinkedBodyText className="body">
          {"read https://example.com/article now"}
        </LinkedBodyText>,
      );
    });

    const link = container.querySelector("a");
    expect(link?.textContent).toBe("https://example.com/article");
    expect(link?.getAttribute("href")).toBe("https://example.com/article");
    expect(container.textContent).toBe("read https://example.com/article now");
  });
});
