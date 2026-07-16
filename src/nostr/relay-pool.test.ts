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
    connected: true,
    onclose: null as (() => void) | null,
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

  it("settles open subscriptions and removes a terminal relay", async () => {
    const pool = new RelayPool();
    const connectedRelay = relay("wss://closed.example");
    const subscription = {
      receivedEose: vi.fn(),
      close: vi.fn(),
      oneose: undefined as (() => void) | undefined,
      onclose: undefined as ((reason: string) => void) | undefined,
    };
    connectedRelay.subscribe.mockImplementation((_filters, params) => {
      subscription.onclose = params.onclose;
      return subscription;
    });
    mocks.connect.mockResolvedValue(connectedRelay);

    await pool.connect([connectedRelay.url]);
    pool.subscribe({ kinds: [1] }, vi.fn(), { onEose: vi.fn() });
    connectedRelay.onclose?.();

    expect(subscription.receivedEose).toHaveBeenCalledOnce();
    expect(pool.connectedUrls).toEqual([]);
  });
});
