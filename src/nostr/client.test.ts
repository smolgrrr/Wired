import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  ensureConnected: vi.fn(),
  startFiniteQuery: vi.fn(),
}));

vi.mock("./relay-pool", () => ({
  RelayPool: vi.fn().mockImplementation(() => ({
    connect: mocks.connect,
    ensureConnected: mocks.ensureConnected,
    startFiniteQuery: mocks.startFiniteQuery,
  })),
}));

describe("nostr client", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.connect.mockReset();
    mocks.ensureConnected.mockReset();
    mocks.startFiniteQuery.mockReset();
  });

  it("connects requested relays without waiting for global relay init", async () => {
    const { ensureRelaysConnected } = await import("./client");
    const relayUrls = ["wss://relay.example"];

    await ensureRelaysConnected(relayUrls);

    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.ensureConnected).toHaveBeenCalledWith(relayUrls);
  });

  it("cancels active finite queries during route subscription cleanup", async () => {
    const result = { reason: "cancelled" as const, targets: [] as [], receivedEvents: 0 };
    let resolveDone!: (value: {
      reason: "cancelled";
      targets: [];
      receivedEvents: number;
    }) => void;
    const close = vi.fn();
    const done = new Promise<typeof result>((resolve) => { resolveDone = resolve; });
    mocks.startFiniteQuery.mockReturnValue({ close, done });
    const { closeAllSubscriptions, startFiniteQuery } = await import("./client");

    startFiniteQuery({
      workflowOwner: "wired.browser.thread",
      filters: [{ kinds: [1] }],
      coverage: { configuredRelayUrls: ["wss://relay.example"] },
      completionDeadlineMs: 1_000,
      onEvent: vi.fn(),
    });
    closeAllSubscriptions();

    expect(close).toHaveBeenCalledOnce();
    resolveDone(result);
    await done;
  });
});
