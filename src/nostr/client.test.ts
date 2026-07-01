import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  ensureConnected: vi.fn(),
}));

vi.mock("./relay-pool", () => ({
  RelayPool: vi.fn().mockImplementation(() => ({
    connect: mocks.connect,
    ensureConnected: mocks.ensureConnected,
  })),
}));

describe("nostr client", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.connect.mockReset();
    mocks.ensureConnected.mockReset();
  });

  it("connects requested relays without waiting for global relay init", async () => {
    const { ensureRelaysConnected } = await import("./client");
    const relayUrls = ["wss://relay.example"];

    await ensureRelaysConnected(relayUrls);

    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.ensureConnected).toHaveBeenCalledWith(relayUrls);
  });
});
