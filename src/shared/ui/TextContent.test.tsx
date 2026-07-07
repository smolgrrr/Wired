// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Event } from "nostr-tools";
import { TextContent } from "./TextContent";

const mocks = vi.hoisted(() => ({
  useQuotedEvents: vi.fn(),
  useProfile: vi.fn(),
}));

vi.mock("../hooks/useQuotedEvents", () => ({
  useQuotedEvents: mocks.useQuotedEvents,
}));

vi.mock("../hooks/useProfiles", () => ({
  useProfile: mocks.useProfile,
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

describe("TextContent", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.useProfile.mockReturnValue(null);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it("renders post media above quoted notes", () => {
    const quotedEvent = event({
      id: "2".repeat(64),
      pubkey: "c".repeat(64),
      content: "quoted body",
    });

    mocks.useQuotedEvents.mockReturnValue({
      quotedEvents: [quotedEvent],
      pendingRefs: [],
      failedRefs: [],
    });

    act(() => {
      root.render(
        <TextContent
          eventdata={event({
            content: "main body https://example.com/main.jpg nostr:note1quoted",
          })}
        />,
      );
    });

    const attachment = container.querySelector('[aria-label="attachment"]');
    const quote = container.querySelector('[aria-label="quoted note"]');

    expect(attachment).not.toBeNull();
    expect(quote).not.toBeNull();
    expect(
      attachment?.compareDocumentPosition(quote as Node),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("renders post media above quote placeholders", () => {
    mocks.useQuotedEvents.mockReturnValue({
      quotedEvents: [],
      pendingRefs: [{ id: "3".repeat(64), relays: [] }],
      failedRefs: [],
    });

    act(() => {
      root.render(
        <TextContent
          eventdata={event({
            content: "main body https://example.com/main.jpg nostr:note1pending",
          })}
        />,
      );
    });

    const attachment = container.querySelector('[aria-label="attachment"]');
    const placeholder = container.querySelector('[aria-label="quoted note"]');

    expect(attachment).not.toBeNull();
    expect(placeholder).not.toBeNull();
    expect(
      attachment?.compareDocumentPosition(placeholder as Node),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
