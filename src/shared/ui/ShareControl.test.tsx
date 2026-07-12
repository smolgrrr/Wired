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
    return container.querySelector<HTMLButtonElement>("button[aria-label='Share this thread']")!;
  }

  function openMenu() {
    const trigger = renderControl();
    act(() => trigger.click());
    return trigger;
  }

  it("bundles preferred platforms beneath one share button", () => {
    const trigger = renderControl();
    expect(container.querySelector("[role='menu']")).toBeNull();

    act(() => trigger.click());

    const menu = container.querySelector("[role='menu']");
    expect(menu).not.toBeNull();
    expect(menu?.textContent).toContain("Share to X");
    expect(menu?.textContent).toContain("Share to Discord");
    expect(menu?.textContent).toContain("Share to Instagram");
    expect(menu?.textContent).toContain("Copy link");
    expect(menu?.textContent).toContain("More options");
  });

  it("builds an X intent with the canonical thread URL", () => {
    openMenu();

    const xLink = container.querySelector<HTMLAnchorElement>("a[href^='https://x.com/intent/post']");
    expect(xLink).not.toBeNull();
    expect(decodeURIComponent(xLink?.href ?? "")).toContain("/thread/nevent1");
  });

  it("copies the canonical URL for platforms without a web composer", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    openMenu();
    const discordButton = [...container.querySelectorAll<HTMLButtonElement>("[role='menuitem']")]
      .find((button) => button.textContent?.includes("Discord"));

    await act(async () => discordButton?.click());

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/thread/nevent1"));
    expect(container.textContent).toContain("link copied for Discord");
  });

  it("opens the native share sheet from More options", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });
    openMenu();
    const moreButton = [...container.querySelectorAll<HTMLButtonElement>("[role='menuitem']")]
      .find((button) => button.textContent?.includes("More options"));

    await act(async () => moreButton?.click());

    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Wired signal",
        text: "a signal",
        url: expect.stringMatching(/^http:\/\/localhost:\d*\/thread\/nevent1/),
      }),
    );
    expect(container.querySelector("[role='menu']")).toBeNull();
  });

  it("copies from More options when native sharing is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    openMenu();
    const moreButton = [...container.querySelectorAll<HTMLButtonElement>("[role='menuitem']")]
      .find((button) => button.textContent?.includes("More options"));

    await act(async () => moreButton?.click());

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/thread/nevent1"));
    expect(container.textContent).toContain("link copied");
  });

  it("closes on Escape and returns focus to the trigger", () => {
    const trigger = openMenu();

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(container.querySelector("[role='menu']")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
