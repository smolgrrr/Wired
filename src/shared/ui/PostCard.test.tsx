// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Event } from "nostr-tools";
import { PostCard } from "./PostCard";
import { MediaModerationProvider } from "../hooks/useMediaModeration";
import { createMediaModerationClient } from "../lib/mediaModerationClient";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  useProfile: vi.fn(),
  useQuotedEvents: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("../hooks/useProfiles", () => ({
  useProfile: mocks.useProfile,
}));

vi.mock("../hooks/useQuotedEvents", () => ({
  useQuotedEvents: mocks.useQuotedEvents,
}));

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

const event = (overrides: Partial<Event> = {}): Event => ({
  id: "1".repeat(64),
  pubkey: "a".repeat(64),
  created_at: 1,
  kind: 1,
  tags: [],
  content: "hello",
  sig: "b".repeat(128),
  ...overrides,
});

function click(target: Element) {
  target.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
  );
}

describe("PostCard thread opening", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.useProfile.mockReturnValue(null);
    mocks.useQuotedEvents.mockReturnValue({
      quotedEvents: [],
      pendingRefs: [],
      failedRefs: [],
    });
    vi.stubGlobal(
      "IntersectionObserver",
      class {
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
    vi.clearAllMocks();
  });

  it("opens the thread from the card surface", () => {
    const onOpenThread = vi.fn();

    act(() => {
      root.render(
        <PostCard
          event={event()}
          replies={[]}
          totalWork={16}
          onOpenThread={onOpenThread}
        />,
      );
    });

    const card = container.querySelector("article[role='link']");
    expect(card).not.toBeNull();

    act(() => {
      click(card as Element);
    });

    expect(onOpenThread).toHaveBeenCalledTimes(1);
  });

  it("opens the thread with Enter when the card is focused", () => {
    const onOpenThread = vi.fn();

    act(() => {
      root.render(
        <PostCard
          event={event()}
          replies={[]}
          totalWork={16}
          onOpenThread={onOpenThread}
        />,
      );
    });

    const card = container.querySelector("article[role='link']");
    expect(card).not.toBeNull();

    act(() => {
      card?.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Enter",
        }),
      );
    });

    expect(onOpenThread).toHaveBeenCalledTimes(1);
  });

  it("does not open the thread from a nested body link", () => {
    const onOpenThread = vi.fn();

    act(() => {
      root.render(
        <PostCard
          event={event({ content: "read https://example.com/article" })}
          replies={[]}
          totalWork={16}
          onOpenThread={onOpenThread}
        />,
      );
    });

    const link = container.querySelector(".post-content a");
    expect(link).not.toBeNull();

    act(() => {
      click(link as Element);
    });

    expect(onOpenThread).not.toHaveBeenCalled();
  });

  it("does not open the thread from a nested button", () => {
    const onOpenThread = vi.fn();

    act(() => {
      root.render(
        <PostCard
          event={event({ content: "x".repeat(800) })}
          replies={[]}
          totalWork={16}
          onOpenThread={onOpenThread}
        />,
      );
    });

    const continueButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "continue",
    );
    expect(continueButton).not.toBeUndefined();

    act(() => {
      click(continueButton as Element);
    });

    expect(onOpenThread).not.toHaveBeenCalled();
  });

  it("does not open the thread from nested media", () => {
    const onOpenThread = vi.fn();

    act(() => {
      root.render(
        <PostCard
          event={event({ content: "image https://example.com/photo.jpg" })}
          replies={[]}
          totalWork={16}
          onOpenThread={onOpenThread}
        />,
      );
    });

    const image = container.querySelector(".post-content img");
    expect(image).not.toBeNull();

    act(() => {
      click(image as Element);
    });

    expect(onOpenThread).not.toHaveBeenCalled();
  });

  it("shows sharing and Wired identity only on the thread root", () => {
    act(() => {
      root.render(<PostCard event={event()} replies={[]} role="threadOp" totalWork={16} />);
    });

    expect(container.querySelector("button[aria-label='Share this thread']")).not.toBeNull();
    expect(container.textContent).toContain("wiredsignal.online");

    act(() => {
      root.render(<PostCard event={event()} replies={[]} role="feed" totalWork={16} />);
    });

    expect(container.querySelector("button[aria-label='Share this thread']")).toBeNull();
    expect(container.textContent).not.toContain("wiredsignal.online");
  });

  it("hides the entire note when one attachment receives a blocked verdict", async () => {
    const blockedEvent = event({
      content: "photo https://example.com/blocked.jpg",
    });
    const client = createMediaModerationClient({
      baseUrl: "https://admin.example",
      mode: "enforce",
      batchDelayMs: 0,
      fetcher: vi.fn(async (_input, init) => {
        const request = JSON.parse(String(init?.body)) as {
          items: Array<{ requestId: string; url: string }>;
        };
        return new Response(
          JSON.stringify({
            mode: "enforce",
            policyVersion: "wired-media-v1",
            verdicts: request.items.map((item) => ({
              requestId: item.requestId,
              eventId: blockedEvent.id,
              url: item.url,
              mediaType: "image",
              status: "blocked",
              reason: "exact_hash_block",
              expiresAt: Date.now() + 60_000,
            })),
          }),
          { status: 200 },
        );
      }),
    });

    act(() => {
      root.render(
        <MediaModerationProvider client={client}>
          <PostCard event={blockedEvent} replies={[]} totalWork={16} />
        </MediaModerationProvider>,
      );
    });
    expect(container.querySelector("article")).not.toBeNull();
    expect(container.querySelector("img")).not.toBeNull();
    expect(container.querySelector("[data-media-cover='true']")).toBeNull();

    await act(async () => {
      await client.waitForIdle();
    });

    expect(container.querySelector("article")).toBeNull();
    client.close();
  });
});
