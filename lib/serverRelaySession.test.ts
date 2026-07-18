import { afterEach, describe, expect, it, vi } from "vitest";
import type { Event, Filter } from "nostr-tools";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  useWebSocketImplementation: vi.fn(),
}));

vi.mock("nostr-tools", () => ({
  Relay: { connect: mocks.connect },
  useWebSocketImplementation: mocks.useWebSocketImplementation,
}));

import { withFiniteRelaySession } from "./serverRelaySession";

function controlledRelay(url: string) {
  return {
    url,
    connected: true,
    close: vi.fn(),
    subscribe: vi.fn(),
  };
}

type SubscriptionCallbacks = {
  onevent?: (event: Event) => void;
  oneose?: () => void;
  onclose?: (reason: string) => void;
};

function controlledQueryRelay(url: string) {
  const callbacks: SubscriptionCallbacks[] = [];
  const subscriptions: Array<{ close: ReturnType<typeof vi.fn> }> = [];
  const relay = controlledRelay(url);
  relay.subscribe.mockImplementation(
    (_filters: Filter[], params: SubscriptionCallbacks) => {
      callbacks.push(params);
      const subscription = { close: vi.fn() };
      subscriptions.push(subscription);
      return subscription;
    },
  );
  return { callbacks, relay, subscriptions };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("Wired server finite relay session", () => {
  afterEach(() => {
    vi.useRealTimers();
    mocks.connect.mockReset();
  });

  it("normalizes initial targets, reports connected reuse, and closes the session", async () => {
    const relay = controlledRelay("wss://one.example/");
    mocks.connect.mockResolvedValue(relay);

    const outcomes = await withFiniteRelaySession(
      {
        relayUrls: ["WSS://ONE.EXAMPLE", "wss://one.example/"],
        connectDeadlineMs: 1_000,
      },
      (session) => session.ensureRelays(["wss://one.example"], 1_000),
    );

    expect(mocks.connect).toHaveBeenCalledOnce();
    expect(outcomes).toEqual([
      { relayUrl: "wss://one.example/", state: "connected" },
    ]);
    expect(relay.close).toHaveBeenCalledOnce();
  });

  it("reports a connection deadline and closes a relay that arrives late", async () => {
    vi.useFakeTimers();
    const relay = controlledRelay("wss://late.example/");
    const connection = deferred<typeof relay>();
    mocks.connect.mockReturnValue(connection.promise);

    const operation = withFiniteRelaySession(
      {
        relayUrls: [relay.url],
        connectDeadlineMs: 25,
      },
      (session) => session.ensureRelays([relay.url], 25),
    );
    await vi.advanceTimersByTimeAsync(25);

    await expect(operation).resolves.toEqual([
      { relayUrl: relay.url, state: "timed-out" },
    ]);
    connection.resolve(relay);
    await flushPromises();

    expect(relay.close).toHaveBeenCalledOnce();
    expect(relay.subscribe).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports failed targets without preventing partial-relay success", async () => {
    const connected = controlledQueryRelay("wss://connected.example/");
    mocks.connect.mockImplementation((url: string) =>
      url === connected.relay.url
        ? Promise.resolve(connected.relay)
        : Promise.reject(new Error("offline")),
    );

    const result = await withFiniteRelaySession(
      {
        relayUrls: [connected.relay.url, "wss://offline.example"],
        connectDeadlineMs: 1_000,
      },
      async (session) => {
        const connectionOutcomes = await session.ensureRelays(
          [connected.relay.url, "wss://offline.example"],
          1_000,
        );
        const query = session.query({
          filters: [{ kinds: [1] }],
          deadlineMs: 1_000,
          onEvent: vi.fn(),
        });
        await flushPromises();
        connected.callbacks[0]?.oneose?.();
        return { connectionOutcomes, completion: await query };
      },
    );

    expect(result.connectionOutcomes).toEqual([
      { relayUrl: connected.relay.url, state: "connected" },
      { relayUrl: "wss://offline.example/", state: "connect-failed" },
    ]);
    expect(result.completion.targets).toEqual([
      { relayUrl: connected.relay.url, state: "eose" },
      { relayUrl: "wss://offline.example/", state: "connect-failed" },
    ]);
  });

  it("settles immediately when every relay connection fails", async () => {
    vi.useFakeTimers();
    mocks.connect.mockRejectedValue(new Error("offline"));

    const result = await withFiniteRelaySession(
      {
        relayUrls: ["wss://one.example", "wss://two.example"],
        connectDeadlineMs: 1_000,
      },
      async (session) => ({
        connectionOutcomes: await session.ensureRelays(
          ["wss://one.example", "wss://two.example"],
          1_000,
        ),
        completion: await session.query({
          filters: [{ kinds: [1] }],
          deadlineMs: 1_000,
          onEvent: vi.fn(),
        }),
      }),
    );

    expect(result.connectionOutcomes).toEqual([
      { relayUrl: "wss://one.example/", state: "connect-failed" },
      { relayUrl: "wss://two.example/", state: "connect-failed" },
    ]);
    expect(result.completion).toEqual({
      reason: "settled",
      targets: [
        { relayUrl: "wss://one.example/", state: "connect-failed" },
        { relayUrl: "wss://two.example/", state: "connect-failed" },
      ],
      receivedEvents: 0,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("streams finite-query events and settles every target after cleanup", async () => {
    const first = controlledQueryRelay("wss://one.example/");
    const second = controlledQueryRelay("wss://two.example/");
    mocks.connect.mockImplementation((url: string) =>
      Promise.resolve(url === first.relay.url ? first.relay : second.relay),
    );
    const onEvent = vi.fn();

    const completion = await withFiniteRelaySession(
      {
        relayUrls: [first.relay.url, second.relay.url],
        connectDeadlineMs: 1_000,
      },
      async (session) => {
        const query = session.query({
          filters: [{ kinds: [1] }],
          deadlineMs: 1_000,
          onEvent,
        });
        await flushPromises();
        const event = { id: "1".repeat(64) } as Event;
        first.callbacks[0]?.onevent?.(event);
        second.callbacks[0]?.onevent?.(event);
        first.callbacks[0]?.oneose?.();
        second.callbacks[0]?.oneose?.();
        return query;
      },
    );

    expect(onEvent).toHaveBeenNthCalledWith(1, expect.anything(), first.relay.url);
    expect(onEvent).toHaveBeenNthCalledWith(2, expect.anything(), second.relay.url);
    expect(completion).toEqual({
      reason: "settled",
      targets: [
        { relayUrl: first.relay.url, state: "eose" },
        { relayUrl: second.relay.url, state: "eose" },
      ],
      receivedEvents: 2,
    });
    expect(first.subscriptions[0]?.close).toHaveBeenCalledOnce();
    expect(second.subscriptions[0]?.close).toHaveBeenCalledOnce();
    expect(first.relay.close).toHaveBeenCalledOnce();
    expect(second.relay.close).toHaveBeenCalledOnce();
  });

  it("settles a relay close before EOSE without waiting for the deadline", async () => {
    vi.useFakeTimers();
    const target = controlledQueryRelay("wss://closed.example/");
    mocks.connect.mockResolvedValue(target.relay);

    const completion = await withFiniteRelaySession(
      { relayUrls: [target.relay.url], connectDeadlineMs: 1_000 },
      async (session) => {
        const query = session.query({
          filters: [{ kinds: [1] }],
          deadlineMs: 1_000,
          onEvent: vi.fn(),
        });
        await flushPromises();
        target.callbacks[0]?.onclose?.("relay closed");
        return query;
      },
    );

    expect(completion).toEqual({
      reason: "settled",
      targets: [{ relayUrl: target.relay.url, state: "closed" }],
      receivedEvents: 0,
    });
    expect(target.subscriptions[0]?.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans a subscription that reaches EOSE during subscribe setup", async () => {
    const target = controlledQueryRelay("wss://synchronous.example/");
    target.relay.subscribe.mockImplementation((_filters, params) => {
      const subscription = { close: vi.fn() };
      target.subscriptions.push(subscription);
      params.oneose?.();
      return subscription;
    });
    mocks.connect.mockResolvedValue(target.relay);

    const completion = await withFiniteRelaySession(
      { relayUrls: [target.relay.url], connectDeadlineMs: 1_000 },
      (session) => session.query({
        filters: [{ kinds: [1] }],
        deadlineMs: 1_000,
        onEvent: vi.fn(),
      }),
    );

    expect(completion).toMatchObject({
      reason: "settled",
      targets: [{ relayUrl: target.relay.url, state: "eose" }],
    });
    expect(target.subscriptions[0]?.close).toHaveBeenCalledOnce();
  });

  it("times out a no-EOSE query only after closing its subscription", async () => {
    vi.useFakeTimers();
    const target = controlledQueryRelay("wss://silent.example/");
    mocks.connect.mockResolvedValue(target.relay);

    const operation = withFiniteRelaySession(
      { relayUrls: [target.relay.url], connectDeadlineMs: 1_000 },
      async (session) => {
        const query = session.query({
          filters: [{ kinds: [1] }],
          deadlineMs: 25,
          onEvent: vi.fn(),
        });
        await flushPromises();
        await vi.advanceTimersByTimeAsync(25);
        return query;
      },
    );

    await expect(operation).resolves.toEqual({
      reason: "deadline",
      targets: [{ relayUrl: target.relay.url, state: "timed-out" }],
      receivedEvents: 0,
    });
    expect(target.subscriptions[0]?.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels an active query after cleanup and ignores later events", async () => {
    vi.useFakeTimers();
    const target = controlledQueryRelay("wss://cancelled.example/");
    mocks.connect.mockResolvedValue(target.relay);
    const controller = new AbortController();
    const onEvent = vi.fn();

    const completion = await withFiniteRelaySession(
      { relayUrls: [target.relay.url], connectDeadlineMs: 1_000 },
      async (session) => {
        const query = session.query({
          filters: [{ kinds: [1] }],
          deadlineMs: 1_000,
          signal: controller.signal,
          onEvent,
        });
        await flushPromises();
        controller.abort();
        target.callbacks[0]?.onevent?.({ id: "2".repeat(64) } as Event);
        return query;
      },
    );

    expect(completion).toEqual({
      reason: "cancelled",
      targets: [{ relayUrl: target.relay.url, state: "cancelled" }],
      receivedEvents: 0,
    });
    expect(onEvent).not.toHaveBeenCalled();
    expect(target.subscriptions[0]?.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("adds dynamic hints and reuses their connections across sequential phases", async () => {
    const configured = controlledQueryRelay("wss://configured.example/");
    const hinted = controlledQueryRelay("wss://hinted.example/");
    mocks.connect.mockImplementation((url: string) =>
      Promise.resolve(url === configured.relay.url ? configured.relay : hinted.relay),
    );

    const outcomes = await withFiniteRelaySession(
      { relayUrls: [configured.relay.url], connectDeadlineMs: 1_000 },
      async (session) => {
        const hintOutcomes = await session.ensureRelays(
          [hinted.relay.url, "WSS://HINTED.EXAMPLE"],
          1_000,
        );
        const firstQuery = session.query({
          filters: [{ ids: ["1".repeat(64)] }],
          relayUrls: [configured.relay.url, hinted.relay.url],
          deadlineMs: 1_000,
          onEvent: vi.fn(),
        });
        await flushPromises();
        configured.callbacks[0]?.oneose?.();
        hinted.callbacks[0]?.oneose?.();
        const firstCompletion = await firstQuery;

        const secondQuery = session.query({
          filters: [{ ids: ["2".repeat(64)] }],
          relayUrls: [hinted.relay.url],
          deadlineMs: 1_000,
          onEvent: vi.fn(),
        });
        await flushPromises();
        hinted.callbacks[1]?.oneose?.();
        return { hintOutcomes, firstCompletion, secondCompletion: await secondQuery };
      },
    );

    expect(outcomes.hintOutcomes).toEqual([
      { relayUrl: hinted.relay.url, state: "connected" },
    ]);
    expect(outcomes.firstCompletion.reason).toBe("settled");
    expect(outcomes.secondCompletion).toMatchObject({
      reason: "settled",
      targets: [{ relayUrl: hinted.relay.url, state: "eose" }],
    });
    expect(mocks.connect).toHaveBeenCalledTimes(2);
    expect(hinted.relay.subscribe).toHaveBeenCalledTimes(2);
    expect(configured.relay.close).toHaveBeenCalledOnce();
    expect(hinted.relay.close).toHaveBeenCalledOnce();
  });

  it("cancels an unawaited connection when the session callback exits", async () => {
    vi.useFakeTimers();
    const late = controlledRelay("wss://cancelled-late.example/");
    const connection = deferred<typeof late>();
    mocks.connect.mockReturnValue(connection.promise);
    let dynamicOutcome: Promise<readonly unknown[]> | undefined;

    await withFiniteRelaySession(
      { relayUrls: [], connectDeadlineMs: 1_000 },
      (session) => {
        dynamicOutcome = session.ensureRelays([late.url], 1_000);
      },
    );

    await expect(dynamicOutcome).resolves.toEqual([
      { relayUrl: late.url, state: "cancelled" },
    ]);
    connection.resolve(late);
    await flushPromises();
    expect(late.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans active query handles before propagating a callback failure", async () => {
    vi.useFakeTimers();
    const target = controlledQueryRelay("wss://failed-workflow.example/");
    mocks.connect.mockResolvedValue(target.relay);
    let query: Promise<unknown> | undefined;

    await expect(withFiniteRelaySession(
      { relayUrls: [target.relay.url], connectDeadlineMs: 1_000 },
      async (session) => {
        query = session.query({
          filters: [{ kinds: [1] }],
          deadlineMs: 1_000,
          onEvent: vi.fn(),
        });
        await flushPromises();
        throw new Error("snapshot failed");
      },
    )).rejects.toThrow("snapshot failed");

    await expect(query).resolves.toMatchObject({ reason: "cancelled" });
    expect(target.subscriptions[0]?.close).toHaveBeenCalledOnce();
    expect(target.relay.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
