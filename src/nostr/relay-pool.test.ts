import { afterEach, describe, expect, it, vi } from "vitest";
import { RelayWorkflowCollector } from "./evidence/relay-workflow-collector";
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
    close: vi.fn(),
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

  it("closes a legacy connection that arrives after its connect timeout", async () => {
    vi.useFakeTimers();
    const pool = new RelayPool();
    const lateRelay = relay("wss://late.example");
    let resolveConnection: ((value: typeof lateRelay) => void) | undefined;
    mocks.connect.mockReturnValue(new Promise((resolve) => {
      resolveConnection = resolve;
    }));

    const connecting = pool.ensureConnected([lateRelay.url]);
    await vi.advanceTimersByTimeAsync(4_000);
    await connecting;
    resolveConnection?.(lateRelay);
    await Promise.resolve();

    expect(lateRelay.close).toHaveBeenCalledOnce();
    expect(pool.connectedUrls).toEqual([]);
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

  it("reports live coverage and can deduplicate relay copies before parsing", async () => {
    const pool = new RelayPool();
    const firstRelay = relay("wss://first.example");
    const secondRelay = relay("wss://second.example");
    const subscription = () => ({
      close: vi.fn(),
      receivedEose: vi.fn(),
    });
    firstRelay.subscribe.mockImplementation(() => subscription());
    secondRelay.subscribe.mockImplementation(() => subscription());
    mocks.connect.mockImplementation((url: string) =>
      Promise.resolve(url === firstRelay.url ? firstRelay : secondRelay)
    );
    await pool.connect([firstRelay.url, secondRelay.url]);
    const onCoverage = vi.fn();

    pool.subscribe({ kinds: [1] }, vi.fn(), {
      relayUrls: [firstRelay.url, secondRelay.url],
      deduplicateEventIds: true,
      onCoverage,
    });

    expect(onCoverage).toHaveBeenCalledWith({ requested: 2, connected: 2 });
    const firstParams = firstRelay.subscribe.mock.calls[0]?.[1];
    const secondParams = secondRelay.subscribe.mock.calls[0]?.[1];
    expect(firstParams?.alreadyHaveEvent("a".repeat(64))).toBe(false);
    expect(secondParams?.alreadyHaveEvent("a".repeat(64))).toBe(true);
  });

  it("records browser publishing without changing accepted relays", async () => {
    const recorder = { record: vi.fn() };
    const acceptedRelay = relay("wss://accepted.example");
    acceptedRelay.publish.mockResolvedValue("accepted");
    mocks.connect.mockImplementation((url: string) =>
      url === acceptedRelay.url
        ? Promise.resolve(acceptedRelay)
        : Promise.reject(new Error("offline"))
    );
    const pool = new RelayPool({ workflowEvidence: recorder });

    await pool.connect([acceptedRelay.url, "wss://offline.example"]);
    const accepted = await pool.publish({
      id: "1".repeat(64),
      pubkey: "2".repeat(64),
      sig: "3".repeat(128),
      kind: 1,
      created_at: 1,
      tags: [],
      content: "not exported",
    });

    expect(accepted).toEqual(new Set([acceptedRelay.url]));
    await vi.waitFor(() => expect(recorder.record).toHaveBeenCalledOnce());
    expect(recorder.record).toHaveBeenCalledWith(expect.objectContaining({
      workflowOwner: "wired.browser.publish",
      operation: "publish",
      outcome: "partial",
      work: { attempts: 1, targets: 2 },
      connections: expect.objectContaining({ reused: 1 }),
      publishing: expect.objectContaining({ acceptedCountBucket: "one" }),
      timingMs: { firstResult: null, completion: expect.any(Number) },
    }));
    expect(JSON.stringify(recorder.record.mock.calls)).not.toContain("not exported");
    expect(JSON.stringify(recorder.record.mock.calls)).not.toContain(acceptedRelay.url);
  });

  it("observes accepted publishes with a silent peer without settling delivery", async () => {
    vi.useFakeTimers();
    const acceptedRelay = relay("wss://accepted.example");
    const silentRelay = relay("wss://silent.example");
    acceptedRelay.publish.mockImplementation(() => new Promise<string>((resolve) => {
      setTimeout(() => resolve("accepted"), 5);
    }));
    let acknowledgeSilent: (() => void) | undefined;
    silentRelay.publish.mockImplementation(() => new Promise<string>((resolve) => {
      acknowledgeSilent = () => resolve("accepted");
    }));
    mocks.connect.mockImplementation((url: string) =>
      Promise.resolve(url === acceptedRelay.url ? acceptedRelay : silentRelay)
    );
    const collector = new RelayWorkflowCollector();
    const pool = new RelayPool({
      workflowEvidence: collector,
      publishObservationMs: 50,
    });
    await pool.connect([acceptedRelay.url, silentRelay.url]);

    let settled = false;
    const publishing = pool.publish({
      id: "7".repeat(64), pubkey: "2".repeat(64), sig: "3".repeat(128),
      kind: 1, created_at: 1, tags: [], content: "never exported",
    }).then((result) => {
      settled = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(50);
    await vi.runOnlyPendingTimersAsync();

    expect(settled).toBe(false);
    expect(collector.snapshot()).toEqual([
      expect.objectContaining({
        workflowOwner: "wired.browser.publish-observation",
        operation: "publish",
        outcome: "timed-out",
        samples: 1,
        totals: expect.objectContaining({ targets: 2, timedOut: 1 }),
        acceptedCountBuckets: { none: 0, one: 1, multiple: 0, all: 0 },
        firstResultMs: { "10": 1 },
        completionMs: { "50": 1 },
      }),
    ]);

    acknowledgeSilent?.();
    await expect(publishing).resolves.toEqual(
      new Set([acceptedRelay.url, silentRelay.url]),
    );
    await vi.advanceTimersByTimeAsync(0);
    const observations = collector.snapshot().filter(({ workflowOwner }) =>
      workflowOwner === "wired.browser.publish-observation"
    );
    expect(collector.snapshot()).toHaveLength(2);
    expect(observations).toEqual([
      expect.objectContaining({ outcome: "completed", samples: 1 }),
      expect.objectContaining({ outcome: "timed-out", samples: 1 }),
    ]);
    expect(JSON.stringify(observations)).not.toContain("never exported");
    expect(JSON.stringify(observations)).not.toContain(acceptedRelay.url);
  });

  it("observes zero-accept timeout and later rejection without settling early", async () => {
    vi.useFakeTimers();
    const firstRelay = relay("wss://first-silent.example");
    const secondRelay = relay("wss://second-silent.example");
    const rejectors: Array<() => void> = [];
    for (const target of [firstRelay, secondRelay]) {
      target.publish.mockImplementation(() => new Promise<string>((_resolve, reject) => {
        rejectors.push(() => reject(new Error("late rejection")));
      }));
    }
    mocks.connect.mockImplementation((url: string) =>
      Promise.resolve(url === firstRelay.url ? firstRelay : secondRelay)
    );
    const collector = new RelayWorkflowCollector();
    const pool = new RelayPool({
      workflowEvidence: collector,
      publishObservationMs: 50,
    });
    await pool.connect([firstRelay.url, secondRelay.url]);

    let settled = false;
    const publishing = pool.publish({
      id: "8".repeat(64), pubkey: "2".repeat(64), sig: "3".repeat(128),
      kind: 1, created_at: 1, tags: [], content: "event",
    }).then((result) => {
      settled = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(50);
    await vi.runOnlyPendingTimersAsync();

    expect(settled).toBe(false);
    expect(collector.snapshot()).toEqual([
      expect.objectContaining({
        workflowOwner: "wired.browser.publish-observation",
        outcome: "timed-out",
        totals: expect.objectContaining({ timedOut: 2, rejected: 0 }),
        acceptedCountBuckets: { none: 1, one: 0, multiple: 0, all: 0 },
        firstResultMs: { none: 1 },
      }),
    ]);

    rejectors.forEach((reject) => reject());
    await expect(publishing).resolves.toEqual(new Set());
    await vi.runOnlyPendingTimersAsync();
    expect(collector.snapshot()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        workflowOwner: "wired.browser.publish-observation",
        outcome: "failed",
        totals: expect.objectContaining({ rejected: 2 }),
      }),
    ]));
  });

  it("classifies an ACK delivered at the observation boundary as late", async () => {
    vi.useFakeTimers();
    const earlyRelay = relay("wss://early.example");
    const boundaryRelay = relay("wss://boundary.example");
    earlyRelay.publish.mockImplementation(() => new Promise<string>((resolve) => {
      setTimeout(() => resolve("accepted"), 5);
    }));
    boundaryRelay.publish.mockImplementation(() => new Promise<string>((resolve) => {
      setTimeout(() => resolve("accepted"), 50);
    }));
    mocks.connect.mockImplementation((url: string) =>
      Promise.resolve(url === earlyRelay.url ? earlyRelay : boundaryRelay)
    );
    const collector = new RelayWorkflowCollector();
    const pool = new RelayPool({
      workflowEvidence: collector,
      publishObservationMs: 50,
    });
    await pool.connect([earlyRelay.url, boundaryRelay.url]);

    const publishing = pool.publish({
      id: "b".repeat(64), pubkey: "2".repeat(64), sig: "3".repeat(128),
      kind: 1, created_at: 1, tags: [], content: "event",
    });
    await vi.advanceTimersByTimeAsync(50);
    await expect(publishing).resolves.toEqual(
      new Set([earlyRelay.url, boundaryRelay.url]),
    );
    await vi.runOnlyPendingTimersAsync();

    expect(collector.snapshot()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        workflowOwner: "wired.browser.publish-observation",
        outcome: "timed-out",
        totals: expect.objectContaining({ timedOut: 1 }),
        acceptedCountBuckets: { none: 0, one: 1, multiple: 0, all: 0 },
      }),
      expect.objectContaining({
        workflowOwner: "wired.browser.publish-observation",
        outcome: "completed",
        acceptedCountBuckets: { none: 0, one: 0, multiple: 0, all: 1 },
      }),
    ]));
  });

  it("does not emit a timeout for fully rejected or observation-disabled publishes", async () => {
    vi.useFakeTimers();
    const rejectedRelay = relay("wss://rejected.example");
    rejectedRelay.publish.mockRejectedValue(new Error("blocked"));
    mocks.connect.mockResolvedValue(rejectedRelay);
    const observedCollector = new RelayWorkflowCollector();
    const observedPool = new RelayPool({
      workflowEvidence: observedCollector,
      publishObservationMs: 50,
    });
    await observedPool.connect([rejectedRelay.url]);

    await expect(observedPool.publish({
      id: "9".repeat(64), pubkey: "2".repeat(64), sig: "3".repeat(128),
      kind: 1, created_at: 1, tags: [], content: "event",
    })).resolves.toEqual(new Set());
    await vi.advanceTimersByTimeAsync(50);
    expect(observedCollector.snapshot().some(({ workflowOwner }) =>
      workflowOwner === "wired.browser.publish-observation"
    )).toBe(false);

    let releaseSilent: (() => void) | undefined;
    rejectedRelay.publish.mockImplementation(() => new Promise<string>((resolve) => {
      releaseSilent = () => resolve("accepted");
    }));
    const disabledCollector = new RelayWorkflowCollector();
    const disabledPool = new RelayPool({ workflowEvidence: disabledCollector });
    await disabledPool.connect([rejectedRelay.url]);
    const publishing = disabledPool.publish({
      id: "a".repeat(64), pubkey: "2".repeat(64), sig: "3".repeat(128),
      kind: 1, created_at: 1, tags: [], content: "event",
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(disabledCollector.snapshot()).toEqual([]);
    releaseSilent?.();
    await publishing;
    await vi.runOnlyPendingTimersAsync();
    expect(disabledCollector.snapshot().some(({ workflowOwner }) =>
      workflowOwner === "wired.browser.publish-observation"
    )).toBe(false);
  });

  it("does not let a failing recorder affect browser publication", async () => {
    const connectedRelay = relay("wss://accepted.example");
    connectedRelay.publish.mockResolvedValue("accepted");
    mocks.connect.mockResolvedValue(connectedRelay);
    let evidenceTask: (() => void) | undefined;
    const recorder = { record: vi.fn(() => { throw new Error("collector full"); }) };
    const pool = new RelayPool({
      workflowEvidence: recorder,
      scheduleEvidence(task) { evidenceTask = task; },
    });

    await pool.connect([connectedRelay.url]);

    await expect(pool.publish({
      id: "1".repeat(64),
      pubkey: "2".repeat(64),
      sig: "3".repeat(128),
      kind: 1,
      created_at: 1,
      tags: [],
      content: "event",
    })).resolves.toEqual(new Set([connectedRelay.url]));
    expect(recorder.record).not.toHaveBeenCalled();
    expect(() => evidenceTask?.()).not.toThrow();
    expect(recorder.record).toHaveBeenCalledOnce();
    expect(pool.workflowEvidenceStatus.dropped).toBe(1);
  });

  it("counts evidence discarded by a failing scheduler", async () => {
    const connectedRelay = relay("wss://accepted.example");
    connectedRelay.publish.mockResolvedValue("accepted");
    mocks.connect.mockResolvedValue(connectedRelay);
    const pool = new RelayPool({
      workflowEvidence: { record: vi.fn() },
      scheduleEvidence() { throw new Error("scheduler unavailable"); },
    });
    await pool.connect([connectedRelay.url]);

    await expect(pool.publish({
      id: "6".repeat(64), pubkey: "2".repeat(64), sig: "3".repeat(128),
      kind: 1, created_at: 1, tags: [], content: "event",
    })).resolves.toEqual(new Set([connectedRelay.url]));
    expect(pool.workflowEvidenceStatus).toEqual({ pending: 0, dropped: 1 });
  });

  it("captures rejection state when each relay settles", async () => {
    const rejectedRelay = relay("wss://rejected.example");
    const delayedRelay = relay("wss://delayed.example");
    rejectedRelay.publish.mockRejectedValue(new Error("blocked"));
    let releaseDelayed: (() => void) | undefined;
    delayedRelay.publish.mockImplementation(() => new Promise<string>((resolve) => {
      releaseDelayed = () => resolve("accepted");
    }));
    mocks.connect.mockImplementation((url: string) =>
      Promise.resolve(url === rejectedRelay.url ? rejectedRelay : delayedRelay)
    );
    let evidenceTask: (() => void) | undefined;
    const recorder = { record: vi.fn() };
    const pool = new RelayPool({
      workflowEvidence: recorder,
      scheduleEvidence(task) { evidenceTask = task; },
    });
    await pool.connect([rejectedRelay.url, delayedRelay.url]);

    const publishing = pool.publish({
      id: "4".repeat(64), pubkey: "2".repeat(64), sig: "3".repeat(128),
      kind: 1, created_at: 1, tags: [], content: "event",
    });
    await vi.waitFor(() => expect(rejectedRelay.publish).toHaveBeenCalled());
    rejectedRelay.connected = false;
    releaseDelayed?.();
    await publishing;
    evidenceTask?.();

    expect(recorder.record).toHaveBeenCalledWith(expect.objectContaining({
      terminal: expect.objectContaining({ closed: 0 }),
      publishing: expect.objectContaining({ rejected: 1 }),
    }));
  });

  it("bounds deferred evidence and queues only immutable primitives", async () => {
    const connectedRelay = relay("wss://accepted.example");
    connectedRelay.publish.mockResolvedValue("accepted");
    mocks.connect.mockResolvedValue(connectedRelay);
    let flushEvidence: (() => void) | undefined;
    const recorder = { record: vi.fn() };
    const pool = new RelayPool({
      workflowEvidence: recorder,
      scheduleEvidence(task) { flushEvidence = task; },
    });
    await pool.connect([connectedRelay.url]);
    const mutableEvent = {
      id: "5".repeat(64), pubkey: "2".repeat(64), sig: "3".repeat(128),
      kind: 1, created_at: 1, tags: [], content: "short",
    };
    const originalBytes = new TextEncoder().encode(
      JSON.stringify(["EVENT", mutableEvent]),
    ).byteLength;

    await pool.publish(mutableEvent);
    mutableEvent.content = "changed after settlement".repeat(1_000);
    for (let index = 0; index < 99; index += 1) {
      await pool.publish({ ...mutableEvent, id: index.toString(16).padStart(64, "0") });
    }

    expect(pool.workflowEvidenceStatus).toEqual({ pending: 100, dropped: 0 });
    flushEvidence?.();
    expect(recorder.record).toHaveBeenCalledTimes(100);
    expect(recorder.record.mock.calls[0]?.[0]).toMatchObject({
      relay: { eventBytesSent: originalBytes },
    });

    recorder.record.mockClear();
    for (let index = 0; index < 101; index += 1) {
      await pool.publish({
        ...mutableEvent,
        id: `a${index.toString(16)}`.padStart(64, "0"),
      });
    }
    expect(pool.workflowEvidenceStatus).toEqual({ pending: 100, dropped: 1 });
    flushEvidence?.();
    expect(pool.workflowEvidenceStatus).toEqual({ pending: 0, dropped: 1 });
    expect(recorder.record).toHaveBeenCalledTimes(100);
  });
});
