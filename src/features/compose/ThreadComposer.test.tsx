// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Event } from "nostr-tools";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ThreadComposer } from "./ThreadComposer";

vi.mock("./PostForm", () => ({
  PostForm: ({ tagType }: { tagType: string }) => (
    <div data-testid="post-form">{tagType}</div>
  ),
}));

const opEvent: Event = {
  id: "a".repeat(64),
  pubkey: "b".repeat(64),
  created_at: 1,
  kind: 1,
  tags: [],
  content: "thread opener",
  sig: "c".repeat(128),
};

type ReactActGlobal = typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

describe("ThreadComposer", () => {
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

    act(() => {
      root.render(
        <ThreadComposer
          OPEvent={opEvent}
          showAllReplies={false}
          onToggleLowSignal={vi.fn()}
        />,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function clickButton(label: string) {
    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === label,
    );

    act(() => button?.click());
  }

  it("switches directly between reply and quote composers", async () => {
    clickButton("reply");
    await act(async () => {});

    expect(container.querySelector('[data-testid="post-form"]')?.textContent).toBe("Reply");
    expect(container.querySelector('button[aria-pressed="true"]')?.textContent).toBe("reply");

    clickButton("quote");
    await act(async () => {});

    expect(container.querySelector('[data-testid="post-form"]')?.textContent).toBe("Quote");
    expect(container.querySelector('button[aria-pressed="true"]')?.textContent).toBe("quote");
  });

  it("closes the composer when its active action is selected again", async () => {
    clickButton("reply");
    await act(async () => {});
    clickButton("reply");

    expect(container.querySelector('[data-testid="post-form"]')).toBeNull();
    expect(container.querySelector('button[aria-pressed="true"]')).toBeNull();
  });
});
