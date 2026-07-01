import { afterEach, describe, expect, it, vi } from "vitest";
import { RelayPool } from "./relay-pool";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
}));

vi.mock("nostr-tools", () => ({
  Relay: {
    connect: mocks.connect,
  },
}));

function relay(url: string) {
  return {
    url,
    subscribe: vi.fn(),
    publish: vi.fn(),
  };
}

describe("RelayPool", () => {
  afterEach(() => {
    vi.useRealTimers();
    mocks.connect.mockReset();
  });

  it("does not block all relay setup on a hanging relay connection", async () => {
    vi.useFakeTimers();
    const pool = new RelayPool();

    mocks.connect.mockImplementation((url: string) => {
      if (url === "wss://slow.example") {
        return new Promise(() => {});
      }
      return Promise.resolve(relay(url));
    });

    const connected = pool.ensureConnected([
      "wss://slow.example",
      "wss://fast.example",
    ]);

    await vi.advanceTimersByTimeAsync(4_000);
    await connected;

    expect(pool.connectedUrls).toEqual(["wss://fast.example"]);
  });
});
