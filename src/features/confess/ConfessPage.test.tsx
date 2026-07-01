// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Event as NostrEvent, UnsignedEvent } from "nostr-tools";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import ConfessPage from "./ConfessPage";
import type { ConfessStatus, ConfessSubmitResponse } from "./api";

type ReactActGlobal = typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const mocks = vi.hoisted(() => ({
  fetchConfessStatus: vi.fn(),
  submitConfession: vi.fn(),
  startWork: vi.fn(),
  powState: {
    messageFromWorker: undefined as (UnsignedEvent & Pick<NostrEvent, "id">) | undefined,
    hashrate: 0,
    bestPow: 0,
  },
}));

vi.mock("nostr-tools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("nostr-tools")>();
  const proofPubkey = "f".repeat(64);
  return {
    ...actual,
    generateSecretKey: vi.fn(() => new Uint8Array(32).fill(1)),
    getPublicKey: vi.fn(() => proofPubkey),
    finalizeEvent: vi.fn((event: UnsignedEvent & Pick<NostrEvent, "id">) => ({
      ...event,
      pubkey: proofPubkey,
      id: event.id,
      sig: "2".repeat(128),
    })),
  };
});

vi.mock("../../shared/hooks/usePowMining", () => ({
  usePowMining: () => ({
    startWork: mocks.startWork,
    messageFromWorker: mocks.powState.messageFromWorker,
    hashrate: mocks.powState.hashrate,
    bestPow: mocks.powState.bestPow,
  }),
}));

vi.mock("../../shared/ui/PostCard", () => ({
  PostCard: () => null,
}));

vi.mock("./api", () => ({
  fetchConfessStatus: mocks.fetchConfessStatus,
  submitConfession: mocks.submitConfession,
}));

const openStatus: ConfessStatus = {
  configured: true,
  day: "2026-06-30",
  count: 0,
  limit: 6,
  remaining: 6,
  minimumPow: 1,
  closed: false,
  nextResetAt: "2026-07-01T00:00:00.000Z",
};

const postedEvent: NostrEvent = {
  id: "1".repeat(64),
  pubkey: "f".repeat(64),
  created_at: 1,
  kind: 1,
  tags: [
    ["client", "wired-confess"],
    ["t", "confess"],
  ],
  content: "test confession",
  sig: "2".repeat(128),
};

const submitResponse: ConfessSubmitResponse = {
  ok: true,
  event: postedEvent,
  acceptedRelays: ["wss://relay.example"],
  count: 1,
  remaining: 5,
  minimumPow: 1,
  nextResetAt: "2026-07-01T00:00:00.000Z",
};

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function updateTextarea(textarea: HTMLTextAreaElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  valueSetter?.call(textarea, value);
  textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
}

describe("ConfessPage", () => {
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
    mocks.fetchConfessStatus.mockReset();
    mocks.submitConfession.mockReset();
    mocks.startWork.mockReset();
    mocks.powState.messageFromWorker = undefined;
    mocks.powState.hashrate = 0;
    mocks.powState.bestPow = 0;
    mocks.fetchConfessStatus.mockResolvedValue(openStatus);
    Object.defineProperty(window.navigator, "hardwareConcurrency", {
      configurable: true,
      value: 1,
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("shows backend submit status after mining instead of relay publishing status", async () => {
    let resolveSubmit: (response: ConfessSubmitResponse) => void = () => {};
    const pendingSubmit = new Promise<ConfessSubmitResponse>((resolve) => {
      resolveSubmit = resolve;
    });
    mocks.submitConfession.mockReturnValue(pendingSubmit);

    await act(async () => {
      root.render(<ConfessPage />);
      await flushPromises();
    });

    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();

    await act(async () => {
      updateTextarea(textarea!, "test confession");
      await flushPromises();
    });

    await act(async () => {
      container
        .querySelector("form")
        ?.dispatchEvent(new globalThis.Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(mocks.startWork).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("computing signal");

    mocks.powState.messageFromWorker = {
      id: postedEvent.id,
      kind: postedEvent.kind,
      pubkey: postedEvent.pubkey,
      created_at: postedEvent.created_at,
      tags: [...postedEvent.tags, ["nonce", "1", "1"]],
      content: postedEvent.content,
    };

    await act(async () => {
      root.render(<ConfessPage />);
      await flushPromises();
    });

    expect(mocks.submitConfession).toHaveBeenCalledTimes(1);
    expect(mocks.submitConfession).toHaveBeenCalledWith({
      id: postedEvent.id,
      kind: postedEvent.kind,
      pubkey: postedEvent.pubkey,
      created_at: postedEvent.created_at,
      tags: [...postedEvent.tags, ["nonce", "1", "1"]],
      content: postedEvent.content,
      sig: postedEvent.sig,
    });
    expect(container.textContent).toContain("submitting to wired backend...");
    expect(container.textContent).not.toContain("publishing to relays");

    await act(async () => {
      resolveSubmit(submitResponse);
      await pendingSubmit;
      await flushPromises();
    });

    expect(container.textContent).toContain("posted to 1 relay");
    expect(container.textContent).not.toContain("submitting to wired backend...");
  });
});
