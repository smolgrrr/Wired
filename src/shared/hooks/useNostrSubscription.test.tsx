// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Event } from "nostr-tools";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNostrSubscription } from "./useNostrSubscription";

const mocks = vi.hoisted(() => ({
  initNostr: vi.fn(),
}));

vi.mock("../../nostr/client", () => ({
  initNostr: mocks.initNostr,
}));

const event = {
  id: "1".repeat(64),
  pubkey: "2".repeat(64),
  created_at: 1,
  kind: 1,
  tags: [],
  content: "hello",
  sig: "3".repeat(128),
} as Event;

function Probe({ initialize = true }: { initialize?: boolean }) {
  const events = useNostrSubscription(
    (onEvent) => {
      onEvent(event, "wss://relay.example");
      return { id: "sub", close: vi.fn() };
    },
    [],
    true,
    { initialize },
  );

  return <span data-count={events.length}>{events.length}</span>;
}

describe("useNostrSubscription", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.initNostr.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("can start a route-prepared subscription without waiting for global init", async () => {
    mocks.initNostr.mockReturnValue(new Promise(() => {}));

    await act(async () => {
      root.render(<Probe initialize={false} />);
    });

    expect(mocks.initNostr).not.toHaveBeenCalled();
    expect(container.querySelector("[data-count]")?.textContent).toBe("1");
  });
});
