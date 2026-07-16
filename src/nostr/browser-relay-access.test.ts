import { afterEach, describe, expect, it, vi } from "vitest";
import type { Event, Filter } from "nostr-tools";
import { RelayPool } from "./relay-pool";
import { RelayWorkflowCollector } from "./evidence/relay-workflow-collector";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
}));

vi.mock("nostr-tools", () => ({
  Relay: {
    connect: mocks.connect,
  },
}));

type SubscriptionCallbacks = {
  onevent?: (event: Event) => void;
  oneose?: () => void;
  onclose?: (reason: string) => void;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function controlledRelay(url: string) {
  const callbacks: SubscriptionCallbacks[] = [];
  const subscriptions: Array<{
    close: ReturnType<typeof vi.fn>;
    id: string;
    receivedEose: ReturnType<typeof vi.fn>;
  }> = [];
  const relay = {
    url,
    connected: true,
    onclose: null as (() => void) | null,
    close: vi.fn(),
    publish: vi.fn(),
    subscribe: vi.fn((_filters: Filter[], params: SubscriptionCallbacks) => {
      callbacks.push(params);
      const subscription = {
        close: vi.fn(),
        id: `sub-${subscriptions.length + 1}`,
        receivedEose: vi.fn(() => params.oneose?.()),
      };
      subscriptions.push(subscription);
      return subscription;
    }),
  };
  return { callbacks, relay, subscriptions };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("RelayPool browser finite queries", () => {
  afterEach(() => {
    vi.useRealTimers();
    mocks.connect.mockReset();
  });

  it("settles an empty target set without opening a connection or timer", async () => {
    vi.useFakeTimers();
    const pool = new RelayPool();

    const query = pool.startFiniteQuery({
      workflowOwner: "wired.browser.thread",
      filters: [{ kinds: [1] }],
      coverage: { configuredRelayUrls: [] },
      completionDeadlineMs: 1_000,
      onEvent: vi.fn(),
    });

    await expect(query.done).resolves.toEqual({
      reason: "settled",
      targets: [],
      receivedEvents: 0,
    });
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("normalizes and unions configured and hinted coverage without narrowing", async () => {
    const first = controlledRelay("wss://one.example/");
    const hinted = controlledRelay("wss://hint.example/");
    mocks.connect.mockImplementation((url: string) =>
      Promise.resolve(url === first.relay.url ? first.relay : hinted.relay)
    );
    const pool = new RelayPool();

    const query = pool.startFiniteQuery({
      workflowOwner: "wired.browser.thread",
      filters: [{ ids: ["1".repeat(64)] }],
      coverage: {
        configuredRelayUrls: ["WSS://ONE.EXAMPLE", "wss://one.example/"],
        hintedRelayUrls: ["wss://hint.example", "wss://one.example"],
      },
      completionDeadlineMs: 1_000,
      onEvent: vi.fn(),
    });
    await flushPromises();

    expect(mocks.connect.mock.calls.map(([url]) => url)).toEqual([
      "wss://one.example/",
      "wss://hint.example/",
    ]);
    first.callbacks[0]?.oneose?.();
    hinted.callbacks[0]?.oneose?.();

    await expect(query.done).resolves.toEqual({
      reason: "settled",
      targets: [
        { relayUrl: "wss://one.example/", state: "eose" },
        { relayUrl: "wss://hint.example/", state: "eose" },
      ],
      receivedEvents: 0,
    });
  });

  it("reports partial connection outcomes and streams events before EOSE", async () => {
    const connected = controlledRelay("wss://connected.example/");
    mocks.connect.mockImplementation((url: string) =>
      url === connected.relay.url
        ? Promise.resolve(connected.relay)
        : Promise.reject(new Error("offline"))
    );
    const onEvent = vi.fn();
    const pool = new RelayPool();

    const query = pool.startFiniteQuery({
      workflowOwner: "wired.browser.thread",
      filters: [{ kinds: [1] }],
      coverage: {
        configuredRelayUrls: [connected.relay.url, "wss://offline.example"],
      },
      completionDeadlineMs: 1_000,
      onEvent,
    });
    await flushPromises();

    const event = { id: "1".repeat(64) } as Event;
    connected.callbacks[0]?.onevent?.(event);
    expect(onEvent).toHaveBeenCalledWith(event, connected.relay.url);
    connected.callbacks[0]?.oneose?.();

    await expect(query.done).resolves.toEqual({
      reason: "settled",
      targets: [
        { relayUrl: connected.relay.url, state: "eose" },
        { relayUrl: "wss://offline.example/", state: "connect-failed" },
      ],
      receivedEvents: 1,
    });
  });

  it("reports terminal relay close exactly once before EOSE", async () => {
    const target = controlledRelay("wss://closed.example/");
    mocks.connect.mockResolvedValue(target.relay);
    const pool = new RelayPool();

    const query = pool.startFiniteQuery({
      workflowOwner: "wired.browser.thread",
      filters: [{ kinds: [1] }],
      coverage: { configuredRelayUrls: [target.relay.url] },
      completionDeadlineMs: 1_000,
      onEvent: vi.fn(),
    });
    await flushPromises();
    target.relay.onclose?.();
    target.callbacks[0]?.oneose?.();

    await expect(query.done).resolves.toEqual({
      reason: "settled",
      targets: [{ relayUrl: target.relay.url, state: "closed" }],
      receivedEvents: 0,
    });
  });

  it("cleans a subscription that reaches EOSE synchronously during setup", async () => {
    const target = controlledRelay("wss://synchronous.example/");
    target.relay.subscribe.mockImplementation((_filters, params) => {
      const subscription = {
        close: vi.fn(),
        id: "sub-synchronous",
        receivedEose: vi.fn(),
      };
      target.subscriptions.push(subscription);
      params.oneose?.();
      return subscription;
    });
    mocks.connect.mockResolvedValue(target.relay);
    const pool = new RelayPool();

    const query = pool.startFiniteQuery({
      workflowOwner: "wired.browser.thread",
      filters: [{ kinds: [1] }],
      coverage: { configuredRelayUrls: [target.relay.url] },
      completionDeadlineMs: 1_000,
      onEvent: vi.fn(),
    });

    await expect(query.done).resolves.toMatchObject({
      reason: "settled",
      targets: [{ relayUrl: target.relay.url, state: "eose" }],
    });
    expect(target.subscriptions[0]?.close).toHaveBeenCalledOnce();
  });

  it("closes a connection that arrives after the query deadline", async () => {
    vi.useFakeTimers();
    const late = controlledRelay("wss://late.example/");
    const connection = deferred<typeof late.relay>();
    mocks.connect.mockReturnValue(connection.promise);
    let evidenceTask: (() => void) | undefined;
    const recorder = new RelayWorkflowCollector();
    const pool = new RelayPool({
      workflowEvidence: recorder,
      scheduleEvidence(task) { evidenceTask = task; },
    });

    const query = pool.startFiniteQuery({
      workflowOwner: "wired.browser.thread",
      filters: [{ kinds: [1] }],
      coverage: { configuredRelayUrls: [late.relay.url] },
      completionDeadlineMs: 25,
      onEvent: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(25);

    await expect(query.done).resolves.toEqual({
      reason: "deadline",
      targets: [{ relayUrl: late.relay.url, state: "timed-out" }],
      receivedEvents: 0,
    });
    connection.resolve(late.relay);
    await flushPromises();
    expect(late.relay.close).toHaveBeenCalledOnce();
    expect(late.relay.subscribe).not.toHaveBeenCalled();
    evidenceTask?.();
    const [aggregate] = recorder.snapshot();
    expect(aggregate).toMatchObject({
      samples: 1,
      totals: expect.objectContaining({
        attempts: 1,
        targets: 1,
        timedOut: 1,
        connectionsOpened: 1,
        connectionsClosed: 1,
        lateConnectionsClosed: 1,
      }),
    });
    expect(Object.values(aggregate?.completionMs ?? {})).toEqual([1]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out a connected relay with no EOSE and cleans its subscription", async () => {
    vi.useFakeTimers();
    const silent = controlledRelay("wss://silent.example/");
    mocks.connect.mockResolvedValue(silent.relay);
    const pool = new RelayPool();

    const query = pool.startFiniteQuery({
      workflowOwner: "wired.browser.thread",
      filters: [{ kinds: [1] }],
      coverage: { configuredRelayUrls: [silent.relay.url] },
      completionDeadlineMs: 25,
      onEvent: vi.fn(),
    });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(25);

    await expect(query.done).resolves.toMatchObject({
      reason: "deadline",
      targets: [{ relayUrl: silent.relay.url, state: "timed-out" }],
    });
    expect(silent.subscriptions[0]?.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels before connection and makes close idempotent", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    controller.abort();
    const pool = new RelayPool();

    const query = pool.startFiniteQuery({
      workflowOwner: "wired.browser.thread",
      filters: [{ kinds: [1] }],
      coverage: { configuredRelayUrls: ["wss://cancelled.example"] },
      completionDeadlineMs: 1_000,
      signal: controller.signal,
      onEvent: vi.fn(),
    });
    query.close();
    query.close();

    await expect(query.done).resolves.toEqual({
      reason: "cancelled",
      targets: [{ relayUrl: "wss://cancelled.example/", state: "cancelled" }],
      receivedEvents: 0,
    });
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels an active query only after its subscription is cleaned", async () => {
    vi.useFakeTimers();
    const active = controlledRelay("wss://active.example/");
    mocks.connect.mockResolvedValue(active.relay);
    const pool = new RelayPool();
    const controller = new AbortController();
    const query = pool.startFiniteQuery({
      workflowOwner: "wired.browser.thread",
      filters: [{ kinds: [1] }],
      coverage: { configuredRelayUrls: [active.relay.url] },
      completionDeadlineMs: 1_000,
      signal: controller.signal,
      onEvent: vi.fn(),
    });
    await flushPromises();

    controller.abort();
    query.close();
    query.close();

    await expect(query.done).resolves.toMatchObject({
      reason: "cancelled",
      targets: [{ relayUrl: active.relay.url, state: "cancelled" }],
    });
    expect(active.subscriptions[0]?.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shares one in-flight connection across overlapping finite queries", async () => {
    const target = controlledRelay("wss://shared.example/");
    const connection = deferred<typeof target.relay>();
    mocks.connect.mockReturnValue(connection.promise);
    const pool = new RelayPool();
    const input = {
      workflowOwner: "wired.browser.thread" as const,
      filters: [{ kinds: [1] }],
      coverage: { configuredRelayUrls: [target.relay.url] },
      completionDeadlineMs: 1_000,
      onEvent: vi.fn(),
    };

    const first = pool.startFiniteQuery(input);
    const second = pool.startFiniteQuery(input);
    expect(mocks.connect).toHaveBeenCalledOnce();

    connection.resolve(target.relay);
    await flushPromises();
    expect(target.relay.subscribe).toHaveBeenCalledTimes(2);
    target.callbacks.forEach((callbacks) => callbacks.oneose?.());

    await expect(Promise.all([first.done, second.done])).resolves.toEqual([
      expect.objectContaining({ reason: "settled" }),
      expect.objectContaining({ reason: "settled" }),
    ]);
  });

  it("shares one normalized connection between finite and configured adapters", async () => {
    const target = controlledRelay("wss://shared-adapters.example/");
    const connection = deferred<typeof target.relay>();
    mocks.connect.mockReturnValue(connection.promise);
    const pool = new RelayPool();
    const finite = pool.startFiniteQuery({
      workflowOwner: "wired.browser.thread",
      filters: [{ kinds: [1] }],
      coverage: { configuredRelayUrls: ["WSS://SHARED-ADAPTERS.EXAMPLE"] },
      completionDeadlineMs: 1_000,
      onEvent: vi.fn(),
    });
    const configured = pool.connectConfigured(["wss://shared-adapters.example"]);

    expect(mocks.connect).toHaveBeenCalledOnce();
    connection.resolve(target.relay);
    await configured;
    await flushPromises();
    target.callbacks[0]?.oneose?.();
    await finite.done;
    pool.subscribe({ kinds: [0] }, vi.fn(), {
      relayUrls: ["wss://shared-adapters.example"],
    });

    expect(mocks.connect).toHaveBeenCalledOnce();
    expect(target.relay.subscribe).toHaveBeenCalledTimes(2);
    expect(target.relay.close).not.toHaveBeenCalled();
  });

  it("records bounded query terminal evidence after cleanup without changing results", async () => {
    const target = controlledRelay("wss://evidence.example/");
    mocks.connect.mockResolvedValue(target.relay);
    let evidenceTask: (() => void) | undefined;
    const recorder = { record: vi.fn() };
    const pool = new RelayPool({
      workflowEvidence: recorder,
      scheduleEvidence(task) { evidenceTask = task; },
    });
    const onEvent = vi.fn();
    const query = pool.startFiniteQuery({
      workflowOwner: "wired.browser.thread",
      filters: [{ kinds: [1] }],
      coverage: { configuredRelayUrls: [target.relay.url] },
      completionDeadlineMs: 1_000,
      onEvent,
    });
    await flushPromises();
    const event = { id: "a".repeat(64) } as Event;
    target.callbacks[0]?.onevent?.(event);
    target.callbacks[0]?.onevent?.(event);
    target.callbacks[0]?.oneose?.();

    await expect(query.done).resolves.toMatchObject({
      reason: "settled",
      receivedEvents: 2,
    });
    expect(target.subscriptions[0]?.close).toHaveBeenCalledOnce();
    expect(recorder.record).not.toHaveBeenCalled();
    evidenceTask?.();
    expect(recorder.record).toHaveBeenCalledWith(expect.objectContaining({
      workflowOwner: "wired.browser.thread",
      operation: "query",
      outcome: "completed",
      relay: expect.objectContaining({ requestsSent: 1, eventsReceived: 2 }),
      results: expect.objectContaining({ unique: 1, duplicates: 1 }),
      terminal: expect.objectContaining({ eose: 1 }),
    }));
  });

  it("drops failing query evidence without affecting completion", async () => {
    const target = controlledRelay("wss://failing-evidence.example/");
    mocks.connect.mockResolvedValue(target.relay);
    let evidenceTask: (() => void) | undefined;
    const pool = new RelayPool({
      workflowEvidence: { record() { throw new Error("collector unavailable"); } },
      scheduleEvidence(task) { evidenceTask = task; },
    });
    const query = pool.startFiniteQuery({
      workflowOwner: "wired.browser.feed",
      filters: [{ kinds: [1] }],
      coverage: { configuredRelayUrls: [target.relay.url] },
      completionDeadlineMs: 1_000,
      onEvent: vi.fn(),
    });
    await flushPromises();
    target.callbacks[0]?.oneose?.();

    await expect(query.done).resolves.toMatchObject({ reason: "settled" });
    expect(() => evidenceTask?.()).not.toThrow();
    expect(pool.workflowEvidenceStatus.dropped).toBe(1);
  });

  it("starts configured work immediately while a hinted connection is delayed", async () => {
    const configured = controlledRelay("wss://configured.example/");
    const hinted = controlledRelay("wss://hinted.example/");
    const hintedConnection = deferred<typeof hinted.relay>();
    mocks.connect.mockImplementation((url: string) =>
      url === configured.relay.url
        ? Promise.resolve(configured.relay)
        : hintedConnection.promise
    );
    const pool = new RelayPool();

    const query = pool.startFiniteQuery({
      workflowOwner: "wired.browser.thread",
      filters: [{ kinds: [1] }],
      coverage: {
        configuredRelayUrls: [configured.relay.url],
        hintedRelayUrls: [hinted.relay.url],
      },
      completionDeadlineMs: 1_000,
      onEvent: vi.fn(),
    });
    await flushPromises();

    expect(configured.relay.subscribe).toHaveBeenCalledOnce();
    configured.callbacks[0]?.oneose?.();
    let settled = false;
    void query.done.then(() => { settled = true; });
    await flushPromises();
    expect(settled).toBe(false);

    hintedConnection.resolve(hinted.relay);
    await flushPromises();
    expect(hinted.relay.subscribe).toHaveBeenCalledOnce();
    hinted.callbacks[0]?.oneose?.();

    await expect(query.done).resolves.toEqual({
      reason: "settled",
      targets: [
        { relayUrl: configured.relay.url, state: "eose" },
        { relayUrl: hinted.relay.url, state: "eose" },
      ],
      receivedEvents: 0,
    });
  });
});
