import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureRelaysConnected: vi.fn(),
  startFiniteQuery: vi.fn(),
}));

vi.mock("../client", () => ({
  ensureRelaysConnected: mocks.ensureRelaysConnected,
  getRegistry: () => ({ subscribe: vi.fn() }),
  initNostr: vi.fn(),
  PROFILE_RELAYS: ["wss://profiles.example"],
  startFiniteQuery: mocks.startFiniteQuery,
  THREAD_RELAYS: [],
}));

vi.mock("../../config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../config")>()),
  COMPLETE_PROFILE_BATCHES_ENABLED: true,
}));

import type { FiniteQuery } from "../browser-relay-access";
import { subProfilesOnce } from ".";

describe("profile finite query", () => {
  beforeEach(() => {
    mocks.ensureRelaysConnected.mockReset();
    mocks.ensureRelaysConnected.mockResolvedValue(undefined);
    mocks.startFiniteQuery.mockReset();
    mocks.startFiniteQuery.mockReturnValue({
      done: new Promise(() => {}),
      close: vi.fn(),
    });
  });

  it("owns the exact batched metadata filter across all configured relays", async () => {
    const pubkeys = ["a".repeat(64), "b".repeat(64)];
    const relayUrls = ["wss://profile-one.example", "wss://profile-two.example"];
    const onEose = vi.fn();
    const handle = await subProfilesOnce(pubkeys, vi.fn(), onEose, { relayUrls });

    expect(mocks.startFiniteQuery).toHaveBeenCalledOnce();
    const query = mocks.startFiniteQuery.mock.calls[0]?.[0] as FiniteQuery;
    expect(query).toMatchObject({
      workflowOwner: "wired.browser.profiles",
      filters: [{ authors: pubkeys, kinds: [0], limit: 2 }],
      coverage: { configuredRelayUrls: relayUrls, hintedRelayUrls: [] },
    });
    query.onComplete?.({ reason: "settled", targets: [], receivedEvents: 0 });
    expect(onEose).toHaveBeenCalledOnce();

    handle.close();
    expect(mocks.startFiniteQuery.mock.results[0]?.value.close).toHaveBeenCalledOnce();
  });

  it("reports cancellation as aggregate completion without calling EOSE", async () => {
    const onEose = vi.fn();
    const onComplete = vi.fn();
    await subProfilesOnce(["c".repeat(64)], vi.fn(), onEose, { onComplete });

    const query = mocks.startFiniteQuery.mock.calls[0]?.[0] as FiniteQuery;
    const completion = {
      reason: "cancelled" as const,
      targets: [{ relayUrl: "wss://profiles.example", state: "cancelled" as const }],
      receivedEvents: 0,
    };
    query.onComplete?.(completion);

    expect(onComplete).toHaveBeenCalledWith(completion);
    expect(onEose).not.toHaveBeenCalled();
  });

  it("reports mixed partial-terminal aggregate completion", async () => {
    const onEose = vi.fn();
    const onComplete = vi.fn();
    await subProfilesOnce(["d".repeat(64)], vi.fn(), onEose, { onComplete });

    const query = mocks.startFiniteQuery.mock.calls[0]?.[0] as FiniteQuery;
    const completion = {
      reason: "deadline" as const,
      targets: [
        { relayUrl: "wss://eose.example", state: "eose" as const },
        { relayUrl: "wss://closed.example", state: "closed" as const },
        { relayUrl: "wss://failed.example", state: "connect-failed" as const },
        { relayUrl: "wss://silent.example", state: "timed-out" as const },
      ],
      receivedEvents: 1,
    };
    query.onComplete?.(completion);

    expect(onComplete).toHaveBeenCalledWith(completion);
    expect(onEose).toHaveBeenCalledOnce();
  });

  it("deduplicates and completes profile authors in relay-safe chunks", async () => {
    const pubkeys = Array.from({ length: 251 }, (_, index) =>
      index.toString(16).padStart(64, "0")
    );
    const onEose = vi.fn();
    const onComplete = vi.fn();
    const relayUrls = ["wss://profile-one.example", "wss://profile-two.example"];
    await subProfilesOnce([...pubkeys, pubkeys[0]], vi.fn(), onEose, {
      onComplete,
      relayUrls,
    });

    expect(mocks.startFiniteQuery).toHaveBeenCalledTimes(2);
    const queries = mocks.startFiniteQuery.mock.calls.map((call) => call[0] as FiniteQuery);
    expect(queries.map((query) => query.filters)).toEqual([
      [{ authors: pubkeys.slice(0, 250), kinds: [0], limit: 250 }],
      [{ authors: pubkeys.slice(250), kinds: [0], limit: 1 }],
    ]);
    expect(queries.map((query) => query.coverage)).toEqual([
      { configuredRelayUrls: relayUrls, hintedRelayUrls: [] },
      { configuredRelayUrls: relayUrls, hintedRelayUrls: [] },
    ]);

    queries[0]?.onComplete?.({ reason: "settled", targets: [], receivedEvents: 250 });
    expect(onEose).not.toHaveBeenCalled();
    queries[1]?.onComplete?.({ reason: "settled", targets: [], receivedEvents: 1 });
    expect(onEose).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledWith({
      reason: "settled",
      targets: [],
      receivedEvents: 251,
    });
  });

  it("aggregates cancellation across profile chunks", async () => {
    const pubkeys = Array.from({ length: 251 }, (_, index) =>
      index.toString(16).padStart(64, "0")
    );
    const onEose = vi.fn();
    const onComplete = vi.fn();
    await subProfilesOnce(pubkeys, vi.fn(), onEose, { onComplete });
    const queries = mocks.startFiniteQuery.mock.calls.map((call) => call[0] as FiniteQuery);

    queries[0]?.onComplete?.({ reason: "settled", targets: [], receivedEvents: 250 });
    queries[1]?.onComplete?.({ reason: "cancelled", targets: [], receivedEvents: 0 });

    expect(onComplete).toHaveBeenCalledWith({
      reason: "cancelled",
      targets: [],
      receivedEvents: 250,
    });
    expect(onEose).not.toHaveBeenCalled();
  });

  it("closes earlier chunks when a later chunk cannot start", async () => {
    const firstHandle = { done: new Promise(() => {}), close: vi.fn() };
    mocks.startFiniteQuery
      .mockReturnValueOnce(firstHandle)
      .mockImplementationOnce(() => {
        throw new Error("second chunk failed to start");
      });
    const pubkeys = Array.from({ length: 251 }, (_, index) =>
      index.toString(16).padStart(64, "0")
    );

    await expect(subProfilesOnce(pubkeys, vi.fn())).rejects.toThrow(
      "second chunk failed to start",
    );
    expect(firstHandle.close).toHaveBeenCalledOnce();
  });
});
