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
