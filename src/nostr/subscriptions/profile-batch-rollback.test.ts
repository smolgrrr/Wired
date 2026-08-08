import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  startFiniteQuery: vi.fn(),
}));

vi.mock("../client", () => ({
  ensureRelaysConnected: vi.fn(),
  getRegistry: () => ({ subscribe: vi.fn() }),
  initNostr: vi.fn(),
  PROFILE_RELAYS: ["wss://profiles.example"],
  startFiniteQuery: mocks.startFiniteQuery,
  THREAD_RELAYS: [],
}));

import type { FiniteQuery } from "../browser-relay-access";
import { subProfilesOnce } from ".";

describe("profile batch rollback", () => {
  beforeEach(() => {
    mocks.startFiniteQuery.mockReset();
    mocks.startFiniteQuery.mockReturnValue({
      done: new Promise(() => {}),
      close: vi.fn(),
    });
  });

  it("restores the legacy single capped query when complete batches are disabled", async () => {
    const pubkeys = Array.from({ length: 251 }, (_, index) =>
      index.toString(16).padStart(64, "0")
    );
    await subProfilesOnce([...pubkeys, pubkeys[0]], vi.fn());

    expect(mocks.startFiniteQuery).toHaveBeenCalledOnce();
    const query = mocks.startFiniteQuery.mock.calls[0]?.[0] as FiniteQuery;
    expect(query.filters).toEqual([{
      authors: [...pubkeys, pubkeys[0]],
      kinds: [0],
      limit: 250,
    }]);
  });
});
