import { afterEach, describe, expect, it, vi } from "vitest";
import type { Event, Filter } from "nostr-tools";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
}));

vi.mock("nostr-tools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("nostr-tools")>();
  return {
    ...actual,
    Relay: { connect: mocks.connect },
    useWebSocketImplementation: vi.fn(),
  };
});

import { fetchThreadEventsFromRelays } from "./threadPreview";

type SubscriptionCallbacks = {
  onevent?: (event: Event) => void;
  oneose?: () => void;
  onclose?: (reason: string) => void;
};

function controlledRelay(url: string) {
  const callbacks: SubscriptionCallbacks[] = [];
  const subscriptions: Array<{
    close: ReturnType<typeof vi.fn>;
    receivedEose: ReturnType<typeof vi.fn>;
  }> = [];
  const relay = {
    url,
    connected: true,
    close: vi.fn(),
    subscribe: vi.fn((_filters: Filter[], params: SubscriptionCallbacks) => {
      callbacks.push(params);
      const subscription = {
        close: vi.fn(),
        receivedEose: vi.fn(() => params.oneose?.()),
      };
      subscriptions.push(subscription);
      return subscription;
    }),
  };
  return { callbacks, relay, subscriptions };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("thread preview relay compatibility", () => {
  afterEach(() => {
    vi.useRealTimers();
    mocks.connect.mockReset();
  });

  it("does not open relay connections for a pre-aborted preview", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    controller.abort();

    await expect(fetchThreadEventsFromRelays("1".repeat(64), [], {
      configuredRelayUrls: ["wss://preview.example"],
      timeoutMs: 1_000,
      signal: controller.signal,
    })).resolves.toEqual([]);

    expect(mocks.connect).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("settles an abort during connection and closes the relay if it arrives late", async () => {
    vi.useFakeTimers();
    const target = controlledRelay("wss://pending.example/");
    const connection = deferred<typeof target.relay>();
    mocks.connect.mockReturnValue(connection.promise);
    const controller = new AbortController();
    const result = fetchThreadEventsFromRelays("1".repeat(64), [], {
      configuredRelayUrls: [target.relay.url],
      timeoutMs: 1_000,
      signal: controller.signal,
    });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);

    await expect(result).resolves.toEqual([]);
    expect(target.relay.subscribe).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    connection.resolve(target.relay);
    await flushPromises();
    expect(target.relay.close).toHaveBeenCalledOnce();
  });

  it("cancels an active preview query after closing its owned handles", async () => {
    vi.useFakeTimers();
    const target = controlledRelay("wss://preview.example/");
    mocks.connect.mockResolvedValue(target.relay);
    const controller = new AbortController();
    const result = fetchThreadEventsFromRelays("1".repeat(64), [], {
      configuredRelayUrls: [target.relay.url],
      timeoutMs: 1_000,
      signal: controller.signal,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(target.relay.subscribe).toHaveBeenCalledOnce();

    try {
      controller.abort();
      await flushPromises();
      expect(target.subscriptions[0]?.close).toHaveBeenCalledOnce();
      expect(target.relay.close).toHaveBeenCalledOnce();
      await expect(result).resolves.toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      await vi.advanceTimersByTimeAsync(1_000);
      await result;
    }
  });

  it("settles terminal close before EOSE and closes every session socket", async () => {
    vi.useFakeTimers();
    const completed = controlledRelay("wss://completed.example/");
    const closed = controlledRelay("wss://closed.example/");
    mocks.connect.mockImplementation((url: string) =>
      Promise.resolve(url === completed.relay.url ? completed.relay : closed.relay),
    );
    const result = fetchThreadEventsFromRelays("1".repeat(64), [], {
      configuredRelayUrls: [completed.relay.url, closed.relay.url],
      timeoutMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(0);

    completed.callbacks[0]?.oneose?.();
    closed.callbacks[0]?.onclose?.("relay closed");

    await expect(result).resolves.toEqual([]);
    expect(completed.subscriptions[0]?.close).toHaveBeenCalledOnce();
    expect(closed.subscriptions[0]?.close).toHaveBeenCalledOnce();
    expect(completed.relay.close).toHaveBeenCalledOnce();
    expect(closed.relay.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns partial events at the no-EOSE deadline and cleans every handle", async () => {
    vi.useFakeTimers();
    const silent = controlledRelay("wss://silent.example/");
    mocks.connect.mockResolvedValue(silent.relay);
    const result = fetchThreadEventsFromRelays("1".repeat(64), [], {
      configuredRelayUrls: [silent.relay.url],
      timeoutMs: 25,
    });
    await vi.advanceTimersByTimeAsync(0);
    const event = { id: "1".repeat(64) } as Event;
    silent.callbacks[0]?.onevent?.(event);
    await vi.advanceTimersByTimeAsync(25);

    await expect(result).resolves.toEqual([event]);
    expect(silent.subscriptions[0]?.close).toHaveBeenCalledOnce();
    expect(silent.relay.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns immediately when every relay connection fails", async () => {
    vi.useFakeTimers();
    mocks.connect.mockRejectedValue(new Error("offline"));

    await expect(fetchThreadEventsFromRelays("1".repeat(64), [], {
      configuredRelayUrls: ["wss://one.example", "wss://two.example"],
      timeoutMs: 1_000,
    })).resolves.toEqual([]);

    expect(vi.getTimerCount()).toBe(0);
  });

  it("closes a connection that arrives after the connection deadline", async () => {
    vi.useFakeTimers();
    const late = controlledRelay("wss://late.example/");
    const connection = deferred<typeof late.relay>();
    mocks.connect.mockReturnValue(connection.promise);
    const result = fetchThreadEventsFromRelays("1".repeat(64), [], {
      configuredRelayUrls: [late.relay.url],
      timeoutMs: 5,
    });
    await vi.advanceTimersByTimeAsync(5);

    await expect(result).resolves.toEqual([]);
    expect(late.relay.close).not.toHaveBeenCalled();
    connection.resolve(late.relay);
    await flushPromises();
    expect(late.relay.close).toHaveBeenCalledOnce();
    expect(late.relay.subscribe).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
