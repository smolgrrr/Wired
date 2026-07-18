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
});
